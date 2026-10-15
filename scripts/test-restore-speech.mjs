// Сквозная проверка «Реставрации речи» на испорченной записи (эхо + шум + клиппинг).
// node scripts/test-restore-speech.mjs <speech.wav 48k mono>
import fs from 'node:fs';
import { analyze, plan, run } from '../src/audio-engine/pipeline.js';
import { loadDfn } from '../src/audio-engine/neural.js';
import { fftConvolve } from '../src/audio-engine/match.js';

const SR = 48000;
const wav = fs.readFileSync(process.argv[2]);
const clean = new Float32Array((wav.length - 44) / 2);
for (let i = 0; i < clean.length; i += 1) clean[i] = wav.readInt16LE(44 + i * 2) / 32768;
let seed = 3; const g = () => { let s = 0; for (let i = 0; i < 6; i += 1) { seed = (seed * 1664525 + 1013904223) >>> 0; s += seed / 4294967296; } return (s - 3) / Math.sqrt(0.5); };
const rt = 0.7; const rir = new Float64Array(Math.round(rt * SR)); rir[0] = 1;
for (let i = Math.round(0.003 * SR); i < rir.length; i += 1) rir[i] = 0.18 * g() * Math.exp((-6.9 * i) / (rt * SR));
const wet = fftConvolve(clean, rir, 0);
const pk = wet.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const bad = Float32Array.from(wet, (v) => { const x = (v / pk) * 1.6 + 0.01 * g(); return Math.max(-0.7, Math.min(0.7, x)); }); // клип на 0.7
fs.writeFileSync(process.argv[2].replace(/\.wav$/, '-bad.raw'), Buffer.from(bad.buffer));

await loadDfn('', { wasm: fs.readFileSync('public/models/dfn3/df_bg.wasm'), model: fs.readFileSync('public/models/dfn3/dfn3-model.tar.gz.bin') });
const a = analyze([bad], SR);
console.log(`Диагностика: ${a.content.kind} ${(a.content.confidence * 100).toFixed(0)}%, клиппинг ${(a.clipping.ratio * 100).toFixed(2)}%, RT60 ≈ ${a.rt60?.toFixed(2)} с, шум ${a.noiseFloorDb.toFixed(0)} dBFS`);
const p = plan(a, 'restore', { targetLufs: -16 });
console.log('Цепочка:', p.steps.map((s) => s.id).join(' → '));
const t0 = Date.now();
const { chans, log } = await run([bad], SR, p);
console.log(`Время: ${((Date.now() - t0) / 1000).toFixed(1)} с на ${(clean.length / SR).toFixed(1)} с аудио`);
for (const l of log) console.log(`  ${l.id.padEnd(12)} ${String(l.ms).padStart(6)} мс  ${JSON.stringify(Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'id' && k !== 'ms')))}`);

// Объективные метрики относительно чистого оригинала (с подбором масштаба и задержки):
// 1) «хвост»: энергия в паузах речи (там, где оригинал тихий) относительно речи
const env = (x, i) => { let s = 0; for (let j = i; j < i + 480; j += 1) s += x[j] * x[j]; return s; };
function tailRatio(x) {
  let sp = 0; let tail = 0;
  for (let i = 0; i + 480 < clean.length; i += 480) { const e = env(clean, i); if (e < 1e-6) tail += env(x, i); else if (e > 1e-2) sp += env(x, i); }
  return 10 * Math.log10(tail / sp);
}
console.log(`Энергия в паузах относительно речи: испорченная ${tailRatio(bad).toFixed(1)} дБ → после ${tailRatio(chans[0]).toFixed(1)} дБ (чистый оригинал ${tailRatio(clean).toFixed(1)} дБ)`);
fs.writeFileSync(process.argv[2].replace(/\.wav$/, '-restored.raw'), Buffer.from(chans[0].buffer));
