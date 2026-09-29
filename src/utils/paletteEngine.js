import { deltaOK, formatOklch, oklabToOklch, oklabToRgb, rgbToHex, rgbToOklab } from './oklab';

// Vetor Palette 2.0: image → OKLab → взвешенный k-means++ → слияние перцептивно
// близких кластеров → семантические роли (фон, доминанта, акцент, светлый, тёмный,
// телесный). Работает на гистограмме 5 бит/канал, поэтому даже большое фото
// кластеризуется за миллисекунды: k-means идёт по ~несколько тысяч бакетов.

const EDGE = 0.04; // доля кадра по краям, которая считается «фоном по периметру»

function buildBuckets(imageData) {
  const { data, width, height } = imageData;
  const ex = Math.max(1, Math.round(width * EDGE));
  const ey = Math.max(1, Math.round(height * EDGE));
  const hist = new Map();
  for (let y = 0; y < height; y += 1) {
    const edgeRow = y < ey || y >= height - ey;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 125) continue; // eslint-disable-line no-continue
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const edge = edgeRow || x < ex || x >= width - ex;
      const e = hist.get(key);
      if (e) { e.r += r; e.g += g; e.b += b; e.n += 1; if (edge) e.edge += 1; } else hist.set(key, { r, g, b, n: 1, edge: edge ? 1 : 0 });
    }
  }
  return [...hist.values()].map((e) => ({
    lab: rgbToOklab(e.r / e.n, e.g / e.n, e.b / e.n), n: e.n, edge: e.edge,
  }));
}

// Взвешенный k-means++ (детерминированный: псевдослучайность с фиксированным seed,
// чтобы одна и та же картинка всегда давала одну и ту же палитру).
function kmeans(points, k, iters = 16) {
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const centers = [];
  const heaviest = points.reduce((a, b) => (b.n > a.n ? b : a));
  centers.push([...heaviest.lab]);
  const d2 = new Float64Array(points.length).fill(Infinity);
  while (centers.length < Math.min(k, points.length)) {
    const c = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const d = deltaOK(points[i].lab, c) ** 2;
      if (d < d2[i]) d2[i] = d;
      sum += d2[i] * points[i].n;
    }
    if (sum <= 0) break;
    let target = rnd() * sum;
    let pick = points.length - 1;
    for (let i = 0; i < points.length; i += 1) { target -= d2[i] * points[i].n; if (target <= 0) { pick = i; break; } }
    centers.push([...points[pick].lab]);
  }
  const assign = new Int32Array(points.length);
  for (let it = 0; it < iters; it += 1) {
    const acc = centers.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    let moved = false;
    for (let i = 0; i < points.length; i += 1) {
      let best = 0; let bd = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const d = deltaOK(points[i].lab, centers[c]);
        if (d < bd) { bd = d; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; moved = true; }
      const p = points[i]; const s = acc[best];
      s.L += p.lab[0] * p.n; s.a += p.lab[1] * p.n; s.b += p.lab[2] * p.n; s.n += p.n;
    }
    acc.forEach((s, c) => { if (s.n) centers[c] = [s.L / s.n, s.a / s.n, s.b / s.n]; });
    if (!moved && it > 0) break;
  }
  const clusters = centers.map((lab) => ({ lab, n: 0, edge: 0 }));
  points.forEach((p, i) => { clusters[assign[i]].n += p.n; clusters[assign[i]].edge += p.edge; });
  return clusters.filter((c) => c.n > 0);
}

// Сливаем кластеры, которые глаз не различит (ΔOK < minDelta).
function mergeClose(clusters, minDelta) {
  const out = [];
  [...clusters].sort((a, b) => b.n - a.n).forEach((c) => {
    const near = out.find((o) => deltaOK(o.lab, c.lab) < minDelta);
    if (near) {
      const t = near.n + c.n;
      near.lab = near.lab.map((v, i) => (v * near.n + c.lab[i] * c.n) / t);
      near.n = t; near.edge += c.edge;
    } else out.push({ ...c, lab: [...c.lab] });
  });
  return out;
}

function toSwatch(c, total) {
  const [r, g, b] = oklabToRgb(...c.lab);
  const [L, C, h] = oklabToOklch(...c.lab);
  return {
    hex: rgbToHex(r, g, b), rgb: [r, g, b], lab: c.lab, L, C, h,
    oklch: formatOklch(L, C, h), pct: (c.n / total) * 100, n: c.n, edge: c.edge,
  };
}

export function extractPalette(imageData, count = 6) {
  const points = buildBuckets(imageData);
  if (!points.length) return { colors: [], roles: {} };
  const total = points.reduce((s, p) => s + p.n, 0);
  const edgeTotal = points.reduce((s, p) => s + p.edge, 0) || 1;

  // Кластеров берём с запасом: мелкие акценты не растворяются в крупных массах.
  const raw = kmeans(points, Math.max(count * 3, 18));
  const clusters = mergeClose(raw, 0.045).map((c) => toSwatch(c, total));

  // Итоговая палитра: по весу, но каждый новый цвет заметно отличается от выбранных.
  // Если различимых не хватает — постепенно ослабляем порог.
  const byWeight = [...clusters].sort((a, b) => b.n - a.n);
  let colors = [];
  for (const minD of [0.1, 0.075, 0.055, 0]) {
    colors = [];
    for (const c of byWeight) {
      if (colors.every((p) => deltaOK(p.lab, c.lab) >= minD)) colors.push(c);
      if (colors.length >= count) break;
    }
    if (colors.length >= Math.min(count, byWeight.length)) break;
  }

  // Доля цвета палитры = все пиксели, которые ближе к нему, чем к остальным цветам
  // палитры. Так проценты в сумме дают 100% и отражают реальный «вес» на макете.
  const share = new Map(colors.map((c) => [c, 0]));
  clusters.forEach((cl) => {
    let best = colors[0]; let bd = Infinity;
    colors.forEach((c) => { const d = deltaOK(c.lab, cl.lab); if (d < bd) { bd = d; best = c; } });
    share.set(best, share.get(best) + cl.n);
  });
  colors = colors.map((c) => ({ ...c, pct: (share.get(c) / total) * 100 })).sort((a, b) => b.pct - a.pct);

  // Роли. Ищем по всем кластерам, а не только по видимым в палитре.
  const visible = clusters.filter((c) => c.pct >= 0.4);
  const pool = visible.length ? visible : clusters;
  const maxBy = (arr, f) => arr.reduce((a, b) => (f(b) > f(a) ? b : a), arr[0]);
  const roles = {};
  roles.dominant = byWeight[0];
  const bg = maxBy(pool, (c) => c.edge);
  if (bg && bg.edge / edgeTotal > 0.35) roles.background = bg;
  const accentPool = pool.filter((c) => c.C > 0.06 && c !== roles.background && c.L > 0.25);
  if (accentPool.length) roles.accent = maxBy(accentPool, (c) => c.C * c.pct ** 0.25);
  const lightPool = pool.filter((c) => c.pct >= 1);
  roles.highlight = maxBy(lightPool.length ? lightPool : pool, (c) => c.L);
  roles.dark = maxBy(lightPool.length ? lightPool : pool, (c) => -c.L);
  const skin = pool.filter((c) => c.L > 0.5 && c.L < 0.9 && c.C > 0.03 && c.C < 0.16 && c.h > 25 && c.h < 80);
  if (skin.length) roles.skin = maxBy(skin, (c) => c.n);
  const mutedPool = pool.filter((c) => c.C > 0.015 && c.C < 0.07 && c.L > 0.3 && c.L < 0.85);
  if (mutedPool.length) roles.muted = maxBy(mutedPool, (c) => c.n);
  const vibrantPool = pool.filter((c) => c.C >= 0.1);
  if (vibrantPool.length) roles.vibrant = maxBy(vibrantPool, (c) => c.C);

  return { colors, roles, clusters: byWeight };
}

// ImageData с даунскейлом: 256 px по длинной стороне хватает для палитры.
export function imageToData(img, maxDim = 256) {
  const w0 = img.naturalWidth || img.width; const h0 = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
