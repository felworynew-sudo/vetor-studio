// Клиент воркера onnxruntime-web (src/workers/ortWorker.js): тот же вид, что у обычной сессии, но счёт идёт вне главного потока.

let worker = null; let seq = 0;
const pending = new Map();

function ensure() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/ortWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data; const p = pending.get(m.id);
    if (!p) return;
    if (m.progress) { p.onProgress?.(m.progress[0], m.progress[1]); return; }
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error)); else p.resolve(m);
  };
  worker.onerror = (e) => {
    pending.forEach((p) => p.reject(new Error(e.message || 'worker error')));
    pending.clear(); worker = null; sessions.clear();
  };
  return worker;
}

function call(msg, transfer = [], onProgress) {
  const w = ensure(); seq += 1; const id = seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); w.postMessage({ id, ...msg }, transfer); });
}

const sessions = new Map();

// Возвращает { device, inputName, outputNames, run(data, dims, names?) → { имя: { data, dims } } }. Повторная загрузка того же key/url/device — мгновенная.
export function loadSession(key, url, device, onProgress) {
  const id = `${key}:${device}:${Array.isArray(url) ? url.join('|') : url}`;
  if (sessions.has(id)) return sessions.get(id);
  const p = call({ type: 'load', key, url, device }, [], onProgress).then((m) => ({
    device: m.device, inputName: m.inputName, outputNames: m.outputNames,
    // data передаётся воркеру без копии — после вызова исходный массив пуст
    async run(data, dims, names) { return (await call({ type: 'run', key, data, dims, names }, [data.buffer])).outputs; },
  })).catch((e) => { sessions.delete(id); throw e; });
  sessions.set(id, p);
  return p;
}

export async function releaseAll() {
  sessions.clear();
  if (!worker) return;
  try { await call({ type: 'release' }); } catch { /* */ }
  worker.terminate(); worker = null;
}
