// Воркер разделения на стемы: Demucs v4 (onnxruntime-web, WebGPU → WASM) + дочистка.
// Протокол:
//   { type: 'split', chans: [L, R], quality: 'fast'|'best', clean: bool, strength } →
//     { type: 'progress', stage: 'model'|'split'|'clean', p } …
//     { type: 'done', stems: { drums|bass|other|vocals|residual: [L, R] }, device }
//   { type: 'encode', chans, sr, format: 'wav'|'mp3' } → { type: 'encoded', buffer }
//   { type: 'cancel' }

import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { fetchModel } from '../utils/modelCache';
import { separate, SR } from '../audio-engine/demucs';
import { cleanStems } from '../audio-engine/stemClean';
import { encodeMp3, encodeWav } from '../audio-engine/encode';

const MODEL = ['models/stems/htdemucs-v4.onnx.0', 'models/stems/htdemucs-v4.onnx.1'];
const CACHE = 'vetor-stem-models-v1';

let session = null; let ort = null; let device = '';
let cancelled = false;

async function ensureModel(base) {
  if (session) return;
  ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  ort.env.wasm.numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  const urls = MODEL.map((m) => new URL(m, base).href);
  const bytes = await fetchModel(urls, (got, total) => self.postMessage({ type: 'progress', stage: 'model', p: total ? got / total : 0 }), CACHE);
  let gpu = false;
  try { gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { gpu = false; }
  if (gpu) {
    try { session = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] }); device = 'webgpu'; return; } catch { session = null; }
  }
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }); device = 'wasm';
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') { cancelled = true; return; }
  try {
    if (msg.type === 'split') {
      cancelled = false;
      await ensureModel(msg.base);
      self.postMessage({ type: 'progress', stage: 'split', p: 0, device });
      const stems = await separate(session, ort, msg.chans, {
        shifts: msg.quality === 'best' ? 2 : 1,
        onProgress: (d, t) => self.postMessage({ type: 'progress', stage: 'split', p: d / t, device }),
        isCancelled: () => cancelled,
      });
      if (msg.clean) {
        self.postMessage({ type: 'progress', stage: 'clean', p: 0 });
        stems.residual = await cleanStems(stems, msg.chans, SR, {
          strength: msg.strength,
          onProgress: (d, t) => self.postMessage({ type: 'progress', stage: 'clean', p: d / t }),
          isCancelled: () => cancelled,
        });
      }
      const buffers = Object.values(stems).flatMap((chs) => chs.map((ch) => ch.buffer));
      self.postMessage({ type: 'done', stems, device }, buffers);
    } else if (msg.type === 'encode') {
      const buffer = msg.format === 'mp3' ? await encodeMp3(msg.chans, msg.sr, 320) : encodeWav(msg.chans, msg.sr, 24);
      self.postMessage({ type: 'encoded', id: msg.id, buffer }, [buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: String(err?.message || err) });
  }
};
