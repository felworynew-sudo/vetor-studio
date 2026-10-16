// Нейро-реставрация музыки после MP3/AAC — модель Apollo (JusperLee/Apollo,
// CC-BY-SA-4.0), экспортированная нами в ONNX. Работает только на WebGPU:
// на процессоре модель слишком тяжёлая. Трек режется на куски с контекстом
// по краям, куски склеиваются плавным переходом.

import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { resample } from './dsp.js';
import { fetchCached } from './neural.js';

const SR = 44100;
const CORE = SR * 8;
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

export async function loadApollo(base) {
  if (session) return session;
  const ort = await import('onnxruntime-web/webgpu');
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  ort.env.wasm.numThreads = 1;
  const bytes = new Uint8Array(await fetchCached(`${base}apollo-44k-fp16.onnx`));
  session = { ort, sess: await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] }) };
  return session;
}

async function runChunk(s, chans, start, end) {
  const n = chans[0].length;
  const a = Math.max(0, start - CTX);
  const b = Math.min(n, end + CTX);
  const len = b - a;
  const data = new Float32Array(chans.length * len);
  chans.forEach((c, i) => data.set(c.subarray(a, b), i * len));
  const input = new s.ort.Tensor('float32', data, [chans.length, len]);
  const out = (await s.sess.run({ audio: input })).restored.data;
  return { out, a, len };
}

// chans — каналы на частоте sr; возвращает восстановленные каналы той же длины.
export async function apolloRestore(chans, sr, { onProgress } = {}) {
  const s = session;
  if (!s) throw new Error('Apollo не загружен');
  const src = sr === SR ? chans : chans.map((c) => resample(c, sr, SR));
  const n = src[0].length;
  const res = src.map(() => new Float32Array(n));
  const weight = new Float32Array(n);
  for (let start = 0; start < n; start += CORE) {
    const end = Math.min(n, start + CORE);
    // eslint-disable-next-line no-await-in-loop
    const { out, a, len } = await runChunk(s, src, Math.max(0, start - FADE), Math.min(n, end + FADE));
    for (let i = Math.max(0, start - FADE); i < Math.min(n, end + FADE); i += 1) {
      let w = 1;
      if (start > 0 && i < start + FADE) w = (i - (start - FADE)) / (2 * FADE);
      if (end < n && i > end - FADE) w = Math.min(w, ((end + FADE) - i) / (2 * FADE));
      for (let c = 0; c < res.length; c += 1) res[c][i] += out[c * len + (i - a)] * w;
      weight[i] += w;
    }
    onProgress?.(end / n);
  }
  for (let i = 0; i < n; i += 1) {
    const w = weight[i] || 1;
    for (let c = 0; c < res.length; c += 1) res[c][i] /= w;
  }
  return sr === SR ? res : res.map((c, i) => resample(c, SR, sr).subarray(0, chans[i].length));
}
