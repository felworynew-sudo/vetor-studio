// Воркер для onnxruntime-web: тяжёлый счёт нейросетей не блокирует страницу (прогресс и кнопка «Отменить» живые).
// Протокол: { id, type: 'load', key, url, device } → { id, ok, device, inputName, outputNames } (+ { id, progress: [got, total] } по ходу загрузки)
//           { id, type: 'run', key, data, dims, names } → { id, outputs: { имя: { data, dims } } }
//           { id, type: 'release', key }
// device 'webgpu' при неудаче сам откатывается на 'wasm' (если модель такое переживёт).

import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';

const CACHE = 'vetor-restore-models-v3';
let ortPromise = null;
const sessions = new Map();

function getOrt() {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web').then((ort) => {
      ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
      ort.env.wasm.numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      return ort;
    });
  }
  return ortPromise;
}

// Кэш браузера хранит модель кусками по 32 МБ: одна запись в сотни мегабайт во многих браузерах падает с «internal error».
const CHUNK = 32 * 1024 * 1024;
// фрагмент после # Cache API отбрасывает — различаем записи параметром запроса
const meta = (url) => `${url}${url.includes('?') ? '&' : '?'}rr=meta`;
const part = (url, i) => `${url}${url.includes('?') ? '&' : '?'}rr=${i}`;

async function readCached(cache, url) {
  const m = await cache.match(meta(url));
  if (!m) return null;
  const { total, n } = await m.json();
  const out = new Uint8Array(total); let at = 0;
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await cache.match(part(url, i));
    if (!r) return null;
    // eslint-disable-next-line no-await-in-loop
    const b = new Uint8Array(await r.arrayBuffer());
    if (at + b.length > total) return null;
    out.set(b, at); at += b.length;
  }
  return at === total ? out : null;
}

async function writeCached(cache, url, bytes) {
  const n = Math.ceil(bytes.length / CHUNK);
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await cache.put(part(url, i), new Response(bytes.slice(i * CHUNK, (i + 1) * CHUNK), { headers: { 'content-type': 'application/octet-stream' } }));
  }
  await cache.put(meta(url), new Response(JSON.stringify({ total: bytes.length, n })));
}

// Скачивание с прогрессом и кэшем браузера: большие модели грузятся один раз.
async function fetchBytes(url, onProgress) {
  let cache = null;
  try { if (typeof caches !== 'undefined') cache = await caches.open(CACHE); } catch { cache = null; }
  if (cache) {
    try {
      const hit = await readCached(cache, url);
      if (hit) { onProgress(hit.length, hit.length); return hit; }
    } catch { /* битый кэш — качаем заново */ }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
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
      onProgress(got, total);
    }
    bytes = bytes.subarray(0, got);
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
    onProgress(bytes.length, bytes.length);
  }
  if (cache) { try { await writeCached(cache, url, bytes); } catch { /* кэш переполнен — не страшно */ } }
  return bytes;
}

async function load({ id, key, url, device }) {
  const old = sessions.get(key);
  if (old && old.device === device && old.url === url) return { ok: true, device: old.device, inputName: old.inputName, outputNames: old.outputNames };
  if (old) { try { await old.sess.release(); } catch { /* */ } sessions.delete(key); }
  const ort = await getOrt();
  const bytes = await fetchBytes(url, (got, total) => self.postMessage({ id, progress: [got, total] }));
  let used = device; let sess;
  try {
    sess = await ort.InferenceSession.create(bytes, { executionProviders: [device], graphOptimizationLevel: 'all' });
  } catch (e) {
    if (device !== 'webgpu') throw e;
    used = 'wasm';
    sess = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }
  const rec = { ort, sess, device: used, url, inputName: sess.inputNames[0], outputNames: [...sess.outputNames] };
  sessions.set(key, rec);
  return { ok: true, device: used, inputName: rec.inputName, outputNames: rec.outputNames };
}

async function run({ key, data, dims, names }) {
  const s = sessions.get(key);
  if (!s) throw new Error(`сессия ${key} не загружена`);
  const input = new s.ort.Tensor('float32', data, dims);
  const out = await (names ? s.sess.run({ [s.inputName]: input }, names) : s.sess.run({ [s.inputName]: input }));
  const outputs = {}; const transfer = [];
  Object.entries(out).forEach(([name, t]) => {
    const d = t.data instanceof Float32Array ? t.data : Float32Array.from(t.data);
    outputs[name] = { data: d, dims: [...t.dims] };
    if (d.buffer.byteLength === d.byteLength) transfer.push(d.buffer);
  });
  return { outputs, transfer };
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') self.postMessage({ id: m.id, ...(await load(m)) });
    else if (m.type === 'run') { const { outputs, transfer } = await run(m); self.postMessage({ id: m.id, outputs }, transfer); }
    else if (m.type === 'release') {
      const keys = m.key ? [m.key] : [...sessions.keys()];
      await Promise.all(keys.map(async (k) => { const s = sessions.get(k); sessions.delete(k); try { await s?.sess.release(); } catch { /* */ } }));
      self.postMessage({ id: m.id, ok: true });
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err) });
  }
};
