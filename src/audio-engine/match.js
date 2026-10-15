// Мастеринг по референсу (тот же класс задачи, что Matchering): средний спектр
// трека подводится к среднему спектру одного или нескольких референсов
// линейно-фазовым FIR, ширина стерео — к их соотношению Side/Mid, громкость — к их
// интегральной LUFS. Выше среза исходника ничего не «поднимаем» — там нет данных.

import { averageSpectrum, clamp, fft, frameRms, mixMono, percentile, smoothOctave } from './dsp.js';

const SPEC_N = 4096;

// Спектр только громких участков (тишина и паузы не искажают баланс).
export function profileOf(chans, sr) {
  const mono = mixMono(chans);
  const rms = frameRms(mono, SPEC_N);
  const thr = percentile(Array.from(rms).filter((v) => v > 1e-6), 0.35) || 0;
  const weights = (o) => {
    let s = 0; for (let i = o; i < o + SPEC_N && i < mono.length; i += 8) s += mono[i] * mono[i];
    return Math.sqrt(s / (SPEC_N / 8)) >= thr ? 1 : 0;
  };
  const db = smoothOctave(averageSpectrum(mono, SPEC_N, 1500, weights), sr, SPEC_N, 6);
  let mm = 0; let ss = 0;
  if (chans.length > 1) {
    const [L, R] = chans; const step = Math.max(1, Math.floor(L.length / 400000));
    for (let i = 0; i < L.length; i += step) { const m = (L[i] + R[i]) / 2; const s = (L[i] - R[i]) / 2; mm += m * m; ss += s * s; }
  }
  return { sr, db: Array.from(db), sideToMid: chans.length > 1 ? Math.sqrt(ss / (mm || 1)) : 0 };
}

// Усреднение профилей нескольких референсов (в дБ, после выравнивания уровня).
export function combineProfiles(profiles) {
  const norm = profiles.map((p) => normalizeDb(p.db, p.sr));
  const out = norm[0].map((_, k) => norm.reduce((s, d) => s + d[k], 0) / norm.length);
  const widths = profiles.filter((p) => p.sideToMid > 0).map((p) => p.sideToMid);
  return { sr: profiles[0].sr, db: out, normalized: true, sideToMid: widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0 };
}

function normalizeDb(db, sr) {
  const binHz = sr / SPEC_N;
  const k0 = Math.round(150 / binHz); const k1 = Math.round(6000 / binHz);
  let m = 0; for (let k = k0; k <= k1; k += 1) m += db[k]; m /= k1 - k0 + 1;
  return db.map((v) => v - m);
}

// Кривая коррекции (дБ на бин SPEC_N) от профиля трека к профилю референса.
export function correctionCurve(target, reference, { strength = 0.8, maxDb = 9, cutoffHz } = {}) {
  const sr = target.sr; const binHz = sr / SPEC_N;
  const t = normalizeDb(target.db, sr);
  const r = reference.normalized ? reference.db : normalizeDb(reference.db, reference.sr);
  const bins = t.length;
  const raw = new Float64Array(bins);
  for (let k = 0; k < bins; k += 1) {
    const f = k * binHz;
    let d = (r[Math.min(k, r.length - 1)] - t[k]) * strength;
    if (f < 25) d = 0;
    if (cutoffHz && f > cutoffHz - 400) d = Math.min(d, 0);
    raw[k] = clamp(d, -maxDb, maxDb);
  }
  // повторное сглаживание кривой (1/3 октавы, в линейном усилении)
  return smoothOctave(raw, sr, SPEC_N, 3).map((v) => clamp(v, -maxDb, maxDb));
}

// Линейно-фазовый FIR по кривой (дБ на бинах SPEC_N) + свёртка через БПФ.
export function applyCurve(chans, sr, curveDb) {
  const taps = 8192; const half = taps / 2;
  const re = new Float64Array(taps); const im = new Float64Array(taps);
  const binHz = sr / SPEC_N;
  for (let k = 0; k <= taps / 2; k += 1) {
    const f = (k * sr) / taps;
    const pos = f / binHz; const i0 = Math.floor(pos); const fr = pos - i0;
    const a = curveDb[Math.min(i0, curveDb.length - 1)]; const b = curveDb[Math.min(i0 + 1, curveDb.length - 1)];
    re[k] = 10 ** ((a * (1 - fr) + b * fr) / 20); im[k] = 0;
    if (k > 0 && k < taps / 2) { re[taps - k] = re[k]; im[taps - k] = 0; }
  }
  fft(re, im, true);
  const h = new Float64Array(taps);
  for (let i = 0; i < taps; i += 1) {
    const src = (i + half) % taps; // центрируем импульс
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    h[i] = re[src] * w;
  }
  return chans.map((x) => fftConvolve(x, h, half));
}

// Свёртка overlap-add; delay — сколько сэмплов задержки фильтра компенсировать.
export function fftConvolve(x, h, delay = 0) {
  const M = h.length; let N = 1; while (N < 2 * M) N <<= 1;
  const B = N - M + 1;
  const Hr = new Float64Array(N); const Hi = new Float64Array(N);
  for (let i = 0; i < M; i += 1) Hr[i] = h[i];
  fft(Hr, Hi);
  const n = x.length; const out = new Float64Array(n + N);
  const re = new Float64Array(N); const im = new Float64Array(N);
  for (let s = 0; s < n; s += B) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < B && s + i < n; i += 1) re[i] = x[s + i];
    fft(re, im);
    for (let k = 0; k < N; k += 1) { const a = re[k]; const b = im[k]; re[k] = a * Hr[k] - b * Hi[k]; im[k] = a * Hi[k] + b * Hr[k]; }
    fft(re, im, true);
    for (let i = 0; i < N; i += 1) out[s + i] += re[i];
  }
  const y = new Float32Array(n);
  for (let i = 0; i < n; i += 1) y[i] = out[i + delay];
  return y;
}
