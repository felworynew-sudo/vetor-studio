// Дочистка стемов после Demucs: убираем «мусор» — просачивание соседних инструментов,
// металлические артефакты и шорох в паузах. Всё, что убрано, складывается в «остаток»,
// поэтому сумма стемов + остаток = исходный микс (ничего не теряется бесследно).
//
// 1) Маски Винера по исходному миксу: стем = M_k · X, где M_k = |S_k|² / Σ|S_j|².
//    Выход строится из настоящего спектра микса, а не из того, что «нарисовала» сеть.
// 2) Порог доли: бины, где стем даёт меньше τ энергии, плавно гасятся (это и есть
//    просачивание). Маска сглаживается во времени — без «булькающего» музыкального шума.
// 3) Полосы: у вокала нет ничего ниже ~70 Гц, у баса — выше ~8 кГц.
// 4) Гейт тишины: в местах, где стем на 40+ дБ тише своего максимума, остаётся только шум.
//
// Потоково, на месте: каждый стем перезаписывается по мере прохода кадров (БПФ 4096 / шаг 1024).

import { fft } from './dsp.js';

const N = 4096; const HOP = 1024; const BINS = N / 2 + 1;
const WIN = (() => { const w = new Float32Array(N); for (let i = 0; i < N; i += 1) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / N)); return w; })();
const OLA = 1.5; // Σ hann² при перекрытии 75%

// Полосы: множитель по частоте для каждого стема (0..1).
function bandGain(name, f) {
  if (name === 'vocals') return f < 50 ? 0 : f < 90 ? (f - 50) / 40 : 1;
  if (name === 'bass') return f < 6000 ? 1 : f > 9000 ? 0 : (9000 - f) / 3000;
  return 1;
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// stems: { name: [ch0, ch1] }, mix: [ch0, ch1], sr. strength 0..1.
// Возвращает residual: [ch0, ch1] (всё, что убрано). Стемы правятся на месте.
export async function cleanStems(stems, mix, sr, { strength = 0.5, onProgress, isCancelled } = {}) {
  const names = Object.keys(stems); const K = names.length;
  const L = mix[0].length; const channels = mix.length;
  const tau = 0.04 + strength * 0.2; // доля энергии, ниже которой бин — чужой
  const band = names.map((n) => Float32Array.from({ length: BINS }, (_, b) => bandGain(n, (b * sr) / N)));
  const residual = mix.map(() => new Float32Array(L));
  const frames = Math.ceil((L + N) / HOP); let done = 0; const total = frames * channels;

  for (let c = 0; c < channels; c += 1) {
    const x = mix[c]; const S = names.map((n) => stems[n][c]);
    const re = Array.from({ length: K + 1 }, () => new Float64Array(N));
    const im = Array.from({ length: K + 1 }, () => new Float64Array(N));
    const acc = Array.from({ length: K }, () => new Float32Array(N));
    const prevMask = Array.from({ length: K }, () => new Float32Array(BINS));
    const gains = new Float32Array(K);

    for (let p = -(N - HOP); p < L; p += HOP) {
      // анализ: микс (индекс K) и стемы
      for (let k = 0; k <= K; k += 1) {
        const src = k === K ? x : S[k]; const r = re[k]; const ii = im[k];
        for (let i = 0; i < N; i += 1) { const t = p + i; r[i] = t >= 0 && t < L ? src[t] * WIN[i] : 0; ii[i] = 0; }
        fft(r, ii);
      }
      const xr = re[K]; const xi = im[K];
      for (let b = 0; b < BINS; b += 1) {
        let sum = 1e-12;
        for (let k = 0; k < K; k += 1) { const pw = re[k][b] * re[k][b] + im[k][b] * im[k][b]; gains[k] = pw; sum += pw; }
        for (let k = 0; k < K; k += 1) {
          let m = gains[k] / sum;
          // сглаживание по времени: быстро открываемся, медленно закрываемся
          const pm = prevMask[k][b]; m = m > pm ? m : pm * 0.6 + m * 0.4; prevMask[k][b] = m;
          const g = m * smoothstep(tau * 0.5, tau, m) * band[k][b];
          re[k][b] = xr[b] * g; im[k][b] = xi[b] * g;
        }
      }
      // синтез: зеркалим спектр, обратное БПФ, наложение с окном
      for (let k = 0; k < K; k += 1) {
        const r = re[k]; const ii = im[k];
        for (let b = 1; b < N / 2; b += 1) { r[N - b] = r[b]; ii[N - b] = -ii[b]; }
        fft(r, ii, true);
        const a = acc[k];
        for (let i = 0; i < N; i += 1) a[i] += r[i] * WIN[i];
        // отсчёты [p, p+HOP) готовы — следующий кадр их уже не читает, пишем на место
        for (let i = 0; i < HOP; i += 1) { const t = p + i; if (t >= 0 && t < L) S[k][t] = a[i] / OLA; }
        a.copyWithin(0, HOP); a.fill(0, N - HOP);
      }
      done += 1;
      if (done % 64 === 0) {
        onProgress?.(done, total);
        if (isCancelled?.()) throw new Error('cancelled');
        await new Promise((r) => setTimeout(r, 0)); // eslint-disable-line no-await-in-loop
      }
    }
  }

  gateSilence(stems, sr);
  for (let c = 0; c < channels; c += 1) {
    const r = residual[c]; const x = mix[c];
    for (let i = 0; i < L; i += 1) { let s = x[i]; for (let k = 0; k < K; k += 1) s -= stems[names[k]][c][i]; r[i] = s; }
  }
  onProgress?.(total, total);
  return residual;
}

// Гейт тишины по блокам 2048 отсчётов с плавными переходами.
function gateSilence(stems, sr) {
  const B = 2048;
  Object.values(stems).forEach((chs) => {
    const L = chs[0].length; const nb = Math.ceil(L / B);
    const rms = new Float32Array(nb); let peak = 0;
    for (let j = 0; j < nb; j += 1) {
      let e = 0; let n = 0;
      chs.forEach((ch) => { for (let i = j * B; i < Math.min(L, (j + 1) * B); i += 1) { e += ch[i] * ch[i]; n += 1; } });
      rms[j] = Math.sqrt(e / Math.max(1, n)); if (rms[j] > peak) peak = rms[j];
    }
    if (!peak) return;
    const thr = Math.max(10 ** (-60 / 20), peak * 10 ** (-40 / 20));
    // удержание: блок открыт, если рядом (±0.25 с) есть громкий блок — не режем хвосты нот
    const hold = Math.ceil((0.25 * sr) / B);
    const open = new Float32Array(nb);
    for (let j = 0; j < nb; j += 1) if (rms[j] > thr) for (let d = -hold; d <= hold; d += 1) if (j + d >= 0 && j + d < nb) open[j + d] = 1;
    chs.forEach((ch) => {
      for (let j = 0; j < nb; j += 1) {
        const g0 = open[j]; const g1 = j + 1 < nb ? open[j + 1] : g0;
        if (g0 === 1 && g1 === 1) continue;
        for (let i = 0; i < B; i += 1) { const t = j * B + i; if (t < L) ch[t] *= g0 + (g1 - g0) * (i / B); }
      }
    });
  });
}
