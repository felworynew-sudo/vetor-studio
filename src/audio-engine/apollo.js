// Нейро-реставрация музыки после MP3/AAC — модель Apollo (JusperLee/Apollo,
// CC-BY-SA-4.0), экспортированная нами в ONNX. Работает только на WebGPU:
// на процессоре модель слишком тяжёлая. Трек режется на куски с контекстом
// по краям, куски склеиваются плавным переходом.

// Классический бандл onnxruntime-web (JSEP): WebGPU и CPU в одном ядре. Новая
// «нативная» WebGPU-сборка (asyncify) в 1.26 теряла устройство посреди счёта.
import { biquad, filter, resample } from './dsp.js';
import { fetchCached } from './neural.js';

const SR = 44100;
// 4 с ядра + контекст: в fp16 на видеокарте укладывается в ~200 МБ; fp32 вдвое тяжелее — берём 2 с
const coreOf = (s) => (s && s.variant === 'fp32' ? SR * 2 : SR * 4);
const CTX = Math.round(SR * 0.5);
const FADE = Math.round(SR * 0.05);

let session = null;

// Для тестов: подставить поддельную сессию (без загрузки модели).
export function setApolloSessionForTest(s) { session = s; }
export const apolloVariant = () => session?.variant || '';

export async function hasWebGpu() {
  try {
    return typeof navigator !== 'undefined' && !!navigator.gpu && !!(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

// Быстрая fp16-версия модели требует на видеокарте shader-f16 (у части Intel его нет — результат
// получается пустым). Без него сразу берём fp32.
async function hasShaderF16() {
  try {
    const a = await navigator.gpu.requestAdapter();
    return !!a && !!a.features && a.features.has('shader-f16');
  } catch {
    return false;
  }
}

export async function gpuInfo() {
  try {
    const a = await navigator.gpu.requestAdapter();
    const i = a?.info || {};
    return [i.vendor, i.architecture || i.device].filter(Boolean).join(' ') || 'gpu';
  } catch {
    return 'gpu';
  }
}

// Предохранитель: Apollo лишь достраивает верх, низ спектра (ниже 0.6 среза) он менять
// не должен. Если после ФНЧ вход и выход не коррелируют или энергия уехала — это
// мусор (сбой видеокарты, драйвера, fp16): считаем кусок негодным.
function lowBandOk(inp, out, cutoffHz, sr) {
  const f = Math.max(300, Math.min(0.6 * (cutoffHz || 8000), 3500));
  const c = biquad('lowpass', f, sr, { q: 0.7071 });
  const x = filter(inp, c); const y = filter(out, c);
  let xy = 0; let xx = 0; let yy = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (!Number.isFinite(y[i])) return { ok: false, why: 'NaN' };
    xy += x[i] * y[i]; xx += x[i] * x[i]; yy += y[i] * y[i];
  }
  if (xx < 1e-8) return { ok: true }; // тишина
  const corr = xy / Math.sqrt(xx * yy + 1e-30);
  const ratio = yy / xx;
  if (ratio < 0.02) return { ok: false, why: 'silent' }; // видеокарта отдала пустоту
  return { ok: corr > 0.9 && ratio > 0.4 && ratio < 2.5, why: `corr ${corr.toFixed(2)}, энергия ×${ratio.toFixed(2)}` };
}

// device: 'webgpu' — видеокарта, 'wasm' — процессор (в ~20 раз медленнее реального времени)
// variant: 'fp16' (быстрая, 37 МБ) или 'fp32' (точная, 70 МБ); по умолчанию — по возможностям видеокарты.
export async function loadApollo(base, device = 'webgpu', { variant } = {}) {
  const want = variant || (device === 'webgpu' && !(await hasShaderF16()) ? 'fp32' : 'fp16');
  if (session && session.device === device && session.variant === want) return session;
  if (session && session.sess && session.sess.release) { try { await session.sess.release(); } catch { /* */ } }
  session = null;
  const ort = await import('onnxruntime-web');
  const ortWasmUrl = (await import('onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url')).default;
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  ort.env.wasm.numThreads = 1;
  const bytes = new Uint8Array(await fetchCached(`${base}apollo-44k-${want}.onnx`));
  const sess = await ort.InferenceSession.create(bytes, { executionProviders: [device] });
  session = { ort, sess, device, variant: want };
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
// cutoffHz — срез трека (для проверки куска), limitSec — потолок прогнозного времени.
// reload() — загрузить fp32-сессию, если быстрая fp16 дала мусор на самом первом куске (проверяется на реальных данных).
export async function apolloRestore(chans, sr, {
  onProgress, shouldStop, cutoffHz = 0, limitSec = Infinity, reload,
} = {}) {
  let s = session;
  if (!s) throw new Error('Apollo не загружен');
  const src = sr === SR ? chans : chans.map((c) => resample(c, sr, SR));
  const n = src[0].length;
  const res = src.map(() => new Float32Array(n));
  const weight = new Float32Array(n);
  let core = coreOf(s);
  let units = Math.ceil(n / core) * src.length; let done = 0;
  const t0 = Date.now(); let checked = false; let fellBack = false;
  let start = 0;
  while (start < n) {
    if (shouldStop?.()) throw new Error('skipped');
    const end = Math.min(n, start + core);
    // eslint-disable-next-line no-await-in-loop
    const { out, a, len } = await runChunk(s, src, Math.max(0, start - FADE), Math.min(n, end + FADE), () => { done += 1; onProgress?.(done / units); });
    // проверка куска ДО того, как он попадёт в результат (первый — обязательно, потом выборочно)
    const idx = Math.floor(start / core);
    if (!checked || idx % 4 === 0) {
      let bad = null;
      for (let c = 0; c < src.length && !bad; c += 1) {
        const lo = start - a; const hi = end - a;
        const chk = lowBandOk(src[c].subarray(start, end), out.subarray(c * len + lo, c * len + hi), cutoffHz, SR);
        if (!chk.ok) bad = chk.why;
      }
      if (bad) {
        // быстрая fp16 на этой видеокарте дала мусор — один раз пробуем точную fp32 с самого начала
        if (idx === 0 && !fellBack && reload && s.variant === 'fp16' && s.device === 'webgpu') {
          fellBack = true;
          // eslint-disable-next-line no-await-in-loop
          s = await reload();
          core = coreOf(s); units = Math.ceil(n / core) * src.length; done = 0; checked = false; start = 0;
          continue; // eslint-disable-line no-continue
        }
        throw new Error(`bad-output: ${bad}`);
      }
      checked = true;
    }
    if (idx === 0 && Number.isFinite(limitSec) && done > 0) {
      const projected = ((Date.now() - t0) / 1000) * (units / done);
      if (projected > limitSec) throw new Error(`too-slow:${Math.round(projected)}`);
    }
    for (let i = Math.max(0, start - FADE); i < Math.min(n, end + FADE); i += 1) {
      let w = 1;
      if (start > 0 && i < start + FADE) w = (i - (start - FADE)) / (2 * FADE);
      if (end < n && i > end - FADE) w = Math.min(w, ((end + FADE) - i) / (2 * FADE));
      for (let c = 0; c < res.length; c += 1) res[c][i] += out[c * len + (i - a)] * w;
      weight[i] += w;
    }
    start += core;
  }
  for (let i = 0; i < n; i += 1) {
    const w = weight[i] || 1;
    for (let c = 0; c < res.length; c += 1) res[c][i] /= w;
  }
  return sr === SR ? res : res.map((c, i) => resample(c, SR, sr).subarray(0, chans[i].length));
}
