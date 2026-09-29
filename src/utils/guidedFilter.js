// Guided filter (He et al., 2010): уточняет маску по краям оригинала — волосы,
// мех и контуры «прилипают» к реальным границам изображения. O(N) через
// интегральные изображения; guide — яркость (0..1), p — маска (0..1).

function boxMean(src, w, h, r, out) {
  const W1 = w + 1;
  const I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += src[y * w + x];
      I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row;
    }
  }
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r); const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r); const x1 = Math.min(w, x + r + 1);
      const s = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

export function guidedFilter(guide, p, w, h, r = 6, eps = 1e-3) {
  const n = w * h;
  const tmp = new Float32Array(n);
  const mI = boxMean(guide, w, h, r, new Float32Array(n));
  const mp = boxMean(p, w, h, r, new Float32Array(n));
  for (let i = 0; i < n; i += 1) tmp[i] = guide[i] * p[i];
  const mIp = boxMean(tmp, w, h, r, new Float32Array(n));
  for (let i = 0; i < n; i += 1) tmp[i] = guide[i] * guide[i];
  const mII = boxMean(tmp, w, h, r, new Float32Array(n));
  const a = new Float32Array(n); const b = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const varI = mII[i] - mI[i] * mI[i];
    a[i] = (mIp[i] - mI[i] * mp[i]) / (varI + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxMean(a, w, h, r, mI);
  const mb = boxMean(b, w, h, r, mp);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i += 1) q[i] = Math.max(0, Math.min(1, ma[i] * guide[i] + mb[i]));
  return q;
}
