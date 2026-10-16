// Нейро-шумоподавление:
//  • DeepFilterNet3 (Schröter et al., MIT/Apache-2.0) — основной движок для речи.
//    WASM собран из официального libDF (tract), веса — официальные
//    DeepFilterNet3_onnx.tar.gz; оба файла лежат на нашем сайте и кешируются в
//    Cache Storage после первой загрузки.
//  • RNNoise (Xiph, BSD) — лёгкий и запасной вариант (если браузер без WASM SIMD).
// Обе модели работают на 48 кГц, моно-кадрами.

import { resample } from './dsp.js';

const CACHE = 'vetor-audio-models-v1';
// Алгоритмическая задержка DFN3 (STFT 960/480 + lookahead), измерена кросс-корреляцией на речи.
export const DFN_DELAY = 1440;

let dfn = null; let dfnPromise = null; let modelBytes = null;
const dfnStates = [];

export async function fetchCached(url) {
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) return hit.arrayBuffer();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      await cache.put(url, res.clone());
      return res.arrayBuffer();
    }
  } catch (e) {
    if (String(e.message || '').match(/^\d{3} /)) throw e;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
}

export function loadDfn(base, bytes) {
  if (dfnPromise) return dfnPromise;
  dfnPromise = (async () => {
    const mod = await import('./vendor/dfn3/df.js');
    let wasm; let model;
    if (bytes) ({ wasm, model } = bytes);
    else [wasm, model] = await Promise.all([fetchCached(`${base}df_bg.wasm`), fetchCached(`${base}dfn3-model.tar.gz.bin`)]);
    await mod.default(wasm);
    modelBytes = new Uint8Array(model);
    if (modelBytes[0] !== 0x1f || modelBytes[1] !== 0x8b) throw new Error('DeepFilterNet3: веса пришли не в gzip (сервер распаковал?)');
    dfn = mod;
    dfnState(0); // проверяем модель сразу, а не посреди обработки
    return true;
  })().catch((e) => { dfnPromise = null; dfn = null; throw e; });
  return dfnPromise;
}

function dfnState(i) {
  if (!dfnStates[i]) dfnStates[i] = dfn.df_create(modelBytes, 100);
  return dfnStates[i];
}

// x — моно-канал на частоте sr. Возвращает очищенный канал той же длины и частоты.
export async function dfnDenoise(x, sr, { attenLimDb = 100, postFilterBeta = 0, channel = 0, onProgress } = {}) {
  const src = sr === 48000 ? x : resample(x, sr, 48000);
  const st = dfnState(channel);
  dfn.df_set_atten_lim(st, attenLimDb);
  dfn.df_set_post_filter_beta(st, postFilterBeta);
  const hop = dfn.df_get_frame_length(st);
  const frame = new Float32Array(hop);
  // прогрев тишиной — сбрасывает рекуррентное состояние от предыдущего файла
  for (let i = 0; i < 40; i += 1) { frame.fill(0); dfn.df_process_frame(st, frame); }
  const total = src.length + DFN_DELAY;
  const out = new Float32Array(Math.ceil(total / hop) * hop);
  for (let s = 0, f = 0; s < total; s += hop, f += 1) {
    for (let i = 0; i < hop; i += 1) frame[i] = s + i < src.length ? src[s + i] : 0;
    out.set(dfn.df_process_frame(st, frame), s);
    if (onProgress && f % 400 === 0) {
      onProgress(s / total);
      await new Promise((r) => setTimeout(r, 0)); // eslint-disable-line no-await-in-loop
    }
  }
  const aligned = out.subarray(DFN_DELAY, DFN_DELAY + src.length);
  return sr === 48000 ? Float32Array.from(aligned) : resample(aligned, 48000, sr).subarray(0, x.length);
}

// ---------- RNNoise ----------
let rnPromise = null;
function loadRnnoise() {
  if (!rnPromise) rnPromise = import('@shiguredo/rnnoise-wasm').then((m) => m.Rnnoise.load()).catch((e) => { rnPromise = null; throw e; });
  return rnPromise;
}

export async function rnnoiseDenoise(x, sr, { mix = 1, onProgress } = {}) {
  const rn = await loadRnnoise();
  const src = sr === 48000 ? x : resample(x, sr, 48000);
  const N = rn.frameSize;
  const st = rn.createDenoiseState();
  const frame = new Float32Array(N);
  const wet = new Float32Array(src.length + 2 * N);
  for (let s = 0, f = 0; s < src.length + N; s += N, f += 1) {
    frame.fill(0);
    for (let i = 0; i < N && s + i < src.length; i += 1) frame[i] = src[s + i] * 32768;
    st.processFrame(frame);
    for (let i = 0; i < N; i += 1) wet[s + i] = frame[i] / 32768;
    if (onProgress && f % 1000 === 0) { onProgress(s / src.length); await new Promise((r) => setTimeout(r, 0)); } // eslint-disable-line no-await-in-loop
  }
  st.destroy();
  const out = new Float32Array(src.length);
  for (let j = 0; j < src.length; j += 1) out[j] = wet[j + N] * mix + src[j] * (1 - mix);
  return sr === 48000 ? out : resample(out, 48000, sr).subarray(0, x.length);
}
