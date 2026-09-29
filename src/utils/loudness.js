// Громкость по ITU-R BS.1770-4 / EBU R128: K-взвешивание, блоки 400 мс с
// перекрытием 75%, абсолютный гейт −70 LUFS и относительный −10 LU. Коэффициенты
// фильтров для произвольной частоты дискретизации — как в libebur128.

function kWeightCoeffs(fs) {
  let f0 = 1681.974450955533; const G = 3.999843853973347; let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20); const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp = { b: [1, -2, 1], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  return [shelf, hp];
}

function biquad(x, { b, a }) {
  const y = new Float32Array(x.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export function integratedLufs(buffer) {
  const fs = buffer.sampleRate;
  const [shelf, hp] = kWeightCoeffs(fs);
  const chans = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c += 1) chans.push(biquad(biquad(buffer.getChannelData(c), shelf), hp));
  const block = Math.round(fs * 0.4); const hop = Math.round(fs * 0.1);
  const powers = [];
  for (let s = 0; s + block <= buffer.length; s += hop) {
    let p = 0;
    for (const ch of chans) { let sum = 0; for (let i = s; i < s + block; i += 1) sum += ch[i] * ch[i]; p += sum / block; }
    powers.push(p);
  }
  if (!powers.length) return -Infinity;
  const toL = (p) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => toL(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = toL(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((p) => toL(p) > rel);
  return toL(gated.reduce((a, b) => a + b, 0) / (gated.length || 1));
}

export function samplePeakDb(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i += 1) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
