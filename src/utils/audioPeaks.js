// Пики аудио для отрисовки волн (как в wavesurfer/waveform-playlist): один раз
// считаем min/max/rms по блокам сэмплов (все каналы сведены), дальше любая
// ширина/зум рисуется из пиков за O(пикселей), а не O(сэмплов).

export const SPP = 128; // сэмплов на блок пиков
const cache = new WeakMap();

export function getPeaks(buffer) {
  let p = cache.get(buffer);
  if (p) return p;
  const n = Math.ceil(buffer.length / SPP);
  const min = new Float32Array(n); const max = new Float32Array(n); const rms = new Float32Array(n);
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) chans.push(buffer.getChannelData(c));
  for (let b = 0; b < n; b += 1) {
    let mn = 1; let mx = -1; let sq = 0; let cnt = 0;
    const s0 = b * SPP; const s1 = Math.min(buffer.length, s0 + SPP);
    for (const d of chans) {
      for (let i = s0; i < s1; i += 1) {
        const v = d[i];
        if (v < mn) mn = v; if (v > mx) mx = v; sq += v * v; cnt += 1;
      }
    }
    min[b] = mn; max[b] = mx; rms[b] = Math.sqrt(sq / (cnt || 1));
  }
  p = { min, max, rms, sampleRate: buffer.sampleRate };
  cache.set(buffer, p);
  return p;
}

// Рисует участок волны: секунды [t0, t0 + w/pxPerSec) буфера в canvas шириной w (css px).
export function drawWave(ctx, buffer, { t0, pxPerSec, w, h, color, rmsColor }) {
  const peaks = getPeaks(buffer);
  const sr = buffer.sampleRate;
  const mid = h / 2; const amp = mid - 2;
  const sppx = sr / pxPerSec; // сэмплов на пиксель
  const raw = sppx < SPP ? buffer.getChannelData(0) : null;
  for (let x = 0; x < w; x += 1) {
    const s0 = Math.floor((t0 + x / pxPerSec) * sr);
    const s1 = Math.max(s0 + 1, Math.floor((t0 + (x + 1) / pxPerSec) * sr));
    let mn = 1; let mx = -1; let r = 0;
    if (raw) {
      // Сильный зум: меньше блока на пиксель — читаем сэмплы напрямую.
      for (let i = s0; i < s1 && i < raw.length; i += 1) { const v = raw[i]; if (v < mn) mn = v; if (v > mx) mx = v; r = Math.max(r, Math.abs(v) * 0.7); }
    } else {
      const b0 = Math.floor(s0 / SPP); const b1 = Math.min(peaks.min.length, Math.max(b0 + 1, Math.ceil(s1 / SPP)));
      let rs = 0;
      for (let b = b0; b < b1; b += 1) { if (peaks.min[b] < mn) mn = peaks.min[b]; if (peaks.max[b] > mx) mx = peaks.max[b]; rs += peaks.rms[b]; }
      r = rs / Math.max(1, b1 - b0);
    }
    if (mx < mn) continue; // eslint-disable-line no-continue
    ctx.fillStyle = color;
    ctx.fillRect(x, mid - mx * amp, 1, Math.max(1, (mx - mn) * amp));
    if (rmsColor && r > 0) { ctx.fillStyle = rmsColor; ctx.fillRect(x, mid - r * amp, 1, Math.max(1, 2 * r * amp)); }
  }
}
