// PixelGen (бета): генерация пиксель-арт спрайтов прямо в браузере. Диффузионная модель PixelGen v2
// (28 млн параметров, обучена с нуля), ONNX + onnxruntime-web: WebGPU, если есть, иначе процессор (WASM).
// Модель — v-prediction, DDIM, classifier-free guidance; один прогон считает сразу все варианты и
// условную/безусловную ветки в одном батче.

import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';

const CACHE = 'pixelgen-model-v1';
const BASE = `${import.meta.env.BASE_URL || '/'}models/pixelgen/`;

export const SIZES = [16, 24, 32, 48, 64];

export async function hasWebGpu() {
  try {
    return typeof navigator !== 'undefined' && !!navigator.gpu && !!(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

// Скачивание с прогрессом и кэшем браузера: 56 МБ модели грузятся один раз.
async function fetchBytes(url, onProgress) {
  let cache = null;
  try { if (typeof caches !== 'undefined') cache = await caches.open(CACHE); } catch { cache = null; }
  if (cache) {
    const hit = await cache.match(url);
    if (hit) { onProgress?.(1, 1); return new Uint8Array(await hit.arrayBuffer()); }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const copy = cache ? res.clone() : null;
  let bytes;
  if (res.body && total) {
    const reader = res.body.getReader();
    bytes = new Uint8Array(total);
    let got = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      if (got + value.length > bytes.length) { const grown = new Uint8Array(got + value.length); grown.set(bytes.subarray(0, got)); bytes = grown; }
      bytes.set(value, got); got += value.length;
      onProgress?.(got, total);
    }
    bytes = bytes.subarray(0, got);
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
    onProgress?.(bytes.length, bytes.length);
  }
  if (cache && copy) { try { await cache.put(url, copy); } catch { /* кэш переполнен — не страшно */ } }
  return bytes;
}

let loaded = null;

// device: 'webgpu' | 'wasm'
export function loadPixelGen(device, onProgress) {
  if (loaded && loaded.device === device) return loaded.promise;
  const promise = (async () => {
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
    // потоки нужны crossOriginIsolated; на обычном хостинге остаётся один
    ort.env.wasm.numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const [cfg, vocab] = await Promise.all([
      fetch(`${BASE}browser-config.json`).then((r) => { if (!r.ok) throw new Error('config'); return r.json(); }),
      fetch(`${BASE}vocabulary.json`).then((r) => { if (!r.ok) throw new Error('vocabulary'); return r.json(); }),
    ]);
    const bytes = await fetchBytes(`${BASE}${cfg.model}`, onProgress);
    const session = await ort.InferenceSession.create(bytes, { executionProviders: [device], graphOptimizationLevel: 'all' });
    return { ort, session, cfg, vocab, vocabSet: new Set(Object.keys(vocab)), device };
  })().catch((e) => { loaded = null; throw e; });
  loaded = { device, promise };
  return promise;
}

const canvasOf = (w, h, min) => Math.max(min, 2 ** Math.ceil(Math.log2(Math.max(w, h))));

function tokenize(text, vocab, length) {
  const ids = new BigInt64Array(length);
  (text.toLowerCase().match(/[a-z0-9]+/g) || []).slice(0, length).forEach((w, i) => { ids[i] = BigInt(vocab[w] ?? 1); });
  return ids;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
}

// Возвращает массив { width, height, pixels: Uint8ClampedArray RGBA } — по одному на вариант.
export async function generateSprites(gen, prompt, {
  width = 32, height = 32, count = 1, steps = 30, guidance = 1.5, seed = 1, onProgress, shouldStop,
} = {}) {
  const { ort, session, cfg, vocab } = gen;
  const side = canvasOf(width, height, cfg.minimum_canvas);
  const plane = side * side; const n = 4 * plane; const L = cfg.token_length; const B = count * 2;
  const x = new Float32Array(count * n);
  for (let c = 0; c < count; c += 1) {
    const u = rng(seed * 7919 + c * 104729 + 12345);
    for (let i = 0; i < n; i += 2) {
      const r = Math.sqrt(-2 * Math.log(u())); const a = 2 * Math.PI * u();
      x[c * n + i] = r * Math.cos(a); x[c * n + i + 1] = r * Math.sin(a);
    }
  }
  const ids = new BigInt64Array(B * L);
  const tok = tokenize(prompt, vocab, L);
  for (let c = 0; c < count; c += 1) ids.set(tok, c * L); // первые count — с текстом, остальные — пустой (безусловная ветка)
  const sizes = new Float32Array(B * 2);
  for (let b = 0; b < B; b += 1) { sizes[b * 2] = width / cfg.size_normalization; sizes[b * 2 + 1] = height / cfg.size_normalization; }
  const T = cfg.timesteps; const ab = cfg.alpha_bars;
  const seq = Array.from({ length: steps }, (_, i) => Math.round((T - 1) * (1 - i / (steps - 1))));
  const tIds = new ort.Tensor('int64', ids, [B, L]);
  const tSize = new ort.Tensor('float32', sizes, [B, 2]);
  const tRef = new ort.Tensor('float32', new Float32Array(B * 8 * plane), [B, 8, side, side]);
  const tFlags = new ort.Tensor('float32', new Float32Array(B * 2), [B, 2]);
  const both = new Float32Array(B * n);
  for (let i = 0; i < steps; i += 1) {
    if (shouldStop?.()) throw new Error('stopped');
    const t = seq[i];
    both.set(x, 0); both.set(x, count * n);
    // eslint-disable-next-line no-await-in-loop
    const out = await session.run({
      image: new ort.Tensor('float32', both, [B, 4, side, side]), ref: tRef, ref_flags: tFlags,
      timestep: new ort.Tensor('float32', new Float32Array(B).fill(t), [B]), token_ids: tIds, native_size: tSize,
    });
    const v = out.v.data;
    const a = Math.sqrt(ab[t]); const sd = Math.sqrt(1 - ab[t]);
    const an = i + 1 < steps ? ab[seq[i + 1]] : 1; const sa = Math.sqrt(an); const sn = Math.sqrt(1 - an);
    const off = count * n;
    for (let k = 0; k < count * n; k += 1) {
      const vv = v[off + k] + guidance * (v[k] - v[off + k]);
      const x0 = Math.max(-1, Math.min(1, a * x[k] - sd * vv)); const eps = sd * x[k] + a * vv;
      x[k] = sa * x0 + sn * eps;
    }
    out.v.dispose?.();
    onProgress?.((i + 1) / steps);
  }
  const results = [];
  const left = Math.floor((side - width) / 2); const top = Math.floor((side - height) / 2);
  for (let c = 0; c < count; c += 1) {
    const pixels = new Uint8ClampedArray(width * height * 4); const base = c * n;
    for (let y = 0; y < height; y += 1) {
      for (let xx = 0; xx < width; xx += 1) {
        const src = (y + top) * side + xx + left; const dst = (y * width + xx) * 4;
        const al = Math.max(0, Math.min(1, (x[base + 3 * plane + src] + 1) / 2));
        if (al < 0.5) continue;
        for (let ch = 0; ch < 3; ch += 1) pixels[dst + ch] = Math.round(Math.max(0, Math.min(1, (x[base + ch * plane + src] + 1) / 2 / al)) * 255);
        pixels[dst + 3] = 255;
      }
    }
    results.push({ width, height, pixels });
  }
  return results;
}

// ---- чистка результата ----

// Убирает одиночные «шумовые» пиксели и закрывает одиночные дырки в силуэте.
export function despeckle(img) {
  const { width: w, height: h, pixels: p } = img;
  const out = new Uint8ClampedArray(p);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && p[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4; const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => solid(x + dx, y + dy));
      if (p[i + 3] > 0 && nb.length === 0) out[i + 3] = 0; // одиночный пиксель
      else if (p[i + 3] === 0 && nb.length >= 3) { // дырка из 1 пикселя — берём средний цвет соседей
        let r = 0; let g = 0; let b = 0;
        nb.forEach(([dx, dy]) => { const j = ((y + dy) * w + x + dx) * 4; r += p[j]; g += p[j + 1]; b += p[j + 2]; });
        out[i] = r / nb.length; out[i + 1] = g / nb.length; out[i + 2] = b / nb.length; out[i + 3] = 255;
      }
    }
  }
  return { width: w, height: h, pixels: out };
}

// Сводит цвета к палитре из k цветов (k-means по частотам уникальных цветов). k = 0 — без изменений.
export function limitColors(img, k) {
  if (!k) return img;
  const { width: w, height: h, pixels: p } = img;
  const map = new Map();
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    const key = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2];
    map.set(key, (map.get(key) || 0) + 1);
  }
  const uniq = [...map.entries()].map(([key, c]) => ({ r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, c }));
  if (uniq.length <= k) return img;
  uniq.sort((a, b) => b.c - a.c);
  // старт — самые частые, далёкие друг от друга цвета
  const d2 = (a, b) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  const cents = [{ ...uniq[0] }];
  while (cents.length < k) {
    let best = null; let bs = -1;
    for (const u of uniq) { const m = Math.min(...cents.map((c) => d2(u, c))) * Math.sqrt(u.c); if (m > bs) { bs = m; best = u; } }
    cents.push({ ...best });
  }
  for (let it = 0; it < 8; it += 1) {
    const acc = cents.map(() => ({ r: 0, g: 0, b: 0, c: 0 }));
    for (const u of uniq) {
      let bi = 0; let bd = Infinity;
      cents.forEach((c, i) => { const d = d2(u, c); if (d < bd) { bd = d; bi = i; } });
      acc[bi].r += u.r * u.c; acc[bi].g += u.g * u.c; acc[bi].b += u.b * u.c; acc[bi].c += u.c;
    }
    acc.forEach((a, i) => { if (a.c) cents[i] = { r: a.r / a.c, g: a.g / a.c, b: a.b / a.c }; });
  }
  const out = new Uint8ClampedArray(p); const cache = new Map();
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    const key = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2]; let c = cache.get(key);
    if (!c) {
      let bd = Infinity; const px = { r: p[i], g: p[i + 1], b: p[i + 2] };
      c = cents[0]; cents.forEach((q) => { const d = d2(px, q); if (d < bd) { bd = d; c = q; } });
      cache.set(key, c);
    }
    out[i] = Math.round(c.r); out[i + 1] = Math.round(c.g); out[i + 2] = Math.round(c.b);
  }
  return { width: w, height: h, pixels: out };
}

export function toCanvas(img, scale = 1) {
  const c = document.createElement('canvas');
  c.width = img.width * scale; c.height = img.height * scale;
  const small = document.createElement('canvas'); small.width = img.width; small.height = img.height;
  small.getContext('2d').putImageData(new ImageData(img.pixels, img.width, img.height), 0, 0);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, c.width, c.height);
  return c;
}
