import { oklabToLinear, rgbToOklab } from './oklab';

// Перенос цветового характера изображения-референса на фото — в OKLab:
//  • reinhard — совпадение среднего и разброса по каналам (Reinhard et al., 2001,
//    но в перцептивном OKLab вместо lαβ);
//  • histogram — посадка полных гистограмм каналов (точнее ловит «кривые» референса).
// Результат — функция цвета (r,g,b 0..255 → 0..255), её же можно запечь в LUT.

const RANGES = [[0, 1], [-0.4, 0.4], [-0.4, 0.4]];
const BINS = 512;

function sample(imageData, max = 160000) {
  const { data } = imageData; const n = data.length / 4;
  const step = Math.max(1, Math.floor(n / max));
  const out = [];
  for (let i = 0; i < n; i += step) { const o = i * 4; if (data[o + 3] > 16) out.push(rgbToOklab(data[o], data[o + 1], data[o + 2])); }
  return out;
}

function stats(labs) {
  const m = [0, 0, 0]; const s = [0, 0, 0];
  labs.forEach((p) => { for (let c = 0; c < 3; c += 1) m[c] += p[c]; });
  for (let c = 0; c < 3; c += 1) m[c] /= labs.length || 1;
  labs.forEach((p) => { for (let c = 0; c < 3; c += 1) s[c] += (p[c] - m[c]) ** 2; });
  for (let c = 0; c < 3; c += 1) s[c] = Math.sqrt(s[c] / (labs.length || 1)) || 1e-6;
  return { m, s };
}

function cdf(labs, c) {
  const [lo, hi] = RANGES[c]; const h = new Float64Array(BINS);
  labs.forEach((p) => { const b = Math.max(0, Math.min(BINS - 1, Math.floor(((p[c] - lo) / (hi - lo)) * BINS))); h[b] += 1; });
  let acc = 0; for (let i = 0; i < BINS; i += 1) { acc += h[i]; h[i] = acc / labs.length; }
  return h;
}

// Таблица «бин источника → значение референса» для гистограммного переноса.
function histMap(srcCdf, refCdf, c) {
  const [lo, hi] = RANGES[c]; const map = new Float32Array(BINS);
  let j = 0;
  for (let i = 0; i < BINS; i += 1) {
    while (j < BINS - 1 && refCdf[j] < srcCdf[i]) j += 1;
    map[i] = lo + ((j + 0.5) / BINS) * (hi - lo);
  }
  return map;
}

const toSrgb8 = (v) => {
  const x = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, x * 255));
};

export function makeTransfer(srcData, refData, { method = 'reinhard', keepLuma = false } = {}) {
  const S = sample(srcData); const R = sample(refData);
  let f;
  if (method === 'histogram') {
    const maps = [0, 1, 2].map((c) => histMap(cdf(S, c), cdf(R, c), c));
    f = (lab) => lab.map((v, c) => {
      const [lo, hi] = RANGES[c];
      const b = Math.max(0, Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo)) * BINS)));
      return maps[c][b];
    });
  } else {
    const a = stats(S); const b = stats(R);
    f = (lab) => lab.map((v, c) => (v - a.m[c]) * (b.s[c] / a.s[c]) + b.m[c]);
  }
  return (r, g, bl) => {
    const lab = rgbToOklab(r, g, bl);
    const o = f(lab);
    if (keepLuma) o[0] = lab[0];
    const lin = oklabToLinear(Math.max(0, Math.min(1, o[0])), o[1], o[2]);
    return [toSrgb8(lin[0]), toSrgb8(lin[1]), toSrgb8(lin[2])];
  };
}

export function applyTransfer(imageData, fn, mix = 1) {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = fn(d[i], d[i + 1], d[i + 2]);
    d[i] += (v[0] - d[i]) * mix; d[i + 1] += (v[1] - d[i + 1]) * mix; d[i + 2] += (v[2] - d[i + 2]) * mix;
  }
  return out;
}
