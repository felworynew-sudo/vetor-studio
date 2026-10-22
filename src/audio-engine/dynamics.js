// Динамика и финализация:
//  • dynamicEq — динамический EQ: полоса прижимается, только когда её доля в
//    сигнале выпирает над типичной для этой записи (бубнение 60–300 Гц, резкость
//    2–6 кГц, сибилянты 5–11 кГц). Заменяет статичный «де-эссер-вырез».
//  • tonalDrift — выравнивание тембра по ходу трека (у AI-музыки он «плывёт»).
//  • expander, compressor, leveler — паузы, плотность, ровный уровень голоса.
//  • truePeakLimit — лимитер с заглядыванием вперёд по 8×-восстановленному
//    сигналу: гарантирует потолок в dBTP, а не только по сэмплам.

import {
  biquad, clamp, coef, dbToLin, filter, framesToSamples, linToDb, mixMono, percentile, truePeakEnvelope,
} from './dsp.js';

// ---------- Динамический EQ ----------
export function dynamicEq(chans, sr, bands, { amount = 1 } = {}) {
  const n = chans[0].length;
  const mono = mixMono(chans);
  const full = filter(mono, biquad('highpass', 60, sr));
  const stepD = 16;
  const fullEnv = envelopeDb(full, sr, 0.005, 0.12, stepD);
  const report = [];
  for (const b of bands) {
    if (b.f >= sr * 0.45) continue;
    const c = biquad('bandpass', b.f, sr, { q: b.q });
    const bandEnv = envelopeDb(filter(mono, c), sr, b.attack ?? 0.003, b.release ?? 0.08, stepD);
    // типичное отношение полоса/весь сигнал на активных участках
    const active = []; const fullP90 = percentile(fullEnv, 0.9);
    for (let i = 0; i < fullEnv.length; i += 4) if (fullEnv[i] > fullP90 - 30) active.push(bandEnv[i] - fullEnv[i]);
    if (active.length < 10) continue;
    const typical = percentile(active, 0.5);
    const gainDb = new Float32Array(fullEnv.length);
    let maxCut = 0; let cutTime = 0;
    const ratio = b.ratio ?? 3;
    for (let i = 0; i < fullEnv.length; i += 1) {
      const excess = bandEnv[i] - fullEnv[i] - typical - b.thresh;
      const g = excess > 0 ? -Math.min(b.maxCut * amount, excess * (1 - 1 / ratio) * amount) : 0;
      gainDb[i] = g;
      if (g < maxCut) maxCut = g;
      if (g < -1) cutTime += 1;
    }
    // сглаживание коэффициента (атака/отпускание в дБ-домене)
    const aC = coef(b.attack ?? 0.003, sr / stepD); const rC = coef(b.release ?? 0.08, sr / stepD);
    let s = 0;
    for (let i = 0; i < gainDb.length; i += 1) { const v = gainDb[i]; s = v < s ? aC * s + (1 - aC) * v : rC * s + (1 - rC) * v; gainDb[i] = s; }
    const g = framesToSamples(gainDb, stepD, 0, n);
    for (let i = 0; i < n; i += 1) g[i] = dbToLin(g[i]) - 1;
    for (const x of chans) {
      const bp = filter(x, c);
      for (let i = 0; i < n; i += 1) x[i] += g[i] * bp[i];
    }
    report.push({ id: b.id, maxCutDb: Math.round(maxCut * 10) / 10, activePct: Math.round((cutTime / gainDb.length) * 1000) / 10 });
  }
  return report;
}

// RMS-огибающая в дБ с атакой/отпусканием, прореженная шагом step.
function envelopeDb(x, sr, attack, release, step) {
  const aC = coef(attack, sr); const rC = coef(release, sr);
  const out = new Float32Array(Math.ceil(x.length / step));
  let e = 0;
  for (let i = 0; i < x.length; i += 1) {
    const p = x[i] * x[i];
    e = p > e ? aC * e + (1 - aC) * p : rC * e + (1 - rC) * p;
    if (i % step === 0) out[i / step] = 10 * Math.log10(e + 1e-14);
  }
  return out;
}

// ---------- Дрейф тембра ----------
export function tonalDrift(chans, sr, { amount = 0.6, maxDb = 3 } = {}) {
  const n = chans[0].length;
  const win = Math.round(sr * 3); const hop = Math.round(sr * 1);
  if (n < win * 3) return [];
  const mono = mixMono(chans);
  const bands = [
    { id: 'presence', lo: 1000, hi: 4000 },
    { id: 'brilliance', lo: 4000, hi: 10000 },
    { id: 'air', lo: 10000, hi: Math.min(18000, sr / 2 - 300) },
  ].filter((b) => b.hi > b.lo + 1000);
  const fullRms = winDb(mono, win, hop);
  const report = [];
  for (const b of bands) {
    const cs = [biquad('highpass', b.lo, sr, { q: 0.6 }), biquad('lowpass', b.hi, sr, { q: 0.6 })];
    const bandOf = (x) => filter(filter(x, cs[0]), cs[1]);
    const bRms = winDb(bandOf(mono), win, hop);
    const p90 = percentile(fullRms, 0.9);
    const rel = bRms.map((v, i) => v - fullRms[i]);
    const act = rel.filter((_, i) => fullRms[i] > p90 - 20);
    if (act.length < 3) continue;
    const med = percentile(act, 0.5);
    let gains = rel.map((v, i) => (fullRms[i] > p90 - 20 ? clamp(-(v - med) * amount, -maxDb, maxDb) : 0));
    gains = gains.map((_, i) => { let s = 0; let c = 0; for (let j = i - 2; j <= i + 2; j += 1) if (j >= 0 && j < gains.length) { s += gains[j]; c += 1; } return s / c; });
    const peak = gains.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (peak < 0.3) continue;
    const g = framesToSamples(Float32Array.from(gains), hop, win / 2, n);
    for (let i = 0; i < n; i += 1) g[i] = dbToLin(g[i]) - 1;
    for (const x of chans) {
      const bp = bandOf(x);
      for (let i = 0; i < n; i += 1) x[i] += g[i] * bp[i];
    }
    report.push({ id: b.id, maxDb: Math.round(peak * 10) / 10 });
  }
  return report;
}

function winDb(x, win, hop) {
  const out = [];
  for (let s = 0; s + win <= x.length; s += hop) {
    let p = 0; for (let i = s; i < s + win; i += 2) p += x[i] * x[i];
    out.push(10 * Math.log10(p / (win / 2) + 1e-14));
  }
  return out;
}

// ---------- Экспандер (паузы) ----------
export function expander(chans, sr, { thresholdDb, ratio = 2, rangeDb = 12, attack = 0.002, hold = 0.08, release = 0.15 } = {}) {
  const n = chans[0].length;
  const mono = mixMono(chans);
  const aC = coef(0.005, sr); const rC = coef(0.06, sr);
  const gaC = coef(attack, sr); const grC = coef(release, sr);
  const holdN = Math.round(hold * sr);
  let e = 0; let g = 0; let held = 0;
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = mono[i] * mono[i];
    e = p > e ? aC * e + (1 - aC) * p : rC * e + (1 - rC) * p;
    const lvl = 10 * Math.log10(e + 1e-14);
    let target = 0;
    if (lvl < thresholdDb) { if (held > 0) held -= 1; else target = -Math.min(rangeDb, (thresholdDb - lvl) * (ratio - 1)); } else held = holdN;
    g = target > g ? gaC * g + (1 - gaC) * target : grC * g + (1 - grC) * target;
    gain[i] = g;
  }
  for (const x of chans) for (let i = 0; i < n; i += 1) x[i] *= dbToLin(gain[i]);
}

// ---------- Компрессор (стерео-сцепленный, мягкое колено) ----------
export function compressor(chans, sr, { thresholdDb, ratio = 2, kneeDb = 6, attack = 0.01, release = 0.15, rmsSec = 0.01 } = {}) {
  const n = chans[0].length;
  const dC = coef(rmsSec, sr); const aC = coef(attack, sr); const rC = coef(release, sr);
  let e = 0; let g = 0; let maxGr = 0;
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let p = 0; for (const x of chans) if (x[i] * x[i] > p) p = x[i] * x[i];
    e = dC * e + (1 - dC) * p;
    const lvl = 10 * Math.log10(e + 1e-14);
    const over = lvl - thresholdDb;
    let gr = 0;
    if (over > kneeDb / 2) gr = over * (1 / ratio - 1);
    else if (over > -kneeDb / 2) { const t = over + kneeDb / 2; gr = ((1 / ratio - 1) * t * t) / (2 * kneeDb); }
    g = gr < g ? aC * g + (1 - aC) * gr : rC * g + (1 - rC) * gr;
    gain[i] = g; if (g < maxGr) maxGr = g;
  }
  for (const x of chans) for (let i = 0; i < n; i += 1) x[i] *= dbToLin(gain[i]);
  return { maxGainReductionDb: Math.round(maxGr * 10) / 10 };
}

// ---------- Лэвелер (выравнивание громкости фраз) ----------
// Короткая громкость (400 мс) приводится к средней для речи, ±maxDb; в паузах
// коэффициент «замирает», чтобы не поднимать тишину.
export function leveler(chans, sr, loudCurve, hopSec, { maxDb = 6, amount = 0.7 } = {}) {
  const n = chans[0].length;
  const act = loudCurve.filter((v) => v > -70);
  if (act.length < 10) return null;
  const p90 = percentile(act, 0.9);
  const voiced = loudCurve.map((v) => v > p90 - 18);
  const vv = loudCurve.filter((v, i) => voiced[i]);
  const target = percentile(vv, 0.6);
  const raw = new Float32Array(loudCurve.length);
  let last = 0;
  for (let i = 0; i < loudCurve.length; i += 1) {
    if (voiced[i]) last = clamp((target - loudCurve[i]) * amount, -maxDb, maxDb);
    raw[i] = last;
  }
  // сглаживание ~1.2 с
  const tau = Math.max(1, Math.round(1.2 / hopSec));
  const sm = new Float32Array(raw.length);
  let s = raw[0];
  for (let i = 0; i < raw.length; i += 1) { s += (raw[i] - s) / tau; sm[i] = s; }
  let b = sm[sm.length - 1];
  for (let i = sm.length - 1; i >= 0; i -= 1) { b += (sm[i] - b) / tau; sm[i] = b; } // обратный проход — без запаздывания
  const g = framesToSamples(sm, Math.round(hopSec * sr), Math.round(0.2 * sr), n);
  let maxAbs = 0;
  for (const x of chans) for (let i = 0; i < n; i += 1) { x[i] *= dbToLin(g[i]); }
  for (let i = 0; i < sm.length; i += 1) maxAbs = Math.max(maxAbs, Math.abs(sm[i]));
  return { maxDb: Math.round(maxAbs * 10) / 10 };
}

export function applyGain(chans, db) {
  const k = dbToLin(db);
  for (const x of chans) for (let i = 0; i < x.length; i += 1) x[i] *= k;
}

// ---------- True-peak лимитер ----------
export function truePeakLimit(chans, sr, { ceilingDb = -1, lookaheadMs = 1.5, releaseMs = 80 } = {}) {
  const n = chans[0].length;
  const L = Math.max(1, Math.round((lookaheadMs / 1000) * sr));
  const relC = coef(releaseMs / 1000, sr);
  let totalGr = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const ceil = dbToLin(ceilingDb - 0.15 - pass * 0.1);
    const req = new Float32Array(n).fill(1);
    let any = false;
    for (const x of chans) {
      const env = truePeakEnvelope(x, ceil);
      for (let i = 0; i < n; i += 1) if (env[i] > ceil) { const r = ceil / env[i]; if (r < req[i]) { req[i] = r; any = true; } }
    }
    if (!any) break;
    // m[i] = min(req[i..i+L]) — монотонная очередь
    const m = new Float32Array(n);
    const dq = new Int32Array(n + L + 1); let h = 0; let t = 0;
    for (let i = n - 1; i >= 0; i -= 1) {
      while (t > h && req[dq[t - 1]] >= req[i]) t -= 1;
      dq[t] = i; t += 1;
      while (dq[h] > i + L) h += 1;
      m[i] = req[dq[h]];
    }
    // скользящее среднее m за окно [i−L, i] — гарантирует g[i] ≤ req[i]
    const gArr = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += m[i];
      if (i - L - 1 >= 0) sum -= m[i - L - 1];
      const cnt = Math.min(i + 1, L + 1);
      gArr[i] = sum / cnt;
    }
    // для первых сэмплов окно короче — берём минимум, чтобы не нарушить гарантию
    for (let i = 0; i < Math.min(n, L); i += 1) gArr[i] = Math.min(gArr[i], m[i]);
    let r = 1;
    for (let i = 0; i < n; i += 1) {
      const a = gArr[i];
      r = a < r ? a : relC * r + (1 - relC) * a;
      if (r > a) r = a;
      gArr[i] = r;
      if (1 - r > totalGr) totalGr = 1 - r;
    }
    for (const x of chans) for (let i = 0; i < n; i += 1) x[i] *= gArr[i];
  }
  return { maxGainReductionDb: Math.round(linToDb(1 - totalGr) * 10) / 10 };
}

// ---------- Стерео ----------
export function stereoTools(chans, sr, { width = 1, monoBassHz = 0 } = {}) {
  if (chans.length < 2) return;
  const [L, R] = chans; const n = L.length;
  const S = new Float32Array(n); const M = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { M[i] = (L[i] + R[i]) / 2; S[i] = ((L[i] - R[i]) / 2) * width; }
  if (monoBassHz > 0) {
    // убрать боковую составляющую ниже monoBassHz (Линквиц–Райли 4-го порядка)
    const c = biquad('lowpass', monoBassHz, sr, { q: 0.7071 });
    const low = filter(filter(S, c), c);
    for (let i = 0; i < n; i += 1) S[i] -= low[i];
  }
  for (let i = 0; i < n; i += 1) { L[i] = M[i] + S[i]; R[i] = M[i] - S[i]; }
}

// ---------- Статичный тон ----------
export function toneEq(chans, sr, { lowCutHz = 0, highCutHz = 0, warmthDb = 0, presenceDb = 0, airDb = 0, mudDb = 0 } = {}) {
  const cs = [];
  if (lowCutHz > 0) cs.push(biquad('highpass', lowCutHz, sr, { q: 0.7071 }));
  if (highCutHz > 0 && highCutHz < sr * 0.45) cs.push(biquad('lowpass', highCutHz, sr, { q: 0.7071 }));
  if (warmthDb) cs.push(biquad('lowshelf', 160, sr, { gainDb: warmthDb, q: 0.7071 }));
  if (mudDb) cs.push(biquad('peaking', 320, sr, { gainDb: mudDb, q: 1.1 }));
  if (presenceDb) cs.push(biquad('peaking', 3200, sr, { gainDb: presenceDb, q: 0.9 }));
  if (airDb && sr > 24000) cs.push(biquad('highshelf', 10000, sr, { gainDb: airDb, q: 0.7071 }));
  for (const x of chans) for (const c of cs) filter(x, c, x);
}

// ---------- Ручной EQ: фильтры 24 дБ/окт и 6 полос ----------
// Бас 100 Гц (полка), теплота 250, середина 1 к, присутствие 3 к, чёткость 5 к,
// воздух 10 кГц (полка). Верхний/нижний фильтры — Баттерворт 4-го порядка.
const BUTTERWORTH4_Q = [0.5412, 1.3066];

export function manualEq(chans, sr, { hp = 0, lp = 0, bands = {} } = {}) {
  const cs = [];
  if (hp > 20) BUTTERWORTH4_Q.forEach((q) => cs.push(biquad('highpass', hp, sr, { q })));
  if (lp > 0 && lp < sr * 0.45) BUTTERWORTH4_Q.forEach((q) => cs.push(biquad('lowpass', lp, sr, { q })));
  const def = [
    ['bass', 'lowshelf', 100, 0.7071], ['warmth', 'peaking', 250, 0.9], ['mid', 'peaking', 1000, 0.9],
    ['presence', 'peaking', 3000, 1.0], ['clarity', 'peaking', 5000, 1.0], ['air', 'highshelf', 10000, 0.7071],
  ];
  for (const [id, type, f, q] of def) {
    const g = bands[id] || 0;
    if (Math.abs(g) >= 0.05 && f < sr * 0.45) cs.push(biquad(type, f, sr, { gainDb: g, q }));
  }
  for (const x of chans) for (const c of cs) filter(x, c, x);
  return { filters: cs.length };
}
