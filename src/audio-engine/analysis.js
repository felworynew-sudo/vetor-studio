// Диагностика записи перед обработкой: громкость по ITU-R BS.1770-4 / EBU R128
// (интегральная, LRA по EBU Tech 3342), true peak (4×), клиппинг, срез спектра
// (след MP3/AAC), шумовой пол и SNR, реверберация, сетевой гул, стерео, DC и тип
// контента (речь/музыка). По этим цифрам роутер строит цепочку обработки.

import {
  averageSpectrum, biquad, clamp, filter, frameRms, linToDb, mixMono, percentile,
  samplePeakDb, smoothOctave, truePeakDb,
} from './dsp.js';

// ---------- Громкость ----------
function kWeighted(x, sr) {
  // Коэффициенты как в libebur128 (корректны для любой частоты дискретизации).
  let f0 = 1681.974450955533; const G = 3.999843853973347; let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sr);
  const Vh = 10 ** (G / 20); const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sr); a0 = 1 + K / Q + K * K;
  const hp = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return filter(filter(x, shelf), hp);
}

// Префиксные суммы квадратов K-взвешенного сигнала (сумма по каналам, веса 1.0
// для L/R — центральный канал/сурраунд в нашем случае не встречаются).
export function loudnessPrefix(chans, sr) {
  const n = chans[0].length;
  const pre = new Float64Array(n + 1);
  for (const ch of chans.slice(0, 2)) {
    const k = kWeighted(ch, sr);
    let s = 0;
    for (let i = 0; i < n; i += 1) { s += k[i] * k[i]; pre[i + 1] += s; }
  }
  return pre;
}

const toLufs = (p) => -0.691 + 10 * Math.log10(p + 1e-30);

function blockPowers(pre, sr, blockSec, hopSec) {
  const block = Math.round(sr * blockSec); const hop = Math.round(sr * hopSec);
  const n = pre.length - 1; const out = [];
  for (let s = 0; s + block <= n; s += hop) out.push((pre[s + block] - pre[s]) / block);
  return out;
}

export function integratedFromPrefix(pre, sr) {
  const powers = blockPowers(pre, sr, 0.4, 0.1);
  const abs = powers.filter((p) => toLufs(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((p) => toLufs(p) > rel);
  return toLufs(gated.reduce((a, b) => a + b, 0) / (gated.length || 1));
}

export function lraFromPrefix(pre, sr) {
  const st = blockPowers(pre, sr, 3, 0.1);
  const abs = st.filter((p) => toLufs(p) > -70);
  if (abs.length < 2) return 0;
  const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 20;
  const gated = abs.filter((p) => toLufs(p) > rel).map(toLufs);
  if (gated.length < 2) return 0;
  return percentile(gated, 0.95) - percentile(gated, 0.1);
}

export function integratedLufs(chans, sr) { return integratedFromPrefix(loudnessPrefix(chans, sr), sr); }

// Кратковременная громкость (окно 400 мс / 3 с) с шагом hop — для лэвелера.
export function loudnessCurve(pre, sr, blockSec, hopSec) {
  return blockPowers(pre, sr, blockSec, hopSec).map(toLufs);
}

// ---------- Клиппинг ----------
export function detectClipping(chans) {
  let peak = 0;
  for (const c of chans) for (let i = 0; i < c.length; i += 1) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  if (peak < 0.25) return { ratio: 0, level: peak, runs: 0 };
  const level = peak * 0.995;
  let clipped = 0; let runs = 0; let total = 0;
  for (const c of chans) {
    total += c.length;
    let run = 0;
    for (let i = 0; i <= c.length; i += 1) {
      const hit = i < c.length && Math.abs(c[i]) >= level;
      if (hit) run += 1;
      else { if (run >= 3) { clipped += run; runs += 1; } run = 0; }
    }
  }
  return { ratio: clipped / total, level, runs };
}

// ---------- Спектр: срез (MP3/AAC), гул ----------
export function detectCutoff(specDb, sr, N) {
  const nyq = sr / 2; const binHz = sr / N;
  const sm = smoothOctave(specDb, sr, N, 24);
  const at = (f) => sm[clamp(Math.round(f / binHz), 0, sm.length - 1)];
  const mean = (f0, f1) => { let s = 0; let c = 0; for (let f = f0; f <= f1; f += binHz) { s += at(f); c += 1; } return s / (c || 1); };
  let best = { f: nyq, drop: 0 };
  for (let f = 6000; f < nyq - 700; f += binHz * 2) {
    const below = mean(f - 700, f - 150); const above = mean(f + 150, f + 700);
    const drop = below - above;
    if (drop > best.drop) best = { f, drop };
  }
  // Срез засчитываем только если выше него «пусто» почти до Найквиста.
  if (best.drop > 24) {
    const tail = mean(best.f + 300, Math.min(nyq - 200, best.f + 4000));
    const ref = mean(1000, 4000);
    if (ref - tail > 45) {
      // уточнение по почти сырому спектру: последний бин, ещё близкий к уровню под срезом
      const below = mean(best.f - 700, best.f - 150);
      const raw = (k) => (specDb[k - 1] + specDb[k] + specDb[k + 1]) / 3;
      let edge = best.f;
      for (let k = Math.round((best.f - 700) / binHz); k < Math.round((best.f + 700) / binHz) && k < specDb.length - 1; k += 1) {
        if (raw(k) > below - 12) edge = k * binHz;
      }
      return { cutoffHz: Math.round(edge), sharp: true };
    }
  }
  return { cutoffHz: Math.round(nyq), sharp: false };
}

function detectHum(x, sr) {
  const N = 1 << Math.ceil(Math.log2(sr * 2)); // ~0.5 Гц на бин
  const spec = averageSpectrum(x, N, 120);
  const binHz = sr / N;
  const prominence = (f) => {
    const k = Math.round(f / binHz);
    let pk = -Infinity;
    for (let j = k - 2; j <= k + 2; j += 1) if (spec[j] > pk) pk = spec[j];
    let s = 0; let c = 0;
    for (let j = k - 40; j <= k + 40; j += 1) { if (Math.abs(j - k) > 6) { s += spec[j]; c += 1; } }
    return pk - s / c;
  };
  let best = null;
  for (const f0 of [50, 60]) {
    const p1 = prominence(f0); const p2 = prominence(f0 * 2); const p3 = prominence(f0 * 3);
    const score = p1 + Math.max(p2, p3);
    if (p1 > 12 && Math.max(p2, p3) > 8 && (!best || score > best.score)) best = { f0, score, prominence: p1 };
  }
  return best ? { hz: best.f0, prominenceDb: Math.round(best.prominence) } : null;
}

// ---------- Реверберация (оценка RT60 по спадам огибающей) ----------
// От каждого громкого локального пика меряем время спада на 20 дБ по сглаженной
// (50 мс) огибающей; RT60 ≈ 3 × это время. Пики, где следующий слог начался
// раньше, чем огибающая успела упасть, пропускаем. Медиана по пикам.
function estimateReverb(envDb, frameSec, noiseDb) {
  const n = envDb.length; const w = 5;
  const sm = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i += 1) { acc += envDb[i]; if (i >= w) acc -= envDb[i - w]; sm[i] = acc / Math.min(i + 1, w); }
  const p95 = percentile(sm, 0.95);
  const maxFrames = Math.round(1.2 / frameSec);
  const rts = [];
  for (let i = 10; i < n - 10; i += 1) {
    const v = sm[i];
    if (v < p95 - 15 || v - 20 < noiseDb + 6) continue;
    let isPeak = true;
    for (let j = i - 10; j <= i + 10; j += 1) if (sm[j] > v) { isPeak = false; break; }
    if (!isPeak) continue;
    // наклон регрессией по участку −5…−25 дБ от пика (как T20), до нового слога
    let sx = 0; let sy = 0; let sxx = 0; let sxy = 0; let cnt = 0; let runMin = v; let reached = 0;
    const floor = Math.max(v - 25, noiseDb + 4);
    for (let j = i + 1; j < Math.min(n, i + maxFrames); j += 1) {
      const y = sm[j];
      if (y > runMin + 3) break; // новый слог
      runMin = Math.min(runMin, y);
      if (y <= floor) break;
      if (y <= v - 5) { const x = j * frameSec; sx += x; sy += y; sxx += x * x; sxy += x * y; cnt += 1; reached = v - y; }
    }
    if (cnt >= 6 && reached >= 10) {
      const slope = (cnt * sxy - sx * sy) / (cnt * sxx - sx * sx || 1);
      if (slope < -1) rts.push(-60 / slope);
    }
    i += 10;
  }
  if (rts.length < 4) return null;
  // собственный спад фонем + сглаживание огибающей дают ~0.55 с даже у сухой речи;
  // процессы спада складываются примерно квадратично — вычитаем (калибровка на
  // синтетических RIR с RT60 0…1.5 с)
  const est = percentile(rts, 0.5);
  return clamp(Math.sqrt(Math.max(0, est * est - 0.55 * 0.55)), 0.05, 3);
}

// ---------- Тип контента ----------
// Признаки, устойчивые к шуму: слоговая модуляция огибающей, доля энергии ниже
// 120 Гц (у речи её почти нет, у музыки — бас и бочка), паузы, стереоширина.
function classify({ width, pauseRatio, modRatio, cutoffHz, lowDb, channels }) {
  let speech = 0;
  speech += clamp((modRatio - 0.3) / 0.15, -1, 1) * 1.2;
  speech += clamp((pauseRatio - 0.08) / 0.15, -1, 1);
  speech += clamp((-lowDb - 16) / 7, -1, 1) * 1.3;
  speech -= clamp((width - 0.12) / 0.18, 0, 1.5) * 1.6;
  if (channels === 1 || width < 0.02) speech += 0.4;
  if (cutoffHz < 9000) speech += 0.4; // телефон / диктофон
  const pSpeech = 1 / (1 + Math.exp(-speech * 1.4));
  return { kind: pSpeech >= 0.5 ? 'speech' : 'music', confidence: Math.max(pSpeech, 1 - pSpeech) };
}

function modulationRatio(envDb, frameRate) {
  // Доля энергии модуляции огибающей в полосе 2.5–8 Гц (слоговый ритм речи).
  const seg = 256; let inBand = 0; let total = 0;
  const re = new Float64Array(seg); const im = new Float64Array(seg);
  for (let s = 0; s + seg <= envDb.length; s += seg / 2) {
    let mean = 0; for (let i = 0; i < seg; i += 1) mean += envDb[s + i]; mean /= seg;
    for (let i = 0; i < seg; i += 1) { re[i] = (envDb[s + i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / seg)); im[i] = 0; }
    // маленький DFT без зависимостей от размера
    for (let k = 1; k < seg / 2; k += 1) {
      const f = (k * frameRate) / seg;
      if (f < 0.5 || f > 20) continue;
      let r = 0; let m = 0;
      for (let i = 0; i < seg; i += 4) { const a = (2 * Math.PI * k * i) / seg; r += re[i] * Math.cos(a); m -= re[i] * Math.sin(a); }
      const p = r * r + m * m;
      total += p; if (f >= 2.5 && f <= 8) inBand += p;
    }
    if (s > 60000) break;
  }
  return total ? inBand / total : 0;
}

// ---------- Резонансы / «металлик» (характерно для AI-музыки) ----------
function resonanceIndex(specDb, sr, N) {
  const env = smoothOctave(specDb, sr, N, 3);
  const binHz = sr / N; let count = 0;
  for (let k = Math.round(1500 / binHz); k < Math.min(specDb.length - 2, Math.round(14000 / binHz)); k += 1) {
    if (specDb[k] - env[k] > 9 && specDb[k] >= specDb[k - 1] && specDb[k] >= specDb[k + 1]) count += 1;
  }
  return count;
}

export function analyze(chans, sr) {
  const mono = mixMono(chans);
  const n = mono.length;
  const pre = loudnessPrefix(chans, sr);
  const lufs = integratedFromPrefix(pre, sr);
  const lra = lraFromPrefix(pre, sr);
  const tp = truePeakDb(chans);
  const sp = samplePeakDb(chans);
  const clip = detectClipping(chans);

  // Огибающая 10 мс
  const frame = Math.max(1, Math.round(sr * 0.01));
  const env = frameRms(mono, frame);
  const envDb = Array.from(env, (v) => linToDb(v + 1e-9));
  const p95 = percentile(envDb, 0.95);
  const noiseDb = percentile(envDb.filter((v) => v > -120), 0.08);
  const pauseRatio = envDb.filter((v) => v < p95 - 25).length / (envDb.length || 1);
  const snr = p95 - noiseDb;
  // огибающая с полом p95−35 дБ: тишина не превращается в −120 дБ «модуляцию»
  const envC = envDb.map((v) => Math.max(v, p95 - 35));
  const modRatio = modulationRatio(envC, 100);
  const rt60 = estimateReverb(envDb, 0.01, noiseDb);

  let dc = 0; for (let i = 0; i < n; i += 64) dc += mono[i]; dc /= Math.ceil(n / 64) || 1;

  // Стерео
  let width = 0; let corr = 1; let sideToMidDb = -Infinity;
  if (chans.length > 1) {
    const L = chans[0]; const R = chans[1];
    let lr = 0; let ll = 0; let rr = 0; let mm = 0; let ss = 0;
    const step = Math.max(1, Math.floor(n / 400000));
    for (let i = 0; i < n; i += step) {
      lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i];
      const m = (L[i] + R[i]) / 2; const s = (L[i] - R[i]) / 2; mm += m * m; ss += s * s;
    }
    corr = lr / (Math.sqrt(ll * rr) || 1);
    width = 1 - clamp(corr, 0, 1);
    sideToMidDb = 10 * Math.log10((ss + 1e-20) / (mm + 1e-20));
  }

  const N = 4096;
  const specDb = averageSpectrum(mono, N);
  const { cutoffHz, sharp } = detectCutoff(specDb, sr, N);
  const hum = detectHum(mono, sr);
  const resonances = resonanceIndex(specDb, sr, N);
  const binHz = sr / N; let eLow = 0; let eAll = 0;
  // медиана ±4 бина: узкие линии (гул, тон) не считаются «басом»
  for (let k = Math.ceil(20 / binHz); k < specDb.length; k += 1) {
    const win = []; for (let j = Math.max(1, k - 4); j <= Math.min(specDb.length - 1, k + 4); j += 1) win.push(specDb[j]);
    win.sort((x, y) => x - y);
    const e = 10 ** (win[win.length >> 1] / 10); eAll += e; if (k * binHz < 120) eLow += e;
  }
  const lowDb = 10 * Math.log10((eLow + 1e-20) / (eAll + 1e-20));
  const content = classify({ width, pauseRatio, modRatio, cutoffHz, lowDb, channels: chans.length });

  return {
    sampleRate: sr, channels: chans.length, duration: n / sr,
    lufs, lra, truePeakDb: tp, samplePeakDb: sp,
    clipping: clip, dcOffset: dc,
    noiseFloorDb: noiseDb, snrDb: snr, pauseRatio, modRatio,
    rt60, hum, cutoffHz, bandLimited: sharp || sr < 32000, resonances,
    stereo: { correlation: corr, width, sideToMidDb },
    content, lowDb,
    spectrum: { N, db: Array.from(smoothOctave(specDb, sr, N, 6)) },
  };
}
