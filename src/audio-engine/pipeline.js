// Роутер и исполнитель цепочки. По диагностике (analysis.js) и режиму строится
// список шагов: каждый дефект получает свой инструмент, а лишние стадии не
// запускаются (чистую музыку не гоняем через речевой шумодав, верх не
// «восстанавливаем», если среза нет, и т. д.).

import {
  analyze, integratedFromPrefix, loudnessCurve, loudnessPrefix, lraFromPrefix,
} from './analysis.js';
import {
  averageSpectrum, clamp, frameRms, linToDb, mixMono, percentile, smoothOctave, truePeakDb,
} from './dsp.js';
import {
  applyGain, compressor, dynamicEq, expander, leveler, stereoTools, toneEq, tonalDrift, truePeakLimit,
} from './dynamics.js';
import { applyCurve, correctionCurve, profileOf } from './match.js';
import { dfnDenoise, rnnoiseDenoise } from './neural.js';
import { declick, declip, dehum, removeDc } from './restore.js';
import {
  extendBandwidth, spectralDenoise, suppressLateReverb, suppressResonances,
} from './spectral.js';

export const MODES = ['auto', 'voice', 'restore', 'music', 'ai', 'master'];

const VOICE_BANDS = [
  { id: 'mud', f: 300, q: 1.2, thresh: 4, maxCut: 4, ratio: 3, attack: 0.008, release: 0.12 },
  { id: 'harsh', f: 3200, q: 1.3, thresh: 4, maxCut: 4, ratio: 3, attack: 0.003, release: 0.08 },
  { id: 'sibilance', f: 7000, q: 2, thresh: 3, maxCut: 8, ratio: 4, attack: 0.001, release: 0.05 },
];
const MUSIC_BANDS = [
  { id: 'boom', f: 150, q: 0.8, thresh: 4, maxCut: 3, ratio: 2.5, attack: 0.015, release: 0.2 },
  { id: 'harsh', f: 3500, q: 0.9, thresh: 3.5, maxCut: 3, ratio: 2.5, attack: 0.005, release: 0.12 },
  { id: 'sibilance', f: 7500, q: 1.4, thresh: 3, maxCut: 4, ratio: 3, attack: 0.002, release: 0.07 },
];

// opts: { targetLufs, ceilingDb, intensity 0..1, dereverb, declip, declick, denoise,
//         bwe ('auto'|'on'|'off'), tone {warmth, presence, air}, monoBass, reference,
//         albumProfile, neural ('dfn'|'rnnoise'|'none') }
export function plan(a, mode, opts = {}) {
  const k = 0.4 + clamp(opts.intensity ?? 0.6, 0, 1); // множитель интенсивности 0.4…1.4
  const kind = mode === 'auto' ? (a.content.kind === 'speech' ? 'voice' : 'music') : mode;
  const nyq = a.sampleRate / 2;
  const steps = [];
  const on = (v, auto) => (v === 'on' ? true : v === 'off' ? false : auto);
  const speechLike = kind === 'voice' || kind === 'restore';
  const restore = kind === 'restore';

  steps.push({ id: 'dc' });
  if (a.hum && on(opts.dehum, true)) steps.push({ id: 'hum', f0: a.hum.hz });
  if (on(opts.declip, a.clipping.ratio > (speechLike ? 0.0003 : 0.0001))) steps.push({ id: 'declip', level: a.clipping.level });
  if (on(opts.declick, restore)) steps.push({ id: 'declick', sensitivity: restore ? 0.6 : 0.45 });

  if (speechLike) {
    const rtGate = restore ? 0.35 : 0.55;
    if (on(opts.dereverb, a.rt60 != null && a.rt60 > rtGate)) {
      steps.push({ id: 'dereverb', rt60: Math.max(0.3, a.rt60 ?? 0.6), strength: clamp((restore ? 1.4 : 1) * k, 0.4, 1.8), maxCutDb: restore ? 30 : 24 });
    }
    const noisy = a.snrDb < 50 || a.noiseFloorDb > -66;
    if (on(opts.denoise, noisy)) {
      let atten = a.snrDb < 12 ? 100 : a.snrDb < 20 ? 40 : a.snrDb < 30 ? 26 : 16;
      if (restore) atten = Math.min(100, atten + 12);
      atten = clamp(atten * k, 8, 100);
      steps.push({ id: 'denoise', engine: opts.neural || 'dfn', attenLimDb: Math.round(atten), postFilterBeta: a.snrDb < 20 ? 0.02 : 0 });
    }
    steps.push({ id: 'tone', lowCutHz: 75, warmthDb: opts.tone?.warmth || 0, presenceDb: 1.2 * k + (opts.tone?.presence || 0), airDb: (a.cutoffHz > 12500 ? 1.2 * k : 0) + (opts.tone?.air || 0) });
    steps.push({ id: 'dyneq', bands: VOICE_BANDS, amount: k });
    if (on(opts.leveler, a.lra > 5 || restore)) steps.push({ id: 'leveler', amount: clamp(0.7 * k, 0.3, 1) });
    steps.push({ id: 'compressor', kind: 'voice', ratio: 2 + 1.2 * k });
    // экспандер после компрессора: гасит в паузах то, что компрессия и лэвелер подняли
    steps.push({ id: 'expander', rangeDb: restore ? 18 : 12 });
  } else {
    // Срез MP3/AAC → нейро-реставрация Apollo первой, на сырой сигнал (так её учили).
    // Без WebGPU или при ошибке загрузки воркер подменит шаг на SBR.
    const codecCut = a.bandLimited && a.cutoffHz > 5000 && a.cutoffHz <= 19000 && a.cutoffHz < nyq - 1200;
    const useApollo = on(opts.apollo, codecCut) && a.cutoffHz < nyq - 1200;
    if (useApollo) steps.push({ id: 'apollo', cutoffHz: a.cutoffHz, amount: clamp(0.55 * k, 0.2, 1) });
    // шум у музыки оцениваем только по настоящим паузам/затуханиям: без них «пол»
    // огибающей — это просто тихие места трека
    const hiss = a.snrDb > 25 && a.noiseFloorDb > -62 && a.snrDb < 48;
    if (on(opts.denoise, hiss)) steps.push({ id: 'spectral-denoise', reductionDb: Math.round(6 * k), fMin: 2000 });
    if (kind === 'ai') steps.push({ id: 'spectral-denoise', reductionDb: Math.round(4 * k), fMin: 9000, label: 'fizz' });
    const resDepth = kind === 'ai' ? 0.55 * k : a.resonances > 6 ? 0.22 * k : 0;
    if (resDepth > 0) steps.push({ id: 'resonance', depth: resDepth });
    const bweAuto = a.bandLimited && a.cutoffHz > 7000 && a.cutoffHz <= 16500 && a.cutoffHz < nyq - 1200;
    if (!useApollo && on(opts.bwe, bweAuto) && a.cutoffHz < nyq - 1200) steps.push({ id: 'bwe', cutoffHz: a.cutoffHz, amount: clamp(0.55 * k, 0.2, 1) });
    const ref = opts.reference || (opts.albumProfile ? opts.albumProfile : null);
    if (kind === 'master' && ref) steps.push({ id: 'match', strength: clamp(0.8 * k, 0.3, 1), reference: ref, cutoffHz: a.bandLimited ? a.cutoffHz : 0 });
    else if (opts.albumProfile) steps.push({ id: 'match', strength: 0.45, reference: opts.albumProfile, cutoffHz: a.bandLimited ? a.cutoffHz : 0 });
    const bands = MUSIC_BANDS.map((b) => (kind === 'ai' && b.id !== 'boom' ? { ...b, maxCut: b.maxCut + 2 } : b));
    steps.push({ id: 'dyneq', bands, amount: k });
    if (a.duration > 30) steps.push({ id: 'drift', amount: clamp((kind === 'ai' ? 0.8 : 0.5) * k, 0.2, 1) });
    if (opts.tone && (opts.tone.warmth || opts.tone.presence || opts.tone.air)) steps.push({ id: 'tone', warmthDb: opts.tone.warmth || 0, presenceDb: opts.tone.presence || 0, airDb: opts.tone.air || 0 });
    if (a.channels > 1) {
      let width = 1;
      if (kind === 'master' && ref && ref.sideToMid > 0 && a.stereo.sideToMidDb > -40) {
        width = clamp(ref.sideToMid / (10 ** (a.stereo.sideToMidDb / 20)), 0.75, 1.35);
      }
      if (width !== 1 || opts.monoBass) steps.push({ id: 'stereo', width, monoBassHz: opts.monoBass ? 120 : 0 });
    }
    // Мастеринг по референсу переносит и динамику: если трек «шире» референса по
    // разбросу громкости (LRA) или пикам над громкостью (PLR) — сжимаем сильнее.
    let ratio = 1.3 + 0.4 * k;
    if (kind === 'master' && ref && Number.isFinite(ref.lra)) {
      const plrTrack = a.truePeakDb - a.lufs;
      const over = Math.max(a.lra - ref.lra, Number.isFinite(ref.plr) ? (plrTrack - ref.plr) / 2 : 0);
      ratio = clamp(1.2 + over * 0.35, 1.1, 4);
    }
    steps.push({ id: 'compressor', kind: 'music', ratio });
  }
  const target = opts.targetLufs === 'ref' && opts.reference?.lufs ? opts.reference.lufs : Number(opts.targetLufs ?? (speechLike ? -16 : -14));
  steps.push({ id: 'loudness', targetLufs: target });
  steps.push({ id: 'limiter', ceilingDb: opts.ceilingDb ?? -1, releaseMs: speechLike ? 60 : 120, targetLufs: target });
  return { kind, steps };
}

// Исполнение. ctx: { onStep(id, i, n), onProgress(p), neuralBase }
export async function run(input, sr, planned, ctx = {}) {
  const chans = input.map((c) => Float32Array.from(c));
  const log = [];
  const { steps } = planned;
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    ctx.onStep?.(s.id, i, steps.length);
    const prog = (p) => ctx.onProgress?.((i + clamp(p, 0, 1)) / steps.length);
    const t0 = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const info = await runStep(s, chans, sr, prog, ctx);
    log.push({ id: s.id, ms: Date.now() - t0, ...(info || {}) });
    await new Promise((r) => setTimeout(r, 0)); // eslint-disable-line no-await-in-loop
  }
  return { chans, log };
}

async function runStep(s, chans, sr, prog, ctx) {
  switch (s.id) {
    case 'dc': removeDc(chans, sr); return null;
    case 'hum': return { f0: s.f0, ...dehum(chans, sr, s.f0) };
    case 'declip': return declip(chans, sr, { level: s.level });
    case 'declick': return declick(chans, sr, { sensitivity: s.sensitivity });
    case 'dereverb':
      for (let c = 0; c < chans.length; c += 1) {
        chans[c] = suppressLateReverb(chans[c], sr, s.rt60, { strength: s.strength, lateMs: 40, maxCutDb: s.maxCutDb, onProgress: (p) => prog((c + p) / chans.length) });
      }
      return { rt60: Math.round(s.rt60 * 100) / 100, strength: Math.round(s.strength * 100) / 100 };
    case 'denoise': return denoiseStep(s, chans, sr, prog, ctx);
    case 'expander': {
      const env = frameRms(mixMono(chans), Math.round(sr * 0.02));
      const db = Array.from(env, (v) => linToDb(v + 1e-9)).filter((v) => v > -110);
      // порог — на 30 дБ ниже уровня речи (но не ниже шумового пола + 9)
      const thr = Math.max(percentile(db, 0.1) + 9, percentile(db, 0.9) - 30);
      expander(chans, sr, { thresholdDb: thr, ratio: 2.5, rangeDb: s.rangeDb ?? 12 });
      return { thresholdDb: Math.round(thr) };
    }
    case 'spectral-denoise':
      for (let c = 0; c < chans.length; c += 1) chans[c] = spectralDenoise(chans[c], sr, { reductionDb: s.reductionDb, fMin: s.fMin, onProgress: (p) => prog((c + p) / chans.length) });
      return { reductionDb: s.reductionDb, fMin: s.fMin, label: s.label };
    case 'resonance': {
      const out = suppressResonances(chans, sr, { depth: s.depth, onProgress: prog });
      out.forEach((c, i) => { chans[i] = c; });
      return { depth: Math.round(s.depth * 100) / 100 };
    }
    case 'bwe':
      for (let c = 0; c < chans.length; c += 1) chans[c] = extendBandwidth(chans[c], sr, s.cutoffHz, { amount: s.amount, onProgress: (p) => prog((c + p) / chans.length) });
      return { cutoffHz: s.cutoffHz };
    case 'apollo': {
      if (ctx.apollo) {
        try {
          const out = await ctx.apollo(chans, sr, prog);
          out.forEach((c, i) => { chans[i] = c; });
          return { cutoffHz: s.cutoffHz, engine: 'apollo' };
        } catch (e) {
          ctx.onWarn?.(`Apollo: ${e.message || e}`);
        }
      }
      for (let c = 0; c < chans.length; c += 1) chans[c] = extendBandwidth(chans[c], sr, s.cutoffHz, { amount: s.amount, onProgress: (p) => prog((c + p) / chans.length) });
      return { cutoffHz: s.cutoffHz, engine: 'sbr' };
    }
    case 'match': {
      const prof = profileOf(chans, sr);
      const curve = correctionCurve(prof, s.reference, { strength: s.strength, cutoffHz: s.cutoffHz });
      const out = applyCurve(chans, sr, curve);
      out.forEach((c, i) => { chans[i] = c; });
      let maxBoost = 0; let maxCut = 0;
      for (const v of curve) { if (v > maxBoost) maxBoost = v; if (v < maxCut) maxCut = v; }
      return { maxBoostDb: Math.round(maxBoost * 10) / 10, maxCutDb: Math.round(maxCut * 10) / 10 };
    }
    case 'dyneq': return { bands: dynamicEq(chans, sr, s.bands, { amount: s.amount }) };
    case 'drift': return { bands: tonalDrift(chans, sr, { amount: s.amount }) };
    case 'tone': toneEq(chans, sr, s); return null;
    case 'stereo': stereoTools(chans, sr, s); return { width: Math.round(s.width * 100) / 100, monoBassHz: s.monoBassHz };
    case 'leveler': {
      const pre = loudnessPrefix(chans, sr);
      return leveler(chans, sr, loudnessCurve(pre, sr, 0.4, 0.1), 0.1, { amount: s.amount });
    }
    case 'compressor': {
      const env = frameRms(mixMono(chans), Math.round(sr * 0.05));
      const db = Array.from(env, (v) => linToDb(v + 1e-9)).filter((v) => v > -80);
      const voice = s.kind === 'voice';
      const thr = percentile(db, voice ? 0.8 : 0.9) - (voice ? 4 : 2);
      return compressor(chans, sr, voice
        ? { thresholdDb: thr, ratio: s.ratio, attack: 0.008, release: 0.12, rmsSec: 0.01 }
        : { thresholdDb: thr, ratio: s.ratio, attack: 0.025, release: 0.2, rmsSec: 0.05, kneeDb: 8 });
    }
    case 'loudness': {
      const lufs = integratedFromPrefix(loudnessPrefix(chans, sr), sr);
      if (!Number.isFinite(lufs)) return null;
      const gain = clamp(s.targetLufs - lufs, -30, 30);
      applyGain(chans, gain);
      return { fromLufs: Math.round(lufs * 10) / 10, gainDb: Math.round(gain * 10) / 10 };
    }
    case 'limiter': {
      // лимитер снижает интегральную громкость — доводим до цели за 2–3 итерации
      const target = s.targetLufs;
      let info = truePeakLimit(chans, sr, { ceilingDb: s.ceilingDb, releaseMs: s.releaseMs });
      for (let it = 0; it < 3 && Number.isFinite(target); it += 1) {
        const l = integratedFromPrefix(loudnessPrefix(chans, sr), sr);
        const diff = target - l;
        if (!Number.isFinite(l) || Math.abs(diff) < 0.15) break;
        applyGain(chans, clamp(diff, -6, 4));
        info = truePeakLimit(chans, sr, { ceilingDb: s.ceilingDb, releaseMs: s.releaseMs });
      }
      return info;
    }
    default: return null;
  }
}

async function denoiseStep(s, chans, sr, prog, ctx) {
  // Почти-моно (голос в стерео) — шумодавим середину и раздаём на оба канала:
  // вдвое быстрее и без рассогласования каналов.
  let corr = 1;
  if (chans.length > 1) {
    const [L, R] = chans; let lr = 0; let ll = 0; let rr = 0;
    for (let i = 0; i < L.length; i += 7) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; }
    corr = lr / (Math.sqrt(ll * rr) || 1);
  }
  const monoPath = chans.length > 1 && corr > 0.97;
  const inputs = monoPath ? [mixMono(chans)] : chans;
  let engine = s.engine;
  const outs = [];
  for (let c = 0; c < inputs.length; c += 1) {
    const p = (q) => prog((c + q) / inputs.length);
    let y = null;
    if (engine === 'dfn') {
      try {
        // eslint-disable-next-line no-await-in-loop
        y = await dfnDenoise(inputs[c], sr, { attenLimDb: s.attenLimDb, postFilterBeta: s.postFilterBeta, channel: c, onProgress: p });
      } catch (e) {
        ctx.onWarn?.(`dfn: ${e.message || e}`);
        engine = 'rnnoise';
      }
    }
    if (!y && engine === 'rnnoise') {
      try {
        // eslint-disable-next-line no-await-in-loop
        y = await rnnoiseDenoise(inputs[c], sr, { mix: clamp(s.attenLimDb / 40, 0.5, 1), onProgress: p });
      } catch (e) {
        ctx.onWarn?.(`rnnoise: ${e.message || e}`);
        engine = 'spectral';
      }
    }
    if (!y) { engine = 'spectral'; y = spectralDenoise(inputs[c], sr, { reductionDb: clamp(s.attenLimDb / 2, 8, 18), onProgress: p }); }
    outs.push(y);
  }
  if (monoPath) { chans[0] = outs[0]; for (let c = 1; c < chans.length; c += 1) chans[c] = Float32Array.from(outs[0]); } else outs.forEach((y, i) => { chans[i] = y; });
  return { engine, attenLimDb: s.attenLimDb, monoPath };
}

// Короткий отчёт «после»: громкость, true peak, LRA, спектр.
export function measure(chans, sr) {
  const pre = loudnessPrefix(chans, sr);
  return {
    lufs: integratedFromPrefix(pre, sr), lra: lraFromPrefix(pre, sr), truePeakDb: truePeakDb(chans),
    spectrum: { N: 4096, db: Array.from(smoothOctave(averageSpectrum(mixMono(chans), 4096), sr, 4096, 6)) },
  };
}

export { analyze, profileOf };
