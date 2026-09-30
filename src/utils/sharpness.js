// Метрики резкости фото (для отбраковки смазанных кадров).
// Считаются на сером изображении, приведённом к длинной стороне ANALYZE_SIZE,
// чтобы числа были сопоставимы между камерами/разрешениями.
//  • laplacian — дисперсия Лапласиана (классика, чувствительна к шуму);
//  • tenengrad — средний квадрат градиента Собеля;
//  • hf — доля энергии спектра (2D FFT) на высоких частотах, %;
//  • map — дисперсия Лапласиана по зонам сетки; peak (среднее 3% самых резких зон)
//    устойчив к боке: резкий объект на размытом фоне не считается браком.

export const ANALYZE_SIZE = 1000;

export function toGray(img, maxDim = ANALYZE_SIZE) {
  const k = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(8, Math.round((img.naturalWidth || img.width) * k));
  const h = Math.max(8, Math.round((img.naturalHeight || img.height) * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data; const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { g, w, h };
}

function laplacianField(g, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) { const i = y * w + x; out[i] = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i]; }
  return out;
}

function variance(a, w, x0, y0, x1, y1) {
  let s = 0; let s2 = 0; let n = 0;
  for (let y = Math.max(1, y0); y < Math.min(y1, (a.length / w) - 1); y += 1) for (let x = Math.max(1, x0); x < Math.min(x1, w - 1); x += 1) { const v = a[y * w + x]; s += v; s2 += v * v; n += 1; }
  if (!n) return 0; const m = s / n; return s2 / n - m * m;
}

function tenengrad(g, w, h) {
  let s = 0; let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
      const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      s += gx * gx + gy * gy; n += 1;
    }
  }
  return s / n;
}

// Итеративный radix-2 FFT на месте.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len; const wr = Math.cos(a); const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1; let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const p = i + k; const q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci; const ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// Доля энергии на частотах выше 1/4 Найквиста в центральном окне 256×256 (с окном Ханна).
function highFreqRatio(g, w, h) {
  const N = 256; const sx = Math.max(0, Math.floor((w - N) / 2)); const sy = Math.max(0, Math.floor((h - N) / 2));
  const re = new Float64Array(N * N); const im = new Float64Array(N * N);
  let mean = 0; let cnt = 0;
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) { const yy = Math.min(h - 1, sy + y); const xx = Math.min(w - 1, sx + x); mean += g[yy * w + xx]; cnt += 1; }
  mean /= cnt;
  for (let y = 0; y < N; y += 1) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (N - 1));
    for (let x = 0; x < N; x += 1) { const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (N - 1)); re[y * N + x] = (g[Math.min(h - 1, sy + y) * w + Math.min(w - 1, sx + x)] - mean) * wx * wy; }
  }
  const rr = new Float64Array(N); const ri = new Float64Array(N);
  for (let y = 0; y < N; y += 1) { for (let x = 0; x < N; x += 1) { rr[x] = re[y * N + x]; ri[x] = im[y * N + x]; } fft(rr, ri); for (let x = 0; x < N; x += 1) { re[y * N + x] = rr[x]; im[y * N + x] = ri[x]; } }
  for (let x = 0; x < N; x += 1) { for (let y = 0; y < N; y += 1) { rr[y] = re[y * N + x]; ri[y] = im[y * N + x]; } fft(rr, ri); for (let y = 0; y < N; y += 1) { re[y * N + x] = rr[y]; im[y * N + x] = ri[y]; } }
  let total = 0; let high = 0;
  for (let y = 0; y < N; y += 1) {
    const fy = (y <= N / 2 ? y : y - N) / (N / 2);
    for (let x = 0; x < N; x += 1) {
      const fx = (x <= N / 2 ? x : x - N) / (N / 2); const r = Math.hypot(fx, fy); if (r === 0) continue;
      const e = re[y * N + x] ** 2 + im[y * N + x] ** 2; total += e; if (r > 0.25) high += e;
    }
  }
  return total ? (high / total) * 100 : 0;
}

export function analyzeSharpness(img, { cols = 16 } = {}) {
  const { g, w, h } = toGray(img);
  const lap = laplacianField(g, w, h);
  const laplacian = variance(lap, w, 0, 0, w, h);
  const tile = Math.ceil(w / cols); const rows = Math.max(1, Math.round(h / tile));
  const th = Math.ceil(h / rows);
  const map = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) map.push(variance(lap, w, c * tile, r * th, (c + 1) * tile, (r + 1) * th));
  // зона фокуса: среднее по 3% самых резких зон (минимум 3) — объект может быть небольшим
  const sorted = [...map].sort((a, b) => b - a); const top = Math.max(3, Math.round(sorted.length * 0.03));
  const peak = sorted.slice(0, top).reduce((s, v) => s + v, 0) / top;
  return { laplacian, tenengrad: tenengrad(g, w, h), hf: highFreqRatio(g, w, h), map, cols, rows, peak, w, h };
}

// Цвет зоны карты: лог-шкала, синий (размыто) → зелёный → жёлтый → красный (резко).
export function heatColor(v) {
  const t = Math.min(1, Math.max(0, Math.log10(1 + v) / Math.log10(3000)));
  const stops = [[40, 60, 200], [30, 190, 120], [240, 220, 40], [235, 60, 40]];
  const p = t * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(p)); const f = p - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
