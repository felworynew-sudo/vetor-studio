// Проверка аудио-движка на синтетических сигналах с известным ответом.
// Запуск: node scripts/test-audio-engine.mjs
import { analyze, integratedLufs, detectCutoff } from '../src/audio-engine/analysis.js';
import {
  averageSpectrum, fft, resample, samplePeakDb, stftProcess, truePeakDb, linToDb,
} from '../src/audio-engine/dsp.js';
import { dynamicEq, manualEq, truePeakLimit } from '../src/audio-engine/dynamics.js';
import { applyCurve, correctionCurve, fftConvolve, profileOf } from '../src/audio-engine/match.js';
import { declick, declip } from '../src/audio-engine/restore.js';
import {
  extendBandwidth, spectralDenoise, suppressLateReverb, suppressResonances,
} from '../src/audio-engine/spectral.js';
import { plan, run } from '../src/audio-engine/pipeline.js';

const SR = 48000;
let fails = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
}
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let s = 0; for (let i = 0; i < 6; i += 1) s += rnd(); return (s - 3) / Math.sqrt(0.5); };
const sine = (f, a, sec, ph = 0, sr = SR) => Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr + ph));
const noise = (a, sec) => Float32Array.from({ length: Math.round(sec * SR) }, () => a * gauss());
const snrDb = (ref, x, from = 0, to = ref.length) => {
  let s = 0; let e = 0;
  for (let i = from; i < to; i += 1) { s += ref[i] * ref[i]; e += (x[i] - ref[i]) ** 2; }
  return 10 * Math.log10(s / (e + 1e-30));
};
const bandEnergyDb = (x, f0, f1) => {
  const N = 4096; const db = averageSpectrum(x, N);
  let s = 0; for (let k = Math.round(f0 / (SR / N)); k <= Math.round(f1 / (SR / N)); k += 1) s += 10 ** (db[k] / 10);
  return 10 * Math.log10(s);
};
const t = (label, fn) => { const t0 = Date.now(); fn(); console.log(`   (${label}: ${Date.now() - t0} мс)`); };

// 1. LUFS: EBU Tech 3341 — стерео синус 1 кГц, −23 dBFS → −23.0 LUFS (±0.1)
t('lufs', () => {
  const a = 10 ** (-23 / 20); const s = sine(1000, a, 20);
  const l = integratedLufs([s, s], SR);
  check('LUFS по тест-вектору EBU (синус 1 кГц −23 dBFS → −23 LUFS)', Math.abs(l + 23) < 0.1, `${l.toFixed(2)} LUFS`);
  const s44 = sine(1000, a, 20, 0, 44100);
  const l44 = integratedLufs([s44, s44], 44100);
  check('LUFS на 44.1 кГц', Math.abs(l44 + 23) < 0.1, `${l44.toFixed(2)} LUFS`);
});

// 2. True peak: синус fs/4 с фазой 45° — сэмплы ±0.707, реальный пик 1.0
t('tp', () => {
  const x = Float32Array.from({ length: 48000 }, (_, i) => Math.sin((Math.PI / 2) * i + Math.PI / 4));
  const tp = truePeakDb([x]); const sp = samplePeakDb([x]);
  check('True peak видит межсэмпловый пик (sample −3.01, true ≈ 0 dBTP)', Math.abs(tp) < 0.3 && Math.abs(sp + 3.01) < 0.05, `sample ${sp.toFixed(2)} / true ${tp.toFixed(2)}`);
});

// 3. Лимитер: громкий широкополосный сигнал +6 dBTP → потолок −1 dBTP
t('limiter', () => {
  const n = noise(0.3, 8); const s1 = sine(997, 0.6, 8); const s2 = sine(11999, 0.5, 8, 1);
  const L = n.map((v, i) => v + s1[i] + s2[i]);
  const R = L.map((v, i) => v * 0.9 + 0.1 * s2[i]);
  const g = 10 ** ((6 - truePeakDb([L, R])) / 20);
  for (let i = 0; i < L.length; i += 1) { L[i] *= g; R[i] *= g; }
  const before = truePeakDb([L, R]);
  truePeakLimit([L, R], SR, { ceilingDb: -1 });
  const after = truePeakDb([L, R]);
  check('True-peak лимитер держит −1 dBTP', after <= -0.95, `${before.toFixed(2)} → ${after.toFixed(2)} dBTP`);
});

// 4. Declip: сумма синусов, клип на 0.5 → восстановление
t('declip', () => {
  const sec = 3;
  const ref = sine(220, 0.5, sec).map((v, i) => v + 0.3 * Math.sin(2 * Math.PI * 660 * i / SR + 0.4) + 0.15 * Math.sin(2 * Math.PI * 1500 * i / SR));
  const clipped = ref.map((v) => Math.max(-0.55, Math.min(0.55, v)));
  const fixed = Float32Array.from(clipped);
  const r = declip([fixed], SR, { level: 0.55 * 0.999 });
  const before = snrDb(ref, clipped); const after = snrDb(ref, fixed);
  check('Declip улучшает SNR на ≥ 10 дБ', after - before >= 10, `${before.toFixed(1)} → ${after.toFixed(1)} дБ, восстановлено ${r.repairedSamples} сэмплов`);
});

// 5. Declick: тон + речеподобная АМ + 40 щелчков
t('declick', () => {
  const sec = 4; const ref = sine(310, 0.2, sec).map((v, i) => v * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * i / SR)) + 0.1 * Math.sin(2 * Math.PI * 1234 * i / SR));
  const x = Float32Array.from(ref);
  for (let c = 0; c < 40; c += 1) { const p = 2000 + Math.floor(rnd() * (x.length - 4000)); x[p] += (rnd() > 0.5 ? 1 : -1) * 0.6; x[p + 1] += 0.3; }
  const before = snrDb(ref, x);
  const r = declick([x], SR, { sensitivity: 0.5 });
  const after = snrDb(ref, x);
  check('Declick находит щелчки и поднимает SNR ≥ 15 дБ', r.clicks >= 35 && after - before >= 15, `найдено ${r.clicks}/40, SNR ${before.toFixed(1)} → ${after.toFixed(1)} дБ`);
  const clean = Float32Array.from(ref); const r2 = declick([clean], SR, { sensitivity: 0.5 });
  check('Declick не трогает чистый сигнал', r2.clicks <= 2, `ложных срабатываний ${r2.clicks}`);
});

// 6. Спектральный шумодав: тон с паузами + белый шум
t('denoise', () => {
  const sec = 6; const ref = sine(800, 0.3, sec).map((v, i) => ((Math.floor(i / (SR * 0.5)) % 2) ? v : 0));
  const nz = noise(0.02, sec); const x = ref.map((v, i) => v + nz[i]);
  const y = spectralDenoise(x, SR, { reductionDb: 14 });
  check('Спектральный шумодав поднимает SNR ≥ 6 дБ', snrDb(ref, y) - snrDb(ref, x) >= 6, `${snrDb(ref, x).toFixed(1)} → ${snrDb(ref, y).toFixed(1)} дБ`);
});

// 7. STFT: без обработки — точная реконструкция
t('stft', () => {
  const x = noise(0.3, 2); const y = stftProcess(x, 2048, 512, () => {});
  check('STFT/ISTFT без изменений восстанавливает сигнал', snrDb(x, y) > 100, `SNR ${snrDb(x, y).toFixed(1)} дБ`);
});

// 8. Детектор среза: белый шум с «кирпичным» ФНЧ на 16 кГц (как MP3 128k)
t('cutoff', () => {
  const x = noise(0.2, 6); const N = 1 << 19; const re = new Float64Array(N); const im = new Float64Array(N);
  re.set(x.subarray(0, Math.min(N, x.length))); fft(re, im);
  const kc = Math.round(16000 / (SR / N));
  for (let k = kc; k <= N - kc; k += 1) { re[k] = 0; im[k] = 0; }
  fft(re, im, true); const y = Float32Array.from(re.subarray(0, x.length));
  const spec = averageSpectrum(y, 4096); const c = detectCutoff(spec, SR, 4096);
  check('Детектор находит срез MP3 ≈ 16 кГц', c.sharp && Math.abs(c.cutoffHz - 16000) < 300, `${c.cutoffHz} Гц`);
  const c2 = detectCutoff(averageSpectrum(x, 4096), SR, 4096);
  check('Полный спектр без ложного среза', !c2.sharp, `${c2.cutoffHz} Гц`);
});

// 9. Анализ целиком: гул 50 Гц, клиппинг, тип контента
t('analyze', () => {
  const sec = 12;
  // «речь»: шумовые всплески по ~200 мс со слоговым ритмом и паузами
  const sp = Float32Array.from({ length: sec * SR }, (_, i) => {
    const tt = i / SR; const syl = Math.max(0, Math.sin(2 * Math.PI * 4 * tt)); const phrase = (Math.floor(tt / 1.6) % 3) === 2 ? 0 : 1;
    return 0.25 * syl * phrase * (Math.sin(2 * Math.PI * 180 * tt) + 0.5 * gauss() * 0.3);
  });
  const hum = sp.map((v, i) => v + 0.01 * Math.sin(2 * Math.PI * 50 * i / SR) + 0.006 * Math.sin(2 * Math.PI * 100 * i / SR) + 0.004 * Math.sin(2 * Math.PI * 150 * i / SR) + 0.001 * gauss());
  const a = analyze([hum], SR);
  check('Анализ: гул 50 Гц', a.hum && a.hum.hz === 50, JSON.stringify(a.hum));
  check('Анализ: речь распознана как речь', a.content.kind === 'speech', `${a.content.kind} (${a.content.confidence.toFixed(2)}), паузы ${(a.pauseRatio * 100).toFixed(0)}%, мод ${a.modRatio.toFixed(2)}`);
  const L = noise(0.15, sec); const R = noise(0.15, sec);
  const mus = L.map((v, i) => v + 0.2 * Math.sin(2 * Math.PI * 110 * i / SR)); const mus2 = R.map((v, i) => v + 0.2 * Math.sin(2 * Math.PI * 110 * i / SR + 0.3));
  const am = analyze([mus, mus2], SR);
  check('Анализ: широкое стерео без пауз → музыка', am.content.kind === 'music', `${am.content.kind}, ширина ${am.stereo.width.toFixed(2)}`);
  const cl = sine(440, 0.9, 5).map((v) => Math.max(-0.6, Math.min(0.6, v)));
  const ac = analyze([cl], SR);
  check('Анализ: клиппинг найден', ac.clipping.ratio > 0.1, `${(ac.clipping.ratio * 100).toFixed(1)}%`);
});

// 10. Подавление позднего эха: сухой сигнал ⊛ экспоненциальный хвост (RT60 0.8 с)
t('dereverb', () => {
  const sec = 10;
  const dry = Float32Array.from({ length: sec * SR }, (_, i) => {
    const tt = i / SR; const on = (Math.floor(tt / 0.3) % 2) === 0 ? 1 : 0;
    return on * 0.3 * (Math.sin(2 * Math.PI * 300 * tt) + 0.6 * Math.sin(2 * Math.PI * 1200 * tt + 1) + 0.3 * gauss() * 0.2);
  });
  const rtLen = Math.round(0.8 * SR); const rir = new Float64Array(rtLen);
  rir[0] = 1;
  for (let i = Math.round(0.004 * SR); i < rtLen; i += 1) rir[i] = 0.25 * gauss() * Math.exp((-6.9 * i) / (0.8 * SR));
  const wet = fftConvolve(dry, rir, 0);
  const y = suppressLateReverb(wet, SR, 0.8, { strength: 1.2, lateMs: 40, maxCutDb: 24 });
  // энергия хвостов в паузах (где сухой сигнал = 0)
  let eW = 0; let eY = 0; let eD = 0;
  for (let i = SR; i < wet.length; i += 1) { const tt = i / SR; if ((Math.floor(tt / 0.3) % 2) === 1) { eW += wet[i] ** 2; eY += y[i] ** 2; } else eD += dry[i] ** 2; }
  const drop = 10 * Math.log10(eW / eY);
  check('Подавление эха убирает хвост в паузах ≥ 6 дБ', drop >= 6, `−${drop.toFixed(1)} дБ хвоста`);
});

// 11. SBR: шум со срезом 11 кГц → появляется верх, низ не трогаем
t('bwe', () => {
  const x = noise(0.2, 5); const N = 1 << 18; const re = new Float64Array(N); const im = new Float64Array(N);
  re.set(x.subarray(0, N)); fft(re, im);
  const kc = Math.round(11000 / (SR / N));
  for (let k = kc; k <= N - kc; k += 1) { re[k] = 0; im[k] = 0; }
  fft(re, im, true); const lp = Float32Array.from(re.subarray(0, N));
  const y = extendBandwidth(lp, SR, 11000, { amount: 0.7 });
  const hiB = bandEnergyDb(lp, 12000, 18000); const hiA = bandEnergyDb(y, 12000, 18000);
  const loB = bandEnergyDb(lp, 1000, 9000); const loA = bandEnergyDb(y, 1000, 9000);
  check('SBR восстанавливает верх выше среза (+20 дБ и больше)', hiA - hiB > 20, `12–18 кГц: ${hiB.toFixed(1)} → ${hiA.toFixed(1)} дБ`);
  check('SBR не меняет полосу ниже среза', Math.abs(loA - loB) < 0.3, `1–9 кГц: Δ ${(loA - loB).toFixed(2)} дБ`);
  check('SBR: верх тише полосы под срезом', hiA < bandEnergyDb(y, 5000, 11000), '');
});

// 12. Мэтчинг: «тёмный» трек к белому шуму-референсу
t('match', () => {
  const ref = noise(0.1, 8);
  const tgt = Float32Array.from(noise(0.1, 8));
  let z = 0; for (let i = 0; i < tgt.length; i += 1) { z = 0.85 * z + 0.15 * tgt[i]; tgt[i] = z * 3; } // ФНЧ 1-го порядка
  const before = bandEnergyDb(tgt, 6000, 12000) - bandEnergyDb(tgt, 300, 1000);
  const curve = correctionCurve(profileOf([tgt], SR), profileOf([ref], SR), { strength: 1, maxDb: 18 });
  const [y] = applyCurve([tgt], SR, curve);
  const after = bandEnergyDb(y, 6000, 12000) - bandEnergyDb(y, 300, 1000);
  const goal = bandEnergyDb(ref, 6000, 12000) - bandEnergyDb(ref, 300, 1000);
  check('Мэтчинг подтягивает баланс к референсу (ошибка < 2 дБ)', Math.abs(after - goal) < 2, `ВЧ/СЧ: ${before.toFixed(1)} → ${after.toFixed(1)} (цель ${goal.toFixed(1)}) дБ`);
  const d = new Float64Array(8192); d[4096] = 1; const id = fftConvolve(sine(500, 0.5, 1), d, 4096);
  check('Свёртка с дельтой — тождество', snrDb(sine(500, 0.5, 1), id) > 100, '');
});

// 13. Ресемплер 44.1 → 48 кГц
t('resample', () => {
  const x = sine(1000, 0.5, 2, 0, 44100); const y = resample(x, 44100, 48000);
  const ref = sine(1000, 0.5, 2, 0, 48000);
  check('Ресемплер 44.1→48 кГц точен (SNR > 70 дБ)', snrDb(ref, y, 2000, ref.length - 2000) > 70, `SNR ${snrDb(ref, y, 2000, ref.length - 2000).toFixed(1)} дБ`);
});

// 14. Динамический EQ: сибилянты-всплески прижимаются, голос — нет
t('dyneq', () => {
  const sec = 6; const v = sine(200, 0.3, sec);
  const s = Float32Array.from({ length: v.length }, (_, i) => (((i / SR) % 1) < 0.12 ? 0.25 * Math.sin(2 * Math.PI * 7000 * i / SR) : 0));
  const x = v.map((a, i) => a + s[i]);
  const y = Float32Array.from(x);
  const rep = dynamicEq([y], SR, [{ id: 'sibilance', f: 7000, q: 2, thresh: 3, maxCut: 8, ratio: 4, attack: 0.001, release: 0.05 }]);
  const cutDb = bandEnergyDb(x, 6500, 7500) - bandEnergyDb(y, 6500, 7500);
  let ev = 0; let ey = 0; for (let i = SR; i < x.length; i += 1) if (((i / SR) % 1) > 0.3) { ev += x[i] ** 2; ey += y[i] ** 2; }
  check('Динамический EQ прижимает сибилянты ≥ 3 дБ', cutDb >= 3, `−${cutDb.toFixed(1)} дБ, отчёт ${JSON.stringify(rep)}`);
  check('…и не трогает голос между ними', Math.abs(10 * Math.log10(ev / ey)) < 0.2, `Δ ${(10 * Math.log10(ev / ey)).toFixed(2)} дБ`);
});

// 15. Резонансы: шум + узкий «звон» 5.2 кГц
t('resonance', () => {
  const nz = noise(0.1, 5); const ring = sine(5200, 0.12, 5);
  const x = nz.map((v, i) => v + ring[i]);
  const [y] = suppressResonances([x], SR, { depth: 0.8 });
  const rB = bandEnergyDb(x, 5150, 5250); const rA = bandEnergyDb(y, 5150, 5250);
  const bB = bandEnergyDb(x, 2000, 4000); const bA = bandEnergyDb(y, 2000, 4000);
  check('Подавитель резонансов снимает «звон» ≥ 4 дБ', rB - rA >= 4, `5.2 кГц: −${(rB - rA).toFixed(1)} дБ`);
  check('…и почти не трогает шумовую подложку', Math.abs(bB - bA) < 0.8, `2–4 кГц: Δ ${(bB - bA).toFixed(2)} дБ`);
});

// 16. Полная цепочка (без нейросети): голос и музыка — потолок и громкость
for (const mode of ['voice', 'restore', 'music', 'ai']) {
  t(`pipeline ${mode}`, () => {});
  const sec = 15;
  const L = Float32Array.from({ length: sec * SR }, (_, i) => {
    const tt = i / SR; const syl = Math.max(0, Math.sin(2 * Math.PI * 4 * tt)); const phrase = (Math.floor(tt / 1.6) % 3) === 2 ? 0.02 : 1;
    return 0.3 * syl * phrase * (Math.sin(2 * Math.PI * 170 * tt) + 0.4 * Math.sin(2 * Math.PI * 2400 * tt)) + 0.01 * gauss();
  });
  const R = mode === 'voice' || mode === 'restore' ? L : L.map((v, i) => v * 0.8 + 0.02 * Math.sin(i / 7));
  const a = analyze([L, R], SR);
  const p = plan(a, mode, { targetLufs: -16, ceilingDb: -1, neural: 'spectral', intensity: 0.6 });
  p.steps.forEach((s) => { if (s.id === 'denoise') s.engine = 'none'; });
  const t0 = Date.now();
  const res = await run([L, R], SR, p);
  const l = integratedLufs(res.chans, SR); const tp = truePeakDb(res.chans);
  const nan = res.chans.some((c) => c.some((v) => !Number.isFinite(v)));
  check(`Цепочка «${mode}»: −16 LUFS ±0.25, ≤ −1 dBTP, без NaN`, Math.abs(l + 16) < 0.25 && tp <= -0.95 && !nan, `${l.toFixed(2)} LUFS, ${tp.toFixed(2)} dBTP, шаги: ${p.steps.map((s) => s.id).join('→')} (${Date.now() - t0} мс)`);
}

// 17. Громкий мастер −9 LUFS: лимитер работает всерьёз, цель и потолок держатся
{
  const sec = 20; const L = new Float32Array(sec * SR); const R = new Float32Array(sec * SR);
  for (let i = 0; i < L.length; i += 1) {
    const tt = i / SR; const kick = Math.exp(-((tt % 0.5) * 18)) * Math.sin(2 * Math.PI * 55 * tt);
    const v = 0.5 * kick + 0.15 * gauss() * Math.exp(-((tt % 0.25) * 30)) + 0.1 * Math.sin(2 * Math.PI * 440 * tt);
    L[i] = v; R[i] = v * 0.95 + 0.02 * gauss();
  }
  const a = analyze([L, R], SR);
  const p = plan(a, 'music', { targetLufs: -9, ceilingDb: -1, intensity: 0.6 });
  const res = await run([L, R], SR, p);
  const l = integratedLufs(res.chans, SR); const tp = truePeakDb(res.chans);
  check('Громкий мастер: −9 LUFS ±0.3 при ≤ −1 dBTP', Math.abs(l + 9) < 0.3 && tp <= -0.95, `${l.toFixed(2)} LUFS, ${tp.toFixed(2)} dBTP`);
}

// 18. Музыка со срезом MP3 → Apollo первым шагом; без модели — честный откат на SBR
{
  const sr = 44100; const n = sr * 12; const N = 1 << 19; const re = new Float64Array(N); const im = new Float64Array(N);
  for (let i = 0; i < n; i += 1) re[i] = 0.3 * gauss() * 0.5 + 0.3 * Math.sin(i / 30);
  fft(re, im); const kc = Math.round(16000 / (sr / N)); for (let k = kc; k <= N - kc; k += 1) { re[k] = 0; im[k] = 0; } fft(re, im, true);
  const L = Float32Array.from(re.subarray(0, n)); const R = L.map((v) => v * 0.9);
  const a = analyze([L, R], sr); const p = plan(a, 'ai', {});
  const res = await run([L, R], sr, p);
  const ap = res.log.find((l) => l.id === 'apollo');
  check('Срез MP3 → Apollo первым шагом после DC, без модели откат на SBR', p.steps[1]?.id === 'apollo' && ap?.engine === 'sbr', `срез ${a.cutoffHz} Гц, шаги: ${p.steps.map((x) => x.id).join('→')}`);
}

// 19. Ручной EQ: полоса поднимается ровно на заданное, фильтр режет низ 24 дБ/окт
{
  const x = noise(0.1, 6); const y = Float32Array.from(x);
  manualEq([y], SR, { bands: { presence: 6 } });
  const d = bandEnergyDb(y, 2700, 3300) - bandEnergyDb(x, 2700, 3300);
  check('Ручной EQ: присутствие +6 дБ на 3 кГц', Math.abs(d - 6) < 1, `+${d.toFixed(2)} дБ`);
  const keep = bandEnergyDb(y, 400, 800) - bandEnergyDb(x, 400, 800);
  check('…и не трогает далёкие полосы', Math.abs(keep) < 0.6, `Δ ${keep.toFixed(2)} дБ`);
  const hum = sine(50, 0.3, 4); const z = Float32Array.from(hum);
  manualEq([z], SR, { hp: 200 });
  const cut = bandEnergyDb(hum, 45, 55) - bandEnergyDb(z, 45, 55);
  check('Верхний фильтр 200 Гц гасит 50 Гц больше чем на 30 дБ', cut > 30, `−${cut.toFixed(1)} дБ`);
}

// 20. Ручной слой плана: группы подменяют блоки, остальное от пресета
{
  const a = analyze([sine(220, 0.3, 8), sine(220, 0.3, 8)], SR);
  const m = { eq: { on: true, hp: 90, lp: 14000, presence: 3 }, comp: { on: true, threshold: -30, ratio: 6, attackMs: 5, releaseMs: 120, kneeDb: 10 },
    gate: { on: true, threshold: -50 }, deess: { on: true, depthDb: 7 }, noise: { on: true, amount: 0.8 }, out: { on: true, gainDb: 2 } };
  const base = plan(a, 'voice', { targetLufs: -16 }); const man = plan(a, 'voice', { targetLufs: -16, manual: m });
  const ids = man.steps.map((x) => x.id);
  const comp = man.steps.find((x) => x.id === 'compressor'); const gate = man.steps.find((x) => x.id === 'expander');
  const dyn = man.steps.find((x) => x.id === 'dyneq'); const load = man.steps.find((x) => x.id === 'loudness');
  check('Ручной слой: EQ заменяет «тон», компрессор и гейт — ручные', ids.includes('meq') && !ids.includes('tone') && comp.manual?.ratio === 6 && gate.manual?.thresholdDb === -50 && ids.indexOf('expander') > ids.indexOf('compressor'), ids.join('→'));
  check('Де-эссер: 6.5 кГц, глубина 7 дБ; цель громкости +2 дБ', dyn.bands.find((b) => b.id === 'sibilance')?.f === 6500 && dyn.bands.find((b) => b.id === 'sibilance')?.maxCut === 7 && load.targetLufs === -14, `цель ${load.targetLufs}`);
  check('Без ручного слоя план прежний', !base.steps.some((x) => x.manual) && base.steps.some((x) => x.id === 'tone'), '');
  const p2 = plan(a, 'podcast', { targetLufs: -16 }); const tone = p2.steps.find((x) => x.id === 'tone');
  check('Подкаст: полоса 60 Гц – 16 кГц', tone.lowCutHz === 60 && tone.highCutHz === 16000, `${tone.lowCutHz}–${tone.highCutHz} Гц`);
  const bad = plan(a, 'voice', { manual: { comp: { on: true, threshold: 'абв', ratio: NaN }, out: { on: true, gainDb: 99 } } });
  const bc = bad.steps.find((x) => x.id === 'compressor').manual;
  check('Мусор в ручных настройках → безопасные значения', bc.thresholdDb === -24 && bc.ratio === 3 && bad.steps.find((x) => x.id === 'loudness').targetLufs === -4, JSON.stringify(bc));
  const res = await run([sine(220, 0.3, 8), sine(220, 0.3, 8)], SR, man);
  check('Ручная цепочка выполняется, цель −14 LUFS ±0.3', Math.abs(integratedLufs(res.chans, SR) + 14) < 0.3 && !res.chans.some((c) => c.some((v) => !Number.isFinite(v))), `${integratedLufs(res.chans, SR).toFixed(2)} LUFS`);
}

// 21. Предохранитель Apollo: мусор/NaN/медленно — отказ ДО попадания в результат
{
  const { apolloRestore, setApolloSessionForTest } = await import('../src/audio-engine/apollo.js');
  const mk = (transform, delayMs = 0) => ({
    ort: { Tensor: class { constructor(t, d, dims) { this.data = d; this.dims = dims; } } },
    sess: { run: async ({ audio }) => { if (delayMs) await new Promise((r) => setTimeout(r, delayMs)); return { restored: { data: transform(audio.data) } }; } },
  });
  const sr = 44100; const tone = Float32Array.from({ length: sr * 10 }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 440 * i / sr) + 0.05 * Math.sin(2 * Math.PI * 1500 * i / sr));
  setApolloSessionForTest(mk((d) => Float32Array.from(d, (v, i) => v + 0.01 * Math.sin(i * 1.7))));
  const good = await apolloRestore([tone, tone], sr, { cutoffHz: 8000 });
  check('Apollo-обёртка: нормальный выход проходит, длина и низ сохранены', good[0].length === tone.length && snrDb(tone, good[0], 4000, 40000) > 20, `SNR низа ${snrDb(tone, good[0], 4000, 40000).toFixed(1)} дБ`);
  const fails = async (transform, re, label, opt = {}, delay = 0) => {
    setApolloSessionForTest(mk(transform, delay));
    try { await apolloRestore([tone], sr, { cutoffHz: 8000, ...opt }); check(label, false, 'не отказал'); } catch (e) { check(label, re.test(e.message), e.message.slice(0, 60)); }
  };
  await fails((d) => Float32Array.from(d, () => 0.3 * gauss()), /bad-output/, 'Предохранитель: шум вместо музыки отклоняется с первого куска');
  await fails((d) => Float32Array.from(d, () => NaN), /bad-output/, 'Предохранитель: NaN на выходе отклоняется');
  await fails((d) => Float32Array.from(d, (v) => v * 0.001), /bad-output/, 'Предохранитель: «затухание» выхода отклоняется');
  await fails((d) => d, /too-slow/, 'Предохранитель: слишком долгий прогноз прерывает счёт', { limitSec: 0.05 }, 60);
  setApolloSessionForTest(null);
}

console.log(fails ? `\n❌ Провалено: ${fails}` : '\n✅ Все проверки пройдены');
process.exit(fails ? 1 : 0);
