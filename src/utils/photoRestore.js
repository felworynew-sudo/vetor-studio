// Реставрация старых фото в браузере (onnxruntime-web: WebGPU, иначе WASM). Два режима:
//   «Классический» — открытые модели: YuNet находит лица → RestoreFormer++ восстанавливает каждое выровненное лицо и
//                    вклеивает обратно; весь кадр по желанию увеличивается Real-ESRGAN ×4.
//   «Vetor Restore» — наша собственная связка (restore-lab): texture → repair → достройка потерянного → лица → раскраска.
//                    Веса берутся из манифеста public/models/restore/vetor-restore.json; пока сети учатся, режим «в обучении».
// Математика (плитки, выравнивание, Lab) — в restoreMath.js и проверяется в node.

import { inpaint } from './inpaint';
import { loadSession, releaseAll } from './ortClient';
import {
  YUNET_SIZE, decodeYunet, yunetScale, scaleFace, faceToCrop, overhang, canvasMatrix, invertSimilarity, featherMask,
  tileApply, rgbToLab, labToRgb, matchColor, isGrayscale,
} from './restoreMath';

const BASE = `${import.meta.env.BASE_URL || '/'}models/restore/`;
const HF = 'https://huggingface.co/facefusion/models-3.0.0/resolve/main/';

export { releaseAll };

export const CLASSIC_MODELS = {
  yunet: { url: `${BASE}yunet.onnx`, mb: 0.2 },
  faces: { url: `${HF}restoreformer_plus_plus.onnx`, mb: 281 },
  esrganFp16: { url: `${HF}real_esrgan_x4_fp16.onnx`, mb: 34 },
  esrganFp32: { url: `${HF}real_esrgan_x4.onnx`, mb: 66 },
};

// Длинная сторона входа Real-ESRGAN: ×4 даёт до 4096 px на видеокарте; на процессоре (≈75 с на 96×96) — только совсем маленькие кадры
export const MAX_UPSCALE_IN = 1024;
export const MAX_UPSCALE_IN_CPU = 256;

export async function hasWebGpu() {
  try {
    return typeof navigator !== 'undefined' && !!navigator.gpu && !!(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function hasShaderF16() {
  try {
    const a = await navigator.gpu.requestAdapter();
    return !!a && !!a.features && a.features.has('shader-f16');
  } catch {
    return false;
  }
}

// ---------- загрузка моделей: onnxruntime-web живёт в воркере (ortClient) ----------

// ---------- холсты ----------

const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

export function toWorkCanvas(img, maxSide = 4096) {
  let w = img.naturalWidth || img.width; let h = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
  return { canvas: c, scaled: k < 1 };
}

// canvas → { chw: Float32Array(3·w·h) в [0,1], w, h }
export function canvasToChw(canvas) {
  const w = canvas.width; const h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const chw = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i += 1) { chw[i] = d[i * 4] / 255; chw[w * h + i] = d[i * 4 + 1] / 255; chw[2 * w * h + i] = d[i * 4 + 2] / 255; }
  return { chw, w, h };
}

export function chwToCanvas(chw, w, h) {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h); const d = img.data;
  const q = (v) => Math.min(255, Math.max(0, Math.round(v * 255)));
  for (let i = 0; i < w * h; i += 1) { d[i * 4] = q(chw[i]); d[i * 4 + 1] = q(chw[w * h + i]); d[i * 4 + 2] = q(chw[2 * w * h + i]); d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Кадр, дополненный зеркальным отражением на p пикселей со всех сторон (p ≤ min(w, h)).
function reflectPad(src, p) {
  const w = src.width; const h = src.height;
  const c = makeCanvas(w + 2 * p, h + 2 * p); const ctx = c.getContext('2d');
  // зеркальная копия, примыкающая слева/справа: отражённый кадр занимает [T − w, T]
  const origin = (i, n) => (i === 0 ? p : i < 0 ? p : p + 2 * n);
  for (let iy = -1; iy <= 1; iy += 1) {
    for (let ix = -1; ix <= 1; ix += 1) {
      ctx.save();
      ctx.translate(ix === 0 ? p : origin(ix, w), iy === 0 ? p : origin(iy, h));
      ctx.scale(ix === 0 ? 1 : -1, iy === 0 ? 1 : -1);
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    }
  }
  return c;
}

// ---------- лица ----------

export async function detectFaces(canvas) {
  const s = await loadSession('yunet', CLASSIC_MODELS.yunet.url, 'wasm'); // крошечная сеть: на процессоре быстрее, чем гонять через GPU
  const { k, nw, nh } = yunetScale(canvas.width, canvas.height);
  const sq = makeCanvas(YUNET_SIZE, YUNET_SIZE); const sctx = sq.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high'; sctx.drawImage(canvas, 0, 0, nw, nh);
  const px = sctx.getImageData(0, 0, YUNET_SIZE, YUNET_SIZE).data;
  const plane = YUNET_SIZE * YUNET_SIZE; const x = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) { x[i] = px[i * 4 + 2]; x[plane + i] = px[i * 4 + 1]; x[2 * plane + i] = px[i * 4]; } // BGR, 0..255, без нормализации
  const out = await s.run(x, [1, 3, YUNET_SIZE, YUNET_SIZE]);
  const arr = s.outputNames.map((n) => out[n].data);
  return decodeYunet(arr).map((f) => scaleFace(f, k)).sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3]);
}

const FEATHER = (() => { let c = null; return () => { if (!c) { const m = featherMask(512); c = makeCanvas(512, 512); const im = c.getContext('2d').createImageData(512, 512); for (let i = 0; i < m.length; i += 1) { im.data[i * 4] = 255; im.data[i * 4 + 1] = 255; im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = m[i]; } c.getContext('2d').putImageData(im, 0, 0); } return c; }; })();

// Выровненный кроп 512×512 из кадра: [canvas, подобие кадр→кроп].
export function alignedCrop(src, face, size = 512) {
  const m = faceToCrop(face.kps, size);
  const pad = overhang(m, size, src.width, src.height);
  const from = pad > 2 ? reflectPad(src, Math.min(pad + 2, Math.min(src.width, src.height) - 1)) : src;
  const p = from === src ? 0 : (from.width - src.width) / 2;
  const mm = { a: m.a, b: m.b, tx: m.tx - (m.a * p - m.b * p), ty: m.ty - (m.b * p + m.a * p) };
  const c = makeCanvas(size, size); const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(...canvasMatrix(mm)); ctx.drawImage(from, 0, 0);
  return { canvas: c, m };
}

// net(data Float32Array(3·512·512), 512) → Float32Array(3·512·512) того же диапазона. norm: 'pm1' ([-1,1]) или '01'.
export async function restoreFaces(src, faces, runFace, { norm = 'pm1', strength = 1, keepColor = true, onProgress, shouldStop } = {}) {
  const w = src.width; const h = src.height;
  const out = makeCanvas(w, h); out.getContext('2d').drawImage(src, 0, 0);
  const octx = out.getContext('2d');
  for (let i = 0; i < faces.length; i += 1) {
    if (shouldStop?.()) throw new Error('stopped');
    const { canvas: crop, m } = alignedCrop(src, faces[i]);
    const px = crop.getContext('2d').getImageData(0, 0, 512, 512).data;
    const plane = 512 * 512; const x = new Float32Array(3 * plane);
    for (let j = 0; j < plane; j += 1) for (let c = 0; c < 3; c += 1) { const v = px[j * 4 + c] / 255; x[c * plane + j] = norm === 'pm1' ? v * 2 - 1 : v; }
    // eslint-disable-next-line no-await-in-loop
    const y = await runFace(x);
    const rgb = new Float32Array(3 * plane); const ref = new Float32Array(3 * plane);
    for (let j = 0; j < plane; j += 1) {
      for (let c = 0; c < 3; c += 1) {
        const v = y[c * plane + j]; rgb[j * 3 + c] = Math.min(1, Math.max(0, norm === 'pm1' ? v * 0.5 + 0.5 : v)); ref[j * 3 + c] = px[j * 4 + c] / 255;
      }
    }
    const fixed = keepColor ? matchColor(rgb, ref) : rgb;
    const fc = makeCanvas(512, 512); const fctx = fc.getContext('2d'); const im = fctx.createImageData(512, 512);
    for (let j = 0; j < plane; j += 1) { im.data[j * 4] = Math.round(fixed[j * 3] * 255); im.data[j * 4 + 1] = Math.round(fixed[j * 3 + 1] * 255); im.data[j * 4 + 2] = Math.round(fixed[j * 3 + 2] * 255); im.data[j * 4 + 3] = 255; }
    fctx.putImageData(im, 0, 0);
    // вклейка: лицо и мягкая маска переводятся в кадр одним и тем же преобразованием
    const layer = makeCanvas(w, h); const lctx = layer.getContext('2d');
    lctx.imageSmoothingQuality = 'high';
    lctx.setTransform(...canvasMatrix(invertSimilarity(m))); lctx.drawImage(fc, 0, 0);
    lctx.globalCompositeOperation = 'destination-in'; lctx.drawImage(FEATHER(), 0, 0);
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalAlpha = Math.min(1, Math.max(0, strength)); octx.drawImage(layer, 0, 0); octx.globalAlpha = 1;
    onProgress?.((i + 1) / faces.length);
    // eslint-disable-next-line no-await-in-loop
    await nextFrame();
  }
  return out;
}

// ---------- Real-ESRGAN ×4 плитками (ядро + отступ, без швов) ----------

export async function esrganUpscale(src, run, { tile = 128, pad = 16, onProgress, shouldStop } = {}) {
  const w = src.width; const h = src.height; const S = 4;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const out = makeCanvas(w * S, h * S); const octx = out.getContext('2d');
  const total = Math.ceil(w / tile) * Math.ceil(h / tile); let done = 0;
  for (let y0 = 0; y0 < h; y0 += tile) {
    for (let x0 = 0; x0 < w; x0 += tile) {
      if (shouldStop?.()) throw new Error('stopped');
      const x1 = Math.min(w, x0 + tile); const y1 = Math.min(h, y0 + tile);
      const sx0 = Math.max(0, x0 - pad); const sy0 = Math.max(0, y0 - pad); const sx1 = Math.min(w, x1 + pad); const sy1 = Math.min(h, y1 + pad);
      const tw = sx1 - sx0; const th = sy1 - sy0;
      const px = sctx.getImageData(sx0, sy0, tw, th).data;
      const plane = tw * th; const x = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i += 1) { x[i] = px[i * 4] / 255; x[plane + i] = px[i * 4 + 1] / 255; x[2 * plane + i] = px[i * 4 + 2] / 255; }
      // eslint-disable-next-line no-await-in-loop
      const y = await run(x, tw, th);
      const ow = tw * S; const oh = th * S; const oplane = ow * oh;
      const cx = (x0 - sx0) * S; const cy = (y0 - sy0) * S; const cw = (x1 - x0) * S; const ch = (y1 - y0) * S;
      const img = octx.createImageData(cw, ch); const d = img.data;
      for (let yy = 0; yy < ch; yy += 1) {
        for (let xx = 0; xx < cw; xx += 1) {
          const si = (cy + yy) * ow + cx + xx; const di = (yy * cw + xx) * 4;
          for (let c = 0; c < 3; c += 1) d[di + c] = Math.min(255, Math.max(0, Math.round(y[c * oplane + si] * 255)));
          d[di + 3] = 255;
        }
      }
      octx.putImageData(img, x0 * S, y0 * S);
      done += 1; onProgress?.(done / total);
      // eslint-disable-next-line no-await-in-loop
      await nextFrame();
    }
  }
  return out;
}

// ---------- режим «Классический» ----------

// opts: { faces: bool, faceStrength 0..1, keepColor: bool, upscale: 'auto'|'on'|'off' }
// hooks: { onStage(name, info), onProgress(0..1), onDownload(got,total), shouldStop() }
export async function restoreClassic(srcCanvas, opts, hooks = {}) {
  const { onStage, onProgress, onDownload, shouldStop } = hooks;
  const gpu = await hasWebGpu();
  const device = gpu ? 'webgpu' : 'wasm';
  let cur = srcCanvas; const info = { faces: 0, upscaled: false, device, skippedUpscale: false };

  let found = [];
  if (opts.faces || opts.upscale === 'auto') {
    onStage?.('detect');
    found = (await detectFaces(cur)).filter((f) => f.score >= 0.6 && Math.min(f.box[2], f.box[3]) >= 32);
    info.faces = found.length;
  }
  if (opts.faces && found.length) {
    onStage?.('faces-load');
    const s = await loadSession('faces', CLASSIC_MODELS.faces.url, device, onDownload);
    onStage?.('faces', { count: found.length });
    cur = await restoreFaces(cur, found, async (x) => (await s.run(x, [1, 3, 512, 512], [s.outputNames[0]]))[s.outputNames[0]].data, {
      norm: 'pm1', strength: opts.faceStrength, keepColor: opts.keepColor, onProgress, shouldStop,
    });
  }
  const wantUp = opts.upscale === 'on' || (opts.upscale === 'auto' && !found.length);
  if (wantUp) {
    const cap = gpu ? MAX_UPSCALE_IN : MAX_UPSCALE_IN_CPU;
    if (Math.max(cur.width, cur.height) > cap) {
      info.skippedUpscale = cap;
    } else {
      const f16 = gpu && await hasShaderF16();
      // быстрая fp16-модель — только для видеокарты с shader-f16; при любом сбое откатываемся на fp32 + процессор
      const attempts = f16 ? [['esrgan16', CLASSIC_MODELS.esrganFp16, 'webgpu'], ['esrgan32', CLASSIC_MODELS.esrganFp32, 'wasm']] : [['esrgan32', CLASSIC_MODELS.esrganFp32, device]];
      let lastErr = null;
      for (let i = 0; i < attempts.length; i += 1) {
        const [key, m, dev] = attempts[i];
        try {
          onStage?.('upscale-load');
          const s = await loadSession(key, m.url, dev, onDownload); // eslint-disable-line no-await-in-loop
          onStage?.('upscale');
          cur = await esrganUpscale(cur, async (x, tw, th) => (await s.run(x, [1, 3, th, tw]))[s.outputNames[0]].data, { tile: s.device === 'webgpu' ? 192 : 96, onProgress, shouldStop }); // eslint-disable-line no-await-in-loop
          lastErr = null; break;
        } catch (e) {
          if (String(e.message) === 'stopped') throw e;
          lastErr = e;
        }
      }
      if (lastErr) throw lastErr;
      info.upscaled = true;
    }
  }
  return { canvas: cur, info };
}

// ---------- режим «Vetor Restore» ----------

export const VETOR_STAGES = ['texture', 'repair', 'inpaint', 'faces', 'colorize'];
export const VETOR_MANIFEST_URL = `${BASE}vetor-restore.json`;

// Манифест: { status: 'training'|'ready', note, base, nets: { texture|repair|faces|colorize: { file, mb } } }
export async function loadVetorManifest(url = VETOR_MANIFEST_URL) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const m = await res.json();
    const base = new URL(m.base || '.', new URL(url, window.location.href)).href;
    return { status: m.status || 'training', note: m.note || '', base, nets: m.nets || {}, version: m.version || '' };
  } catch {
    return { status: 'training', note: '', base: BASE, nets: {}, version: '' };
  }
}

// Модель >100 МБ лежит кусками (<файл>.0, .1, …): parts — их число; воркер склеит.
const netUrl = (man, name) => {
  const n = man.nets[name]; const full = new URL(n.file, man.base).href;
  return n.parts > 1 ? Array.from({ length: n.parts }, (_, i) => `${full}.${i}`) : full;
};

// Расширение маски «потеряно»: максимум в окне (2r+1)², порог уже применён.
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h); const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { let v = 0; for (let k = -r; k <= r && !v; k += 1) { const xx = x + k; if (xx >= 0 && xx < w && mask[y * w + xx]) v = 1; } tmp[y * w + x] = v; }
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { let v = 0; for (let k = -r; k <= r && !v; k += 1) { const yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1; } out[y * w + x] = v; }
  return out;
}

// Достройка потерянных мест PatchMatch'ем: только окрестность маски (рамка + поля), чтобы не гонять поиск по всему кадру.
// Слишком большая рамка (>1.5 Мпикс) пропускается — главный поток не должен подвисать на минуты.
function fillLost(chw, w, h, mask, onProgress) {
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return false;
  const M = 48;
  x0 = Math.max(0, x0 - M); y0 = Math.max(0, y0 - M); x1 = Math.min(w - 1, x1 + M); y1 = Math.min(h - 1, y1 + M);
  const cw = x1 - x0 + 1; const ch = y1 - y0 + 1;
  if (cw * ch > 1.5e6) return false;
  const rgb = new Float32Array(3 * cw * ch); const m = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const si = (y0 + y) * w + x0 + x; const di = y * cw + x;
      rgb[di * 3] = chw[si]; rgb[di * 3 + 1] = chw[w * h + si]; rgb[di * 3 + 2] = chw[2 * w * h + si]; m[di] = mask[si];
    }
  }
  const filled = inpaint(rgb, m, cw, ch, { onProgress });
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const di = y * cw + x; if (!m[di]) continue; // eslint-disable-line no-continue
      const si = (y0 + y) * w + x0 + x;
      chw[si] = filled[di * 3]; chw[w * h + si] = filled[di * 3 + 1]; chw[2 * w * h + si] = filled[di * 3 + 2];
    }
  }
  return true;
}

const blend = (a, b, k) => { for (let i = 0; i < a.length; i += 1) a[i] = Math.min(1, Math.max(0, a[i] * (1 - k) + b[i] * k)); };

// opts: { strength 0..1, texture, repair, inpaint, faces, faceStrength, color: 'auto'|'on'|'off', lostThr }
export async function restoreVetor(srcCanvas, man, opts, hooks = {}) {
  const { onStage, onProgress, onDownload, shouldStop } = hooks;
  const gpu = await hasWebGpu();
  const device = gpu ? 'webgpu' : 'wasm';
  const tile = gpu ? 512 : 256;
  const { chw, w, h } = canvasToChw(srcCanvas);
  const info = { stages: [], faces: 0, lostPixels: 0, colorized: false, device };
  const netRun = (s, outNames, c) => async (patch, pw, ph) => {
    const out = await s.run(patch, [1, c, ph, pw], outNames);
    const res = {}; outNames.forEach((n) => { const t = out[n]; res[n] = { data: t.data, c: t.dims[1] }; });
    return res;
  };
  const session = async (name) => { onStage?.(`${name}-load`); return loadSession(`vr-${name}`, netUrl(man, name), device, onDownload); };

  if (opts.texture && man.nets.texture) {
    const s = await session('texture'); onStage?.('texture');
    const r = await tileApply(netRun(s, ['rgb'], 3), chw, 3, w, h, { tile, overlap: 48, onProgress, shouldStop });
    blend(chw, r.rgb.data, opts.strength); info.stages.push('texture');
  }
  if (opts.repair && man.nets.repair) {
    const s = await session('repair'); onStage?.('repair');
    const r = await tileApply(netRun(s, ['rgb', 'light', 'lost', 'defect'], 3), chw, 3, w, h, { tile, overlap: 48, onProgress, shouldStop });
    blend(chw, r.rgb.data, opts.strength); info.stages.push('repair');
    if (opts.inpaint) {
      const lost = new Uint8Array(w * h); let n = 0;
      for (let i = 0; i < w * h; i += 1) if (r.lost.data[i] > (opts.lostThr ?? 0.5)) { lost[i] = 1; n += 1; }
      info.lostPixels = n;
      if (n > 0 && n < 0.4 * w * h) {
        onStage?.('inpaint'); await nextFrame();
        if (fillLost(chw, w, h, dilate(lost, w, h, 3), onProgress)) info.stages.push('inpaint');
      }
    }
  }
  let cur = chwToCanvas(chw, w, h);
  if (opts.faces && man.nets.faces) {
    onStage?.('detect');
    const found = (await detectFaces(cur)).filter((f) => f.score >= 0.6 && Math.min(f.box[2], f.box[3]) >= 32);
    info.faces = found.length;
    if (found.length) {
      const s = await session('faces'); onStage?.('faces', { count: found.length });
      cur = await restoreFaces(cur, found, async (x) => (await s.run(x, [1, 3, 512, 512], ['rgb'])).rgb.data, {
        norm: '01', strength: opts.faceStrength, keepColor: true, onProgress, shouldStop,
      });
      info.stages.push('faces');
    }
  }
  if (opts.color !== 'off' && man.nets.colorize) {
    const cur3 = canvasToChw(cur);
    const inter = new Float32Array(3 * w * h);
    for (let i = 0; i < w * h; i += 1) { inter[i * 3] = cur3.chw[i]; inter[i * 3 + 1] = cur3.chw[w * h + i]; inter[i * 3 + 2] = cur3.chw[2 * w * h + i]; }
    if (opts.color === 'on' || isGrayscale(inter, w, h)) {
      const s = await session('colorize'); onStage?.('colorize');
      const { L } = rgbToLab(inter);
      const f = Math.min(1, 512 / Math.max(w, h));
      // кратно 32: шаг ResNet-UNet, ONNX-граф паддинг внутри не пересчитывает
      const sw = Math.max(32, Math.round((w * f) / 32) * 32); const sh = Math.max(32, Math.round((h * f) / 32) * 32);
      const lc = makeCanvas(w, h); const lctx = lc.getContext('2d'); const li = lctx.createImageData(w, h);
      for (let i = 0; i < w * h; i += 1) { const v = Math.round(Math.min(1, Math.max(0, L[i])) * 255); li.data[i * 4] = v; li.data[i * 4 + 1] = v; li.data[i * 4 + 2] = v; li.data[i * 4 + 3] = 255; }
      lctx.putImageData(li, 0, 0);
      const sc = makeCanvas(sw, sh); const sctx = sc.getContext('2d', { willReadFrequently: true }); sctx.imageSmoothingQuality = 'high'; sctx.drawImage(lc, 0, 0, sw, sh);
      const sd = sctx.getImageData(0, 0, sw, sh).data; const x = new Float32Array(sw * sh);
      for (let i = 0; i < sw * sh; i += 1) x[i] = sd[i * 4] / 255;
      const ab = (await s.run(x, [1, 1, sh, sw], ['ab'])).ab.data; // (2, sh, sw), −1..1
      // ab растягиваем на весь кадр через холст (два канала → R, G)
      const ac = makeCanvas(sw, sh); const actx = ac.getContext('2d'); const ai = actx.createImageData(sw, sh);
      for (let i = 0; i < sw * sh; i += 1) { ai.data[i * 4] = Math.round((ab[i] * 0.5 + 0.5) * 255); ai.data[i * 4 + 1] = Math.round((ab[sw * sh + i] * 0.5 + 0.5) * 255); ai.data[i * 4 + 2] = 128; ai.data[i * 4 + 3] = 255; }
      actx.putImageData(ai, 0, 0);
      const bc = makeCanvas(w, h); const bctx = bc.getContext('2d', { willReadFrequently: true }); bctx.imageSmoothingQuality = 'high'; bctx.drawImage(ac, 0, 0, w, h);
      const bd = bctx.getImageData(0, 0, w, h).data; const abFull = new Float32Array(2 * w * h);
      for (let i = 0; i < w * h; i += 1) { abFull[i * 2] = (bd[i * 4] / 255 - 0.5) * 2; abFull[i * 2 + 1] = (bd[i * 4 + 1] / 255 - 0.5) * 2; }
      const rgb = labToRgb(L, abFull); // яркость — оригинальная, цвет только добавляется
      const outc = makeCanvas(w, h); const octx = outc.getContext('2d'); const oi = octx.createImageData(w, h);
      for (let i = 0; i < w * h; i += 1) { oi.data[i * 4] = Math.round(rgb[i * 3] * 255); oi.data[i * 4 + 1] = Math.round(rgb[i * 3 + 1] * 255); oi.data[i * 4 + 2] = Math.round(rgb[i * 3 + 2] * 255); oi.data[i * 4 + 3] = 255; }
      octx.putImageData(oi, 0, 0);
      cur = outc; info.colorized = true; info.stages.push('colorize');
    }
  }
  return { canvas: cur, info };
}
