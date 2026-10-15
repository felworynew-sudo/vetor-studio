// Проверка DeepFilterNet3 WASM в Node: задержка и выигрыш по шуму на реальной речи.
// node scripts/test-dfn3.mjs <speech.wav (48k mono 16-bit)>
import fs from 'node:fs';
import { loadDfn, dfnDenoise, DFN_DELAY } from '../src/audio-engine/neural.js';

const file = process.argv[2];
const buf = fs.readFileSync(file);
let off = 12; let data = null; let sr = 48000;
while (off < buf.length) {
  const id = buf.toString('ascii', off, off + 4); const len = buf.readUInt32LE(off + 4);
  if (id === 'fmt ') sr = buf.readUInt32LE(off + 12);
  if (id === 'data') { data = buf.subarray(off + 8, off + 8 + len); break; }
  off += 8 + len;
}
const clean = new Float32Array(data.length / 2);
for (let i = 0; i < clean.length; i += 1) clean[i] = data.readInt16LE(i * 2) / 32768;
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const noise = Float32Array.from(clean, (_, i) => rnd() * 2 + 0.6 * Math.sin(2 * Math.PI * 120 * i / sr) * (1 + 0.3 * Math.sin(i / 9000)));
const target = rms(clean) / 10 ** (5 / 20); // SNR 5 дБ
const k = target / rms(noise);
const noisy = Float32Array.from(clean, (v, i) => v + noise[i] * k);
const snr = (ref, x) => { let s = 0; let e = 0; for (let i = 0; i < ref.length; i += 1) { s += ref[i] * ref[i]; e += (x[i] - ref[i]) ** 2; } return 10 * Math.log10(s / e); };

await loadDfn('', { wasm: fs.readFileSync('public/models/dfn3/df_bg.wasm'), model: fs.readFileSync('public/models/dfn3/dfn3-model.tar.gz.bin') });
const t0 = Date.now();
const out = await dfnDenoise(noisy, sr, { attenLimDb: 100 });
const ms = Date.now() - t0;
// остаточная задержка после компенсации DFN_DELAY (должна быть 0)
let best = 0; let bestLag = 0;
for (let lag = -1200; lag <= 1200; lag += 1) {
  let c = 0; for (let i = 20000; i < 20000 + 96000; i += 1) c += clean[i] * (out[i + lag] || 0);
  if (c > best) { best = c; bestLag = lag; }
}
console.log(`DFN_DELAY=${DFN_DELAY}, остаточный сдвиг: ${bestLag} сэмплов`);
console.log(`SNR: вход ${snr(clean, noisy).toFixed(1)} дБ → выход ${snr(clean, out).toFixed(1)} дБ; ${(clean.length / sr).toFixed(1)} с аудио за ${ms} мс (×${((clean.length / sr) * 1000 / ms).toFixed(1)} реального времени)`);
fs.writeFileSync(file.replace(/\.wav$/, '-noisy.raw'), Buffer.from(noisy.buffer));
fs.writeFileSync(file.replace(/\.wav$/, '-dfn.raw'), Buffer.from(out.buffer));
globalThis.WorkerGlobalScope = globalThis.WorkerGlobalScope || function WorkerGlobalScope() {};
const { rnnoiseDenoise } = await import('../src/audio-engine/neural.js');
const t1 = Date.now();
const rn = await rnnoiseDenoise(noisy, sr, { mix: 1 });
console.log(`RNNoise для сравнения: SNR ${snr(clean, rn).toFixed(1)} дБ за ${Date.now() - t1} мс`);
// подавление шума в паузах (где речи нет)
const pauseGain = (y) => { let a = 0; let b = 0; for (let i = 0; i < clean.length; i += 1) if (Math.abs(clean[i]) < 1e-4) { a += noisy[i] ** 2; b += y[i] ** 2; } return 10 * Math.log10(a / b); };
console.log(`Шум в паузах: DFN3 −${pauseGain(out).toFixed(1)} дБ, RNNoise −${pauseGain(rn).toFixed(1)} дБ`);
