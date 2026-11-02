// Воркер для onnxruntime-web: тяжёлый счёт нейросетей не блокирует страницу (прогресс и кнопка «Отменить» живые).
// Протокол: { id, type: 'load', key, url, device } → { id, ok, device, inputName, outputNames } (+ { id, progress: [got, total] } по ходу загрузки)
//           { id, type: 'run', key, data, dims, names } → { id, outputs: { имя: { data, dims } } }
//           { id, type: 'release', key }
// device 'webgpu' при неудаче сам откатывается на 'wasm' (если модель такое переживёт).

import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { fetchModel } from '../utils/modelCache';

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

async function load({ id, key, url, device }) {
  const old = sessions.get(key);
  if (old && old.device === device && JSON.stringify(old.url) === JSON.stringify(url)) return { ok: true, device: old.device, inputName: old.inputName, outputNames: old.outputNames };
  if (old) { try { await old.sess.release(); } catch { /* */ } sessions.delete(key); }
  const ort = await getOrt();
  const bytes = await fetchModel(url, (got, total) => self.postMessage({ id, progress: [got, total] }), CACHE);
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
