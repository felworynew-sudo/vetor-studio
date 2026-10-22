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
  applyGain, compressor, dynamicEq, exciter, expander, leveler, manualEq, stereoTools, toneEq, tonalDrift, truePeakLimit,
} from './dynamics.js';
import {
  applyCurve, autoToneCurve, correctionCurve, profileOf,
} from './match.js';
import { dfnDenoise, rnnoiseDenoise } from './neural.js';
import { declick, declip, dehum, removeDc } from './restore.js';
import {
  extendBandwidth, spectralDenoise, suppressLateReverb, suppressResonances,
} from './spectral.js';

export const MODES = ['auto', 'voice', 'podcast', 'restore', 'music', 'ai', 'master'];

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
  const podcast = kind === 'podcast';
  const nyq = a.sampleRate / 2;
  const steps = [];
  const on = (v, auto) => (v === 'on' ? true : v === 'off' ? false : auto);
  const speechLike = kind === 'voice' || kind === 'podcast' || kind === 'restore';
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
    // «Речь»: полоса уже (низ режем до 110 Гц, верх до 14 кГц), «Подкаст»: шире (60 Гц – 16 кГц)
    steps.push({ id: 'tone', lowCutHz: podcast ? 60 : 110, highCutHz: podcast ? 16000 : 14000, warmthDb: opts.tone?.warmth || 0, presenceDb: 1.2 * k + (opts.tone?.presence || 0), airDb: (a.cutoffHz > 12500 ? 1.2 * k : 0) + (opts.tone?.air || 0) });
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
    // автобаланс тембра: без референса подводим спектр к типичному для музыки (мягко, до ±3 дБ)
    if (!(kind === 'master' && ref) && !opts.albumProfile && on(opts.autotone, true)) steps.push({ id: 'autotone', strength: clamp(0.45 * k, 0.15, 0.7), cutoffHz: a.bandLimited ? a.cutoffHz : 0 });
    const bands = MUSIC_BANDS.map((b) => (kind === 'ai' && b.id !== 'boom' ? { ...b, maxCut: b.maxCut + 2 } : b));
    steps.push({ id: 'dyneq', bands, amount: k });
    if (a.duration > 30) steps.push({ id: 'drift', amount: clamp((kind === 'ai' ? 0.8 : 0.5) * k, 0.2, 1) });
    if (opts.tone && (opts.tone.warmth || opts.tone.presence || opts.tone.air)) steps.push({ id: 'tone', warmthDb: opts.tone.warmth || 0, presenceDb: opts.tone.presence || 0, airDb: opts.tone.air || 0 });
    // гармоники верха: только если верх настоящий (нет среза MP3 ниже ~15 кГц)
    if (on(opts.exciter, !a.bandLimited || a.cutoffHz > 15000) && a.sampleRate >= 40000) steps.push({ id: 'exciter', amount: clamp(0.5 * k, 0.15, 0.9) });
    if (a.channels > 1) {
      let width = 1;
      if (kind === 'master' && ref && ref.sideToMid > 0 && a.stereo.sideToMidDb > -40) {
        width = clamp(ref.sideToMid / (10 ** (a.stereo.sideToMidDb / 20)), 0.85, 1.2);
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
  // «как у референса» без референса (или мусор в настройке) → безопасная цель, а не NaN
  let target = opts.targetLufs === 'ref' ? opts.reference?.lufs : Number(opts.targetLufs);
  // музыка в «авто»: не тише оригинала (но не выше −8 и не ниже −14), речь — −16
  if (!Number.isFinite(target)) target = speechLike ? -16 : Number.isFinite(a.lufs) ? clamp(a.lufs, -14, -8) : -14;
  target += applyManual(steps, opts.manual);
  steps.push({ id: 'loudness', targetLufs: target });
  steps.push({ id: 'limiter', ceilingDb: opts.ceilingDb ?? -1, releaseMs: speechLike ? 60 : 120, targetLufs: target });
  return { kind, steps };
}

// Ручные настройки — слой поверх пресета: каждая включённая группа подменяет свой
// блок цепочки, остальное остаётся от выбранного режима. Возвращает сдвиг цели (дБ).
export function applyManual(steps, m) {
  if (!m) return 0;
  const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d);
  if (m.eq?.on) {
    for (let i = steps.length - 1; i >= 0; i -= 1) if (steps[i].id === 'tone' || steps[i].id === 'autotone') steps.splice(i, 1);
    const at = steps.findIndex((x) => x.id === 'dyneq');
    const bands = {};
    for (const id of ['bass', 'warmth', 'mid', 'presence', 'clarity', 'air']) bands[id] = num(m.eq[id], -12, 12, 0);
    steps.splice(at < 0 ? 1 : at, 0, { id: 'meq', hp: num(m.eq.hp, 20, 500, 20), lp: num(m.eq.lp, 2000, 20000, 20000), bands });
  }
  if (m.noise?.on) {
    const amount = num(m.noise.amount, 0, 1, 0.5);
    for (const x of steps) {
      if (x.id === 'denoise') { x.attenLimDb = Math.round(6 + amount * 94); x.manual = true; }
      if (x.id === 'spectral-denoise' && x.label !== 'fizz') { x.reductionDb = Math.round(amount * 18); x.manual = true; }
    }
  }
  if (m.comp?.on) {
    const c = steps.map((x) => x.id).lastIndexOf('compressor');
    const manual = {
      thresholdDb: num(m.comp.threshold, -60, 0, -24), ratio: num(m.comp.ratio, 1, 20, 3),
      attack: num(m.comp.attackMs, 0.1, 100, 10) / 1000, release: num(m.comp.releaseMs, 10, 1000, 150) / 1000, kneeDb: num(m.comp.kneeDb, 0, 40, 6),
    };
    if (c >= 0) steps[c] = { ...steps[c], manual }; else steps.splice(Math.max(1, steps.length - 1), 0, { id: 'compressor', kind: 'voice', manual });
  }
  if (m.gate?.on) {
    for (let i = steps.length - 1; i >= 0; i -= 1) if (steps[i].id === 'expander') steps.splice(i, 1);
    const c = steps.map((x) => x.id).lastIndexOf('compressor');
    steps.splice(c < 0 ? steps.length : c + 1, 0, { id: 'expander', manual: { thresholdDb: num(m.gate.threshold, -90, -20, -55) } });
  }
  if (m.deess?.on) {
    const dyn = steps.find((x) => x.id === 'dyneq');
    const depth = num(m.deess.depthDb, 0, 12, 4);
    if (dyn) {
      const rest = dyn.bands.filter((b) => b.id !== 'sibilance');
      dyn.bands = depth > 0 ? [...rest, { id: 'sibilance', f: 6500, q: 2.2, thresh: 2, maxCut: depth, ratio: 4, attack: 0.001, release: 0.05 }] : rest;
    }
  }
  return m.out?.on ? num(m.out.gainDb, -12, 12, 0) : 0;
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
      if (s.manual) {
        expander(chans, sr, { thresholdDb: s.manual.thresholdDb, ratio: 3, rangeDb: 24 });
        return { thresholdDb: Math.round(s.manual.thresholdDb), manual: true };
      }
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
          const out = await ctx.apollo(chans, sr, prog, { cutoffHz: s.cutoffHz });
          out.forEach((c, i) => { chans[i] = c; });
          return { cutoffHz: s.cutoffHz, engine: 'apollo', device: ctx.apolloDevice?.() };
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
    case 'autotone': {
      const curve = autoToneCurve(profileOf(chans, sr), { strength: s.strength, cutoffHz: s.cutoffHz });
      const out = applyCurve(chans, sr, curve);
      out.forEach((c, i) => { chans[i] = c; });
      let maxBoost = 0; let maxCut = 0;
      for (const v of curve) { if (v > maxBoost) maxBoost = v; if (v < maxCut) maxCut = v; }
      return { maxBoostDb: Math.round(maxBoost * 10) / 10, maxCutDb: Math.round(maxCut * 10) / 10 };
    }
    case 'exciter': return exciter(chans, sr, { amount: s.amount });
    case 'dyneq': return { bands: dynamicEq(chans, sr, s.bands, { amount: s.amount }) };
    case 'drift': return { bands: tonalDrift(chans, sr, { amount: s.amount }) };
    case 'tone': toneEq(chans, sr, s); return null;
    case 'meq': return manualEq(chans, sr, s);
    case 'stereo': stereoTools(chans, sr, s); return { width: Math.round(s.width * 100) / 100, monoBassHz: s.monoBassHz };
    case 'leveler': {
      const pre = loudnessPrefix(chans, sr);
      return leveler(chans, sr, loudnessCurve(pre, sr, 0.4, 0.1), 0.1, { amount: s.amount });
    }
    case 'compressor': {
      if (s.manual) return { ...compressor(chans, sr, { ...s.manual, rmsSec: 0.01 }), manual: true };
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

// Что обработка реально изменила, при выровненной громкости: сдвиг по октавам (дБ),
// громкость/пик и «остаток» — энергия разницы сигналов относительно самого сигнала.
const REPORT_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export function compareReport(before, after, sr, {
  beforeLufs, afterLufs, beforePeak, afterPeak,
} = {}) {
  const N = 4096; const b = mixMono(before); const a = mixMono(after);
  const sb = averageSpectrum(b, N); const sa = averageSpectrum(a, N);
  const energy = (db, f0, f1) => {
    let e = 0;
    for (let k = Math.max(1, Math.round((f0 * N) / sr)); k <= Math.round((f1 * N) / sr) && k < db.length; k += 1) e += 10 ** (db[k] / 10);
    return 10 * Math.log10(e + 1e-20);
  };
  const raw = REPORT_BANDS.filter((f) => f * 1.41 < sr * 0.47).map((f) => ({ f, d: energy(sa, f / 1.41, f * 1.41) - energy(sb, f / 1.41, f * 1.41) }));
  const ref = raw.filter((x) => x.f >= 125 && x.f <= 4000); const mean = ref.reduce((t, x) => t + x.d, 0) / (ref.length || 1);
  const bands = raw.map((x) => ({ f: x.f, db: Math.round((x.d - mean) * 10) / 10 }));
  const lufsOk = Number.isFinite(beforeLufs) && Number.isFinite(afterLufs);
  const g = lufsOk ? 10 ** ((beforeLufs - afterLufs) / 20) : 1;
  let se = 0; let sd = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) { se += b[i] * b[i]; const d = a[i] * g - b[i]; sd += d * d; }
  return {
    bands,
    maxBandDb: Math.max(0, ...bands.map((x) => Math.abs(x.db))),
    lufsDelta: lufsOk ? Math.round((afterLufs - beforeLufs) * 10) / 10 : null,
    peakDelta: Number.isFinite(beforePeak) && Number.isFinite(afterPeak) ? Math.round((afterPeak - beforePeak) * 10) / 10 : null,
    residualDb: se > 0 ? Math.round(10 * Math.log10(sd / se + 1e-12) * 10) / 10 : null,
  };
}

export { analyze, profileOf };
