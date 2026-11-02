// Demucs v4 (Hybrid Transformer, 4 стема: drums / bass / other / vocals) в браузере.
// Обвязка вокруг ONNX-модели портирована с bakkot/demucs-js (MIT, © Kevin Gibbons),
// та в свою очередь повторяет facebookresearch/demucs (MIT). Внутри ONNX — только сеть;
// STFT/iSTFT, нарезка на сегменты и склейка с треугольным окном — здесь, на JS.
// Отличия от оригинала: БПФ с таблицами (общий audio-engine/dsp), iSTFT по семантике
// torch (длина = length), режим shifts (усреднение по сдвигам, как в demucs), отмена.

import { fft } from './dsp.js';

export const SOURCES = ['drums', 'bass', 'other', 'vocals'];
export const SR = 44100;
export const SEGMENT = Math.floor(7.8 * SR); // 343980 — длина обучения модели
const HL = 1024; const NFFT = 4096; const FREQS = NFFT / 2; // последний бин модель не видит
const PAD = (HL / 2) * 3;
const LE = Math.ceil(SEGMENT / HL);
const WIN = (() => { const w = new Float32Array(NFFT); for (let i = 0; i < NFFT; i += 1) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / NFFT)); return w; })();
const NORM = 1 / Math.sqrt(NFFT);

// Отражающее дополнение как F.pad(mode='reflect') (длина сигнала здесь всегда больше паддинга).
function reflectPad(x, left, right) {
  const n = x.length; const out = new Float32Array(n + left + right);
  out.set(x, left);
  for (let i = 0; i < left; i += 1) out[i] = x[left - i];
  for (let i = 0; i < right; i += 1) out[left + n + i] = x[n - 2 - i];
  return out;
}

// spec(): комплексная спектрограмма канала, как HTDemucs._spec → [FREQS × LE] (re, im).
function specChannel(x) {
  const padded = reflectPad(x, PAD, PAD + LE * HL - x.length);
  const sig = reflectPad(padded, NFFT / 2, NFFT / 2); // center=True
  const re = new Float32Array(FREQS * LE); const im = new Float32Array(FREQS * LE);
  const fr = new Float64Array(NFFT); const fi = new Float64Array(NFFT);
  for (let t = 0; t < LE; t += 1) {
    const start = (t + 2) * HL; // z[..., 2:2+le]
    for (let i = 0; i < NFFT; i += 1) { fr[i] = sig[start + i] * WIN[i] * NORM; fi[i] = 0; }
    fft(fr, fi);
    for (let f = 0; f < FREQS; f += 1) { re[f * LE + t] = fr[f]; im[f * LE + t] = fi[f]; }
  }
  return { re, im };
}

// ispec(): обратное к specChannel, длина length (центр и отступы — как в HTDemucs._ispec).
function ispecChannel(re, im, reOff, imOff, length) {
  const frames = LE + 4; // F.pad(z, (2, 2)) по времени
  const total = HL * Math.ceil(length / HL) + 2 * PAD;
  const out = new Float32Array(total); const wsum = new Float32Array(total);
  const fr = new Float64Array(NFFT); const fi = new Float64Array(NFFT);
  const scale = Math.sqrt(NFFT);
  for (let t = 0; t < frames; t += 1) {
    const src = t - 2;
    fr.fill(0); fi.fill(0);
    if (src >= 0 && src < LE) {
      for (let f = 0; f < FREQS; f += 1) { fr[f] = re[reOff + f * LE + src]; fi[f] = im[imOff + f * LE + src]; }
      for (let f = 1; f < FREQS; f += 1) { fr[NFFT - f] = fr[f]; fi[NFFT - f] = -fi[f]; }
    }
    fft(fr, fi, true);
    const start = t * HL - NFFT / 2;
    for (let i = 0; i < NFFT; i += 1) {
      const o = start + i;
      if (o >= 0 && o < total) { out[o] += fr[i] * WIN[i] * scale; wsum[o] += WIN[i] * WIN[i]; }
    }
  }
  const y = new Float32Array(length);
  for (let i = 0; i < length; i += 1) { const w = wsum[PAD + i]; y[i] = w > 1e-8 ? out[PAD + i] / w : 0; }
  return y;
}

// Для теста: spec → ispec должен восстанавливать сигнал.
export function roundTrip(x) {
  const { re, im } = specChannel(x);
  return ispecChannel(re, im, 0, 0, x.length);
}

// Один сегмент: chans — 2 канала длины SEGMENT → [source][channel] Float32Array(SEGMENT).
async function inferSegment(session, ort, chans) {
  const mix = new Float32Array(2 * SEGMENT); mix.set(chans[0], 0); mix.set(chans[1], SEGMENT);
  const mag = new Float32Array(4 * FREQS * LE);
  for (let c = 0; c < 2; c += 1) {
    const { re, im } = specChannel(chans[c]);
    mag.set(re, (2 * c) * FREQS * LE); mag.set(im, (2 * c + 1) * FREQS * LE);
  }
  const [inMix, inMag] = session.inputNames;
  const res = await session.run({
    [inMix]: new ort.Tensor('float32', mix, [1, 2, SEGMENT]),
    [inMag]: new ort.Tensor('float32', mag, [1, 4, FREQS, LE]),
  });
  const outX = res[session.outputNames[0]].data; // [1, 4, 4, FREQS, LE] — маски re/im
  const outXt = res[session.outputNames[1]].data; // [1, 4, 2, SEGMENT] — временная ветка
  const plane = FREQS * LE;
  return SOURCES.map((_, s) => [0, 1].map((c) => {
    const base = (s * 4 + 2 * c) * plane;
    const y = ispecChannel(outX, outX, base, base + plane, SEGMENT);
    const tOff = (s * 2 + c) * SEGMENT;
    for (let i = 0; i < SEGMENT; i += 1) y[i] += outXt[tOff + i];
    return y;
  }));
}

// Разделение всего трека: chans — 2 канала 44.1 кГц. Перекрытие 25% и треугольное окно,
// как apply_model в demucs. shifts > 1 — усреднение по случайным сдвигам (чище, дольше).
export async function separate(session, ort, chans, { overlap = 0.25, shifts = 1, onProgress, isCancelled } = {}) {
  const length = chans[0].length;
  const out = SOURCES.map(() => [new Float32Array(length), new Float32Array(length)]);
  const stride = Math.floor((1 - overlap) * SEGMENT);
  const weight = new Float32Array(SEGMENT);
  const half = Math.floor(SEGMENT / 2);
  for (let i = 0; i < SEGMENT; i += 1) weight[i] = (i <= half ? i + 1 : SEGMENT - i) / (half + 1);
  const maxShift = Math.floor(0.5 * SR);
  const perShift = Math.ceil(length / stride);
  const total = perShift * shifts; let done = 0;
  const seg = [new Float32Array(SEGMENT), new Float32Array(SEGMENT)];

  // веса окна не зависят от сдвига — все проходы копим прямо в out и делим в конце
  const wsum = new Float32Array(length);
  for (let sh = 0; sh < shifts; sh += 1) {
    const shift = shifts > 1 ? Math.floor(Math.random() * maxShift) : 0;
    for (let offset = 0; offset < length; offset += stride) {
      if (isCancelled?.()) throw new Error('cancelled');
      const chunkLen = Math.min(SEGMENT, length - offset);
      // как TensorChunk.padded: окно SEGMENT вокруг куска, края — нули; сдвиг — как в demucs shifts
      const start = offset - Math.floor((SEGMENT - chunkLen) / 2) - shift;
      for (let c = 0; c < 2; c += 1) {
        const src = chans[c]; const dst = seg[c];
        for (let i = 0; i < SEGMENT; i += 1) { const k = start + i; dst[i] = k >= 0 && k < length ? src[k] : 0; }
      }
      // eslint-disable-next-line no-await-in-loop
      const y = await inferSegment(session, ort, seg);
      const trim = offset - start; // где внутри сегмента начинается наш кусок
      for (let s = 0; s < SOURCES.length; s += 1) {
        for (let c = 0; c < 2; c += 1) {
          const a = out[s][c]; const ys = y[s][c];
          for (let i = 0; i < chunkLen; i += 1) a[offset + i] += weight[i] * ys[trim + i];
        }
      }
      if (sh === 0) for (let i = 0; i < chunkLen; i += 1) wsum[offset + i] += weight[i];
      done += 1; onProgress?.(done, total);
    }
  }
  for (let s = 0; s < SOURCES.length; s += 1) {
    for (let c = 0; c < 2; c += 1) {
      const o = out[s][c];
      for (let i = 0; i < length; i += 1) o[i] /= wsum[i] * shifts;
    }
  }
  return Object.fromEntries(SOURCES.map((name, s) => [name, out[s]]));
}
