// 2D simplex noise (алгоритм Кена Перлина в реализации Стефана Густавсона, public
// domain) с сидом + fBm/ridged. Для процедурных генераторов (рельеф, текстуры).

export function makeSimplex(seed = 1) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  let s = seed >>> 0 || 1;
  for (let i = 255; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i += 1) perm[i] = p[i & 255];
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1); const G2 = (3 - Math.sqrt(3)) / 6;
  return function noise(xin, yin) {
    const s2 = (xin + yin) * F2;
    const i = Math.floor(xin + s2); const j = Math.floor(yin + s2);
    const t = (i + j) * G2;
    const x0 = xin - (i - t); const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0; const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2; const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2; const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255; const jj = j & 255;
    let n = 0;
    const c = (tt, g, x, y) => { if (tt < 0) return 0; const tt2 = tt * tt; return tt2 * tt2 * (g[0] * x + g[1] * y); };
    n += c(0.5 - x0 * x0 - y0 * y0, grad[perm[ii + perm[jj]] & 7], x0, y0);
    n += c(0.5 - x1 * x1 - y1 * y1, grad[perm[ii + i1 + perm[jj + j1]] & 7], x1, y1);
    n += c(0.5 - x2 * x2 - y2 * y2, grad[perm[ii + 1 + perm[jj + 1]] & 7], x2, y2);
    return 70 * n; // ≈ −1..1
  };
}

export function fbm(noise, x, y, { octaves = 6, lacunarity = 2, gain = 0.5, ridged = false } = {}) {
  let amp = 1; let freq = 1; let sum = 0; let norm = 0; let prev = 1;
  for (let o = 0; o < octaves; o += 1) {
    let v = noise(x * freq, y * freq);
    if (ridged) { v = 1 - Math.abs(v); v *= v; v *= prev; prev = v; } else v = v * 0.5 + 0.5;
    sum += v * amp; norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}
