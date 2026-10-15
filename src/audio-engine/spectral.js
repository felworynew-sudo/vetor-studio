// Спектральная обработка в STFT-домене:
//  • spectralDenoise — бережный шумодав без нейросети (решение «decision-directed»
//    Эфраима–Малаха + Винер). Для музыки: нейросеть, обученная на речи, ест
//    тарелки и пэды, а здесь подавление ограничено и не трогает тональное.
//  • suppressResonances — динамическое подавление узких резонансов и «металлика»
//    (класс soothe-подобных обработок): всё, что выпирает над огибающей спектра
//    кадра, прижимается — характерно для артефактов Suno/Udio.
//  • extendBandwidth — восстановление срезанного MP3/AAC верха транспозицией
//    спектра (SBR-подобно, как в HE-AAC) с продолжением наклона огибающей. Не
//    нейросеть: это правдоподобная реконструкция «воздуха», а не возврат
//    утерянного оригинала.

import { clamp, fft, hann, stftProcess } from './dsp.js';

function fftSizeFor(sr) { return sr > 32000 ? 2048 : 1024; }

// ---------- Шумодав ----------
export function spectralDenoise(x, sr, { reductionDb = 10, fMin = 0, onProgress } = {}) {
  const N = fftSizeFor(sr); const hop = N / 4; const bins = N / 2 + 1;
  const win = hann(N); const re = new Float64Array(N); const im = new Float64Array(N);
  // 1) энергия кадров → самые тихие 12% кадров = оценка шума
  const nFrames = Math.floor((x.length - N) / hop);
  if (nFrames < 8) return x;
  const energy = new Float64Array(nFrames);
  for (let f = 0; f < nFrames; f += 1) {
    let s = 0; const o = f * hop;
    for (let i = 0; i < N; i += 4) s += x[o + i] * x[o + i];
    energy[f] = s;
  }
  const order = Array.from(energy.keys()).sort((a, b) => energy[a] - energy[b]);
  const quiet = order.slice(0, Math.max(4, Math.floor(nFrames * 0.12)));
  const noise = new Float64Array(bins);
  for (const f of quiet) {
    const o = f * hop;
    for (let i = 0; i < N; i += 1) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < bins; k += 1) noise[k] += re[k] * re[k] + im[k] * im[k];
  }
  for (let k = 0; k < bins; k += 1) noise[k] = noise[k] / quiet.length + 1e-20;
  const kMin = Math.floor((fMin / sr) * N);
  const gMin = 10 ** (-reductionDb / 20);
  const prevG = new Float64Array(bins).fill(1); const prevP = new Float64Array(bins);
  const g = new Float64Array(bins);
  return stftProcess(x, N, hop, (R, I) => {
    for (let k = 0; k < bins; k += 1) {
      const P = R[k] * R[k] + I[k] * I[k];
      if (k < kMin) { g[k] = 1; prevP[k] = P; continue; }
      const gamma = P / noise[k];
      const xi = 0.98 * ((prevG[k] * prevG[k] * prevP[k]) / noise[k]) + 0.02 * Math.max(gamma - 1, 0);
      g[k] = Math.max(gMin, xi / (1 + xi));
      prevG[k] = g[k]; prevP[k] = P;
    }
    for (let k = 0; k < bins; k += 1) {
      const gs = k > 0 && k < bins - 1 ? 0.25 * g[k - 1] + 0.5 * g[k] + 0.25 * g[k + 1] : g[k];
      R[k] *= gs; I[k] *= gs;
    }
  }, onProgress);
}

// ---------- Подавление резонансов ----------
export function suppressResonances(chans, sr, { depth = 0.5, fLo = 1500, fHi = 14000, maxCutDb = 9, onProgress } = {}) {
  const N = fftSizeFor(sr); const hop = N / 4; const bins = N / 2 + 1;
  const binHz = sr / N;
  const kLo = Math.max(2, Math.floor(fLo / binHz)); const kHi = Math.min(bins - 2, Math.ceil(fHi / binHz));
  const thr = 3.5;
  // Огибающая — скользящее среднее дБ в окне ±1/3 октавы (по бинам).
  const halfW = new Int32Array(bins);
  for (let k = 0; k < bins; k += 1) halfW[k] = Math.max(3, Math.round(k * (2 ** (1 / 6) - 1)));
  const out = [];
  // Общая (сцепленная) маска по моно, чтобы не разваливать стереокартину.
  const masks = [];
  const n = chans[0].length;
  const mono = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i += 1) mono[i] += c[i] / chans.length;
  const db = new Float64Array(bins); const pre = new Float64Array(bins + 1);
  const cut = new Float64Array(bins);
  const att = 0.6; const rel = 0.15; // доли приближения за кадр
  // Мощность, усреднённая по времени (~100 мс): резонанс держится, а случайные
  // пики шума усредняются — так не «выедаем» шумовую подложку.
  const avgP = new Float64Array(bins); let first = true;
  stftProcess(mono, N, hop, (R, I) => {
    for (let k = 0; k < bins; k += 1) {
      const P = R[k] * R[k] + I[k] * I[k];
      avgP[k] = first ? P : 0.72 * avgP[k] + 0.28 * P;
      db[k] = 10 * Math.log10(avgP[k] + 1e-20);
    }
    first = false;
    for (let k = 0; k < bins; k += 1) pre[k + 1] = pre[k] + db[k];
    const m = new Uint8Array(bins); // 0.05 дБ на шаг
    for (let k = 0; k < bins; k += 1) {
      let target = 0;
      if (k >= kLo && k <= kHi) {
        const lo = Math.max(0, k - halfW[k]); const hi = Math.min(bins, k + halfW[k] + 1);
        const env = (pre[hi] - pre[lo]) / (hi - lo);
        const excess = db[k] - env - thr;
        if (excess > 0) target = Math.min(maxCutDb, excess * depth);
      }
      cut[k] += (target - cut[k]) * (target > cut[k] ? att : rel);
      m[k] = Math.min(255, Math.round(cut[k] * 20));
    }
    masks.push(m);
  }, null);
  for (let c = 0; c < chans.length; c += 1) {
    let f = 0;
    out.push(stftProcess(chans[c], N, hop, (R, I) => {
      const m = masks[f]; f += 1;
      if (!m) return;
      for (let k = 0; k < bins; k += 1) {
        const ms = (k > 0 && k < bins - 1 ? 0.25 * m[k - 1] + 0.5 * m[k] + 0.25 * m[k + 1] : m[k]) / 20;
        if (ms > 0.01) { const gg = 10 ** (-ms / 20); R[k] *= gg; I[k] *= gg; }
      }
    }, onProgress ? (p) => onProgress((c + p) / chans.length) : null));
  }
  return out;
}

// ---------- Восстановление верха (SBR) ----------
export function extendBandwidth(x, sr, cutoffHz, { amount = 0.6, onProgress } = {}) {
  const nyq = sr / 2;
  if (!(cutoffHz > 5000 && cutoffHz < nyq - 1200)) return x;
  const N = fftSizeFor(sr); const hop = N / 4; const bins = N / 2 + 1;
  const binHz = sr / N;
  const kc = Math.floor(cutoffHz / binHz) - 1;
  const kTop = Math.min(bins - 2, Math.floor(Math.min(nyq - 300, 20000) / binHz));
  const span = Math.max(8, Math.floor(kc / 2)); // ширина исходной полосы (≈ октава ниже среза)
  const fadeBins = Math.max(4, Math.round(500 / binHz));
  const extraDb = -3 - (1 - amount) * 9;
  const smDb = new Float64Array(bins);
  return stftProcess(x, N, hop, (R, I) => {
    // сглаженный уровень дБ (±4 бина)
    for (let k = 0; k < bins; k += 1) {
      let s = 0; let c = 0;
      for (let j = Math.max(1, k - 4); j <= Math.min(kc, k + 4); j += 1) { s += R[j] * R[j] + I[j] * I[j]; c += 1; }
      smDb[k] = 10 * Math.log10(s / (c || 1) + 1e-20);
    }
    // наклон огибающей в октаве под срезом (дБ/окт)
    const kA = Math.max(2, Math.floor(kc / 2)); const kB = kc - 2;
    let sx = 0; let sy = 0; let sxx = 0; let sxy = 0; let cnt = 0;
    for (let k = kA; k <= kB; k += 2) { const lx = Math.log2(k); const ly = smDb[k]; sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly; cnt += 1; }
    const slope = clamp((cnt * sxy - sx * sy) / (cnt * sxx - sx * sx || 1), -18, -3);
    const endDb = smDb[kB];
    if (endDb < -110) return; // тишина — нечего продолжать
    for (let kt = kc + 1; kt <= kTop; kt += 1) {
      const rel = kt - kc - 1;
      const ks = kc - span + (rel % span); // источник: октава под срезом, по кругу
      const targetDb = endDb + slope * Math.log2(kt / kB) + extraDb - 3 * Math.floor(rel / span);
      const srcDb = smDb[ks];
      let gDb = targetDb - srcDb;
      const fade = Math.min(1, (rel + 1) / fadeBins);
      gDb += 20 * Math.log10(fade + 1e-6);
      const gg = 10 ** (gDb / 20);
      R[kt] += R[ks] * gg; I[kt] += I[ks] * gg;
    }
  }, onProgress);
}

// ---------- Подавление позднего эха (Lebart 2001 / Habets) ----------
// Мощность поздней реверберации в кадре t ≈ e^(−2δ·Tl)·|Y(t − Tl)|², δ = 3·ln10 / RT60,
// Tl ≈ 50 мс (ранние отражения и сам голос не трогаем). Дальше — спектральное
// вычитание с полом усиления и сглаживанием, чтобы не было «музыкального шума».
export function suppressLateReverb(x, sr, rt60, { strength = 0.8, lateMs = 50, maxCutDb = 18, onProgress } = {}) {
  if (!(rt60 > 0.1)) return x;
  const N = fftSizeFor(sr) / 2; const hop = N / 4; const bins = N / 2 + 1;
  const Tl = Math.max(1, Math.round((lateMs / 1000) * sr / hop));
  const delta = (3 * Math.LN10) / rt60;
  const decay = Math.exp(-2 * delta * Tl * (hop / sr));
  const hist = Array.from({ length: Tl + 1 }, () => new Float64Array(bins));
  const smP = new Float64Array(bins); const prevG = new Float64Array(bins).fill(1);
  const gMin = 10 ** (-maxCutDb / 20);
  let f = 0;
  return stftProcess(x, N, hop, (R, I) => {
    const old = hist[f % (Tl + 1)]; // кадр t − Tl (буфер по кругу)
    const cur = new Float64Array(bins);
    for (let k = 0; k < bins; k += 1) {
      const P = R[k] * R[k] + I[k] * I[k];
      smP[k] = 0.6 * smP[k] + 0.4 * P; // сглаженная мощность
      cur[k] = smP[k];
      const late = decay * old[k] * strength * 1.5;
      let g = 1 - late / (smP[k] + 1e-20);
      g = Math.max(gMin, g);
      g = 0.5 * prevG[k] + 0.5 * g; // временное сглаживание
      prevG[k] = g;
    }
    for (let k = 0; k < bins; k += 1) {
      const gs = k > 0 && k < bins - 1 ? 0.25 * prevG[k - 1] + 0.5 * prevG[k] + 0.25 * prevG[k + 1] : prevG[k];
      R[k] *= gs; I[k] *= gs;
    }
    hist[f % (Tl + 1)] = cur;
    f += 1;
  }, onProgress);
}
