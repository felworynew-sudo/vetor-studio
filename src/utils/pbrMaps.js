// Карты для PBR-материалов из одной фотографии поверхности: высота (displacement),
// нормали (Sobel по высоте, OpenGL/DirectX), ambient occlusion (кавити-оценка по
// разнице с размытой высотой) и шероховатость. Все размытия — с заворотом краёв,
// чтобы бесшовная текстура оставалась бесшовной.

function blur(src, w, h, r) {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h); const out = new Float32Array(w * h); const n = 2 * r + 1;
  for (let y = 0; y < h; y += 1) {
    let s = 0; for (let k = -r; k <= r; k += 1) s += src[y * w + ((k % w) + w) % w];
    for (let x = 0; x < w; x += 1) { tmp[y * w + x] = s / n; s += src[y * w + ((x + r + 1) % w)] - src[y * w + (((x - r) % w) + w) % w]; }
  }
  for (let x = 0; x < w; x += 1) {
    let s = 0; for (let k = -r; k <= r; k += 1) s += tmp[(((k % h) + h) % h) * w + x];
    for (let y = 0; y < h; y += 1) { out[y * w + x] = s / n; s += tmp[((y + r + 1) % h) * w + x] - tmp[((((y - r) % h) + h) % h) * w + x]; }
  }
  return out;
}

export function computeMaps(imageData, o) {
  const { width: w, height: h, data } = imageData;
  const N = w * h;
  // 1. Высота: яркость → опционально инверсия → подавление крупных перепадов → сглаживание → уровни.
  let H = new Float32Array(N);
  for (let i = 0; i < N; i += 1) H[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  if (o.invert) for (let i = 0; i < N; i += 1) H[i] = 1 - H[i];
  if (o.largeScale < 1) {
    const big = blur(blur(H, w, h, Math.max(2, Math.round(Math.min(w, h) / 12))), w, h, Math.max(2, Math.round(Math.min(w, h) / 12)));
    for (let i = 0; i < N; i += 1) H[i] = H[i] - big[i] * (1 - o.largeScale) + 0.5 * (1 - o.largeScale);
  }
  if (o.smooth > 0) H = blur(H, w, h, o.smooth);
  let mn = Infinity; let mx = -Infinity;
  for (let i = 0; i < N; i += 1) { if (H[i] < mn) mn = H[i]; if (H[i] > mx) mx = H[i]; }
  const span = mx - mn || 1;
  for (let i = 0; i < N; i += 1) { const v = (H[i] - mn) / span; H[i] = Math.max(0, Math.min(1, (v - 0.5) * o.contrast + 0.5)); }

  const out = (fn) => { const img = new ImageData(w, h); for (let i = 0; i < N; i += 1) { const [r, g, b] = fn(i); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; } return img; };
  const height = out((i) => { const v = H[i] * 255; return [v, v, v]; });

  // 2. Нормали: Sobel с заворотом краёв.
  const at = (x, y) => H[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  const ySign = o.directx ? -1 : 1;
  const normal = out((i) => {
    const x = i % w; const y = (i / w) | 0;
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * o.strength; let ny = dy * o.strength * ySign; let nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  });

  // 3. AO: насколько точка ниже своего окружения.
  const r1 = Math.max(1, Math.round(Math.min(w, h) * o.aoRadius));
  const avg = blur(blur(H, w, h, r1), w, h, r1);
  const ao = out((i) => { const v = Math.max(0, Math.min(1, 1 - Math.max(0, avg[i] - H[i]) * o.aoStrength * 4)) * 255; return [v, v, v]; });

  // 4. Шероховатость: база + вариация по (инвертированной) яркости исходника.
  const rough = out((i) => {
    let l = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    if (!o.roughInvert) l = 1 - l;
    const v = Math.max(0, Math.min(1, o.roughBase + (l - 0.5) * o.roughVar)) * 255; return [v, v, v];
  });

  return { height, normal, ao, rough };
}
