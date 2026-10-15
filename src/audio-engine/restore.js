// Реставрация повреждений: восстановление клиппинга и щелчков методом LSAR
// (least-squares autoregressive interpolation, Janssen/Vaseghi — тот же класс
// алгоритмов, что в профессиональных реставраторах), подавление сетевого гула
// гребёнкой узких режекторов, удаление DC.

import { biquad, clamp, filter } from './dsp.js';

// ---------- AR-модель ----------
function levinson(r, p) {
  const a = new Float64Array(p + 1); a[0] = 1;
  let err = r[0];
  if (err <= 0) return a;
  const tmp = new Float64Array(p + 1);
  for (let i = 1; i <= p; i += 1) {
    let acc = r[i];
    for (let j = 1; j < i; j += 1) acc += a[j] * r[i - j];
    const k = -acc / err;
    tmp.set(a);
    for (let j = 1; j < i; j += 1) a[j] = tmp[j] + k * tmp[i - j];
    a[i] = k;
    err *= 1 - k * k;
    if (err <= 1e-12) break;
  }
  return a; // e[t] = Σ a[m]·x[t−m], a[0] = 1
}

function autocorr(x, p) {
  const r = new Float64Array(p + 1);
  for (let lag = 0; lag <= p; lag += 1) {
    let s = 0;
    for (let i = lag; i < x.length; i += 1) s += x[i] * x[i - lag];
    r[lag] = s;
  }
  r[0] *= 1.0001; r[0] += 1e-12;
  return r;
}

function choleskySolve(A, b, m) {
  // A — m×m (Float64Array, строка за строкой), симметричная положительно определённая.
  const L = new Float64Array(m * m);
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let s = A[i * m + j];
      for (let k = 0; k < j; k += 1) s -= L[i * m + k] * L[j * m + k];
      if (i === j) { if (s <= 1e-14) s = 1e-14; L[i * m + i] = Math.sqrt(s); } else L[i * m + j] = s / L[j * m + j];
    }
  }
  const y = new Float64Array(m);
  for (let i = 0; i < m; i += 1) { let s = b[i]; for (let k = 0; k < i; k += 1) s -= L[i * m + k] * y[k]; y[i] = s / L[i * m + i]; }
  const x = new Float64Array(m);
  for (let i = m - 1; i >= 0; i -= 1) { let s = y[i]; for (let k = i + 1; k < m; k += 1) s -= L[k * m + i] * x[k]; x[i] = s / L[i * m + i]; }
  return x;
}

// Интерполяция пропусков в окне seg (Float64Array) по маске missing (Uint8Array).
function lsarFill(seg, missing, p) {
  const L = seg.length;
  // Повреждённые сэмплы не должны портить оценку модели: сначала линейная
  // затычка, потом AR → LSAR, и ещё раз AR по уже восстановленному окну.
  let prev = -1;
  for (let i = 0; i <= L; i += 1) {
    if (i < L && missing[i]) continue;
    if (i - prev > 1) {
      const a0 = prev >= 0 ? seg[prev] : (i < L ? seg[i] : 0); const b0 = i < L ? seg[i] : a0;
      for (let j = prev + 1; j < i; j += 1) seg[j] = a0 + ((b0 - a0) * (j - prev)) / (i - prev);
    }
    prev = i;
  }
  lsarSolve(seg, missing, p);
  lsarSolve(seg, missing, p);
}

function lsarSolve(seg, missing, p) {
  const L = seg.length;
  const a = levinson(autocorr(seg, p), p);
  const unk = [];
  for (let i = 0; i < L; i += 1) if (missing[i]) unk.push(i);
  const m = unk.length;
  if (!m) return;
  const pos = new Int32Array(L).fill(-1);
  unk.forEach((u, i) => { pos[u] = i; });
  // B[i][j] = Σ_t a[t−i]·a[t−j], строки t ∈ [p, L−1]
  const B = (i, j) => {
    const lo = Math.max(p, i, j); const hi = Math.min(L - 1, i + p, j + p);
    let s = 0;
    for (let t = lo; t <= hi; t += 1) s += a[t - i] * a[t - j];
    return s;
  };
  const M = new Float64Array(m * m); const rhs = new Float64Array(m);
  for (let ii = 0; ii < m; ii += 1) {
    const i = unk[ii];
    for (let jj = 0; jj <= ii; jj += 1) {
      const j = unk[jj];
      if (Math.abs(i - j) > p) continue;
      const v = B(i, j); M[ii * m + jj] = v; M[jj * m + ii] = v;
    }
    M[ii * m + ii] += 1e-9;
    let s = 0;
    for (let j = Math.max(0, i - p); j <= Math.min(L - 1, i + p); j += 1) if (!missing[j]) s += B(i, j) * seg[j];
    rhs[ii] = -s;
  }
  const sol = choleskySolve(M, rhs, m);
  for (let ii = 0; ii < m; ii += 1) seg[unk[ii]] = sol[ii];
}

function cubicFill(x, s0, s1) {
  // Эрмит по двум точкам с каждой стороны (запасной путь для очень длинных пропусков).
  const a = Math.max(0, s0 - 1); const b = Math.min(x.length - 1, s1);
  const ya = x[a]; const yb = x[b];
  const da = a > 0 ? x[a] - x[a - 1] : 0; const db = b + 1 < x.length ? x[b + 1] - x[b] : 0;
  const len = b - a;
  for (let i = s0; i < s1; i += 1) {
    const t = (i - a) / len; const t2 = t * t; const t3 = t2 * t;
    x[i] = (2 * t3 - 3 * t2 + 1) * ya + (t3 - 2 * t2 + t) * da * len + (-2 * t3 + 3 * t2) * yb + (t3 - t2) * db * len;
  }
}

// Общий проход: x — канал, runs — отсортированные [start, end), p — порядок AR.
function repairRuns(x, runs, p, constrain) {
  let i = 0;
  while (i < runs.length) {
    // кластер из близких пропусков решаем одной системой
    let j = i; let unknown = runs[i][1] - runs[i][0];
    const ctx = Math.max(4 * p, 384);
    while (j + 1 < runs.length && runs[j + 1][0] - runs[j][1] < ctx && unknown + runs[j + 1][1] - runs[j + 1][0] < 260) {
      j += 1; unknown += runs[j][1] - runs[j][0];
    }
    const longest = Math.max(...runs.slice(i, j + 1).map((r) => r[1] - r[0]));
    const w0 = Math.max(0, runs[i][0] - Math.max(ctx, 2 * longest));
    const w1 = Math.min(x.length, runs[j][1] + Math.max(ctx, 2 * longest));
    if (unknown > 240 || w1 - w0 < 2 * p + unknown) {
      for (let k = i; k <= j; k += 1) cubicFill(x, runs[k][0], runs[k][1]);
    } else {
      const seg = new Float64Array(w1 - w0); const miss = new Uint8Array(w1 - w0);
      for (let k = 0; k < seg.length; k += 1) seg[k] = x[w0 + k];
      for (let k = i; k <= j; k += 1) for (let q = runs[k][0]; q < runs[k][1]; q += 1) miss[q - w0] = 1;
      const orig = seg.slice();
      lsarFill(seg, miss, p);
      for (let k = 0; k < seg.length; k += 1) {
        if (!miss[k]) continue;
        x[w0 + k] = constrain ? constrain(seg[k], orig[k]) : seg[k];
      }
    }
    i = j + 1;
  }
}

// ---------- Declip ----------
export function declip(chans, sr, { level } = {}) {
  let repaired = 0;
  const p = sr > 40000 ? 32 : 24;
  for (const x of chans) {
    let peak = level;
    if (!peak) { peak = 0; for (let i = 0; i < x.length; i += 1) { const a = Math.abs(x[i]); if (a > peak) peak = a; } peak *= 0.995; }
    const runs = [];
    let s = -1;
    for (let i = 0; i <= x.length; i += 1) {
      const hit = i < x.length && Math.abs(x[i]) >= peak;
      if (hit && s < 0) s = i;
      if (!hit && s >= 0) { if (i - s >= 2) runs.push([s, i]); s = -1; }
    }
    if (!runs.length) continue;
    // истинный сигнал был НЕ ниже уровня клиппинга и того же знака
    const constrain = (v, o) => {
      const sg = o >= 0 ? 1 : -1;
      return sg * clamp(v * sg, peak, peak * 3.2);
    };
    repairRuns(x, runs, p, constrain);
    repaired += runs.reduce((acc, r) => acc + r[1] - r[0], 0);
  }
  return { repairedSamples: repaired };
}

// ---------- Declick ----------
// Детектор: остаток AR(16) по блокам; щелчок — короткий (≤ maxMs) выброс остатка
// выше k·σ (робастная σ по медиане).
export function declick(chans, sr, { sensitivity = 0.5, maxMs = 2.5 } = {}) {
  const p = 16; const block = 2048;
  const k = 9 - sensitivity * 4.5; // 9σ (осторожно) … 4.5σ (агрессивно)
  const maxLen = Math.round((sr * maxMs) / 1000);
  let clicks = 0;
  for (const x of chans) {
    const runs = [];
    for (let b = p; b < x.length; b += block) {
      const end = Math.min(x.length, b + block);
      const seg = x.subarray(Math.max(0, b - p), end);
      const a = levinson(autocorr(seg, p), p);
      const e = new Float32Array(end - b);
      for (let t = b; t < end; t += 1) {
        let s = 0;
        for (let m = 0; m <= p; m += 1) s += a[m] * x[t - m];
        e[t - b] = Math.abs(s);
      }
      const sorted = Float32Array.from(e).sort();
      const sigma = sorted[Math.floor(sorted.length / 2)] / 0.6745 + 1e-9;
      let s0 = -1;
      for (let t = 0; t <= e.length; t += 1) {
        const hit = t < e.length && e[t] > k * sigma;
        if (hit && s0 < 0) s0 = t;
        if (!hit && s0 >= 0) {
          const len = t - s0;
          if (len <= maxLen) runs.push([Math.max(0, b + s0 - 2), Math.min(x.length, b + t + 4)]);
          s0 = -1;
        }
      }
    }
    // слить пересечения
    runs.sort((u, v) => u[0] - v[0]);
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([r[0], r[1]]);
    }
    const ok = merged.filter((r) => r[1] - r[0] <= maxLen + 8);
    clicks += ok.length;
    repairRuns(x, ok, 24, null);
  }
  return { clicks };
}

// ---------- Гул 50/60 Гц ----------
export function dehum(chans, sr, f0) {
  const coeffs = [];
  for (let h = 1; h * f0 < Math.min(1200, sr / 2 - 100); h += 1) {
    const f = h * f0;
    const bw = h === 1 ? 2.5 : 3.5; // Гц
    coeffs.push(biquad('notch', f, sr, { q: f / bw }));
  }
  for (const x of chans) for (const c of coeffs) filter(x, c, x);
  return { notches: coeffs.length };
}

// ---------- DC ----------
export function removeDc(chans, sr, hz = 5) {
  const R = 1 - (2 * Math.PI * hz) / sr;
  for (const x of chans) {
    let x1 = 0; let y1 = 0;
    for (let i = 0; i < x.length; i += 1) { const v = x[i]; const y = v - x1 + R * y1; x1 = v; y1 = y; x[i] = y; }
  }
}
