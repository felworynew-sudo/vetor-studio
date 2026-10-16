// Нейро-реставрация музыки после MP3/AAC — модель Apollo (JusperLee/Apollo,
// CC-BY-SA-4.0), экспортированная нами в ONNX. Работает только на WebGPU:
// на процессоре модель слишком тяжёлая. Трек режется на куски с контекстом
// по краям, куски склеиваются плавным переходом.

// Классический бандл onnxruntime-web (JSEP): WebGPU и CPU в одном ядре. Новая
// «нативная» WebGPU-сборка (asyncify) в 1.26 теряла устройство посреди счёта.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { resample } from './dsp.js';
import { fetchCached } from './neural.js';

const SR = 44100;
const CORE = SR * 4; // 4 с ядра + контекст: на видеокарте укладывается в ~200 МБ
const CTX = Math.round(SR * 0.5);
const FADE = Math.round(SR * 0.05);

let session = null;

export async function hasWebGpu() {
  try {
    return typeof navigator !== 'undefined' && !!navigator.gpu && !!(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

// device: 'webgpu' — видеокарта, 'wasm' — процессор (в ~20 раз медленнее реального времени)
export async function loadApollo(base, device = 'webgpu') {
  if (session && session.device === device) return session;
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  ort.env.wasm.numThreads = 1;
  const bytes = new Uint8Array(await fetchCached(`${base}apollo-44k-fp16.onnx`));
  const sess = await ort.InferenceSession.create(bytes, { executionProviders: [device] });
  session = { ort, sess, device };
  return session;
}

async function runChunk(s, chans, start, end, onChannel) {
  const n = chans[0].length;
  const a = Math.max(0, start - CTX);
  const b = Math.min(n, end + CTX);
  const len = b - a;
  // каналы по одному — вдвое меньше памяти на видеокарте
  const out = new Float32Array(chans.length * len);
  for (let c = 0; c < chans.length; c += 1) {
    const input = new s.ort.Tensor('float32', chans[c].slice(a, b), [1, len]);
    // eslint-disable-next-line no-await-in-loop
    out.set((await s.sess.run({ audio: input })).restored.data, c * len);
    onChannel?.();
  }
  return { out, a, len };
}

// chans — каналы на частоте sr; возвращает восстановленные каналы той же длины.
// shouldStop() — проверяется между кусками: пользователь может пропустить долгий CPU-счёт.
export async function apolloRestore(chans, sr, { onProgress, shouldStop } = {}) {
  const s = session;
  if (!s) throw new Error('Apollo не загружен');
  const src = sr === SR ? chans : chans.map((c) => resample(c, sr, SR));
  const n = src[0].length;
  const res = src.map(() => new Float32Array(n));
  const weight = new Float32Array(n);
  const units = Math.ceil(n / CORE) * src.length; let done = 0;
  for (let start = 0; start < n; start += CORE) {
    if (shouldStop?.()) throw new Error('skipped');
    const end = Math.min(n, start + CORE);
    // eslint-disable-next-line no-await-in-loop
    const { out, a, len } = await runChunk(s, src, Math.max(0, start - FADE), Math.min(n, end + FADE), () => { done += 1; onProgress?.(done / units); });
    for (let i = Math.max(0, start - FADE); i < Math.min(n, end + FADE); i += 1) {
      let w = 1;
      if (start > 0 && i < start + FADE) w = (i - (start - FADE)) / (2 * FADE);
      if (end < n && i > end - FADE) w = Math.min(w, ((end + FADE) - i) / (2 * FADE));
      for (let c = 0; c < res.length; c += 1) res[c][i] += out[c * len + (i - a)] * w;
      weight[i] += w;
    }
  }
  for (let i = 0; i < n; i += 1) {
    const w = weight[i] || 1;
    for (let c = 0; c < res.length; c += 1) res[c][i] /= w;
  }
  return sr === SR ? res : res.map((c, i) => resample(c, SR, sr).subarray(0, chans[i].length));
}
