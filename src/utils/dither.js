import { rgbToOklab } from './oklab';

// Движок квантизации и дизеринга. Палитра строится image-q (MIT: Wu / NeuQuant /
// RGBQuant) или берётся готовая ретро-палитра; ближайший цвет ищется в OKLab.
// Дизеринг: диффузия ошибки (Floyd–Steinberg, Atkinson, JJN, Stucki, Burkes,
// Sierra…), упорядоченный Bayer 2/4/8, blue-noise (void-and-cluster) и белый шум.

export const METHODS = [
  { id: 'none', ru: 'Без дизеринга', en: 'None' },
  { id: 'floyd', ru: 'Floyd–Steinberg', en: 'Floyd–Steinberg' },
  { id: 'atkinson', ru: 'Atkinson (Mac)', en: 'Atkinson (Mac)' },
  { id: 'jjn', ru: 'Jarvis–Judice–Ninke', en: 'Jarvis–Judice–Ninke' },
  { id: 'stucki', ru: 'Stucki', en: 'Stucki' },
  { id: 'burkes', ru: 'Burkes', en: 'Burkes' },
  { id: 'sierra', ru: 'Sierra', en: 'Sierra' },
  { id: 'sierraLite', ru: 'Sierra Lite', en: 'Sierra Lite' },
  { id: 'bayer2', ru: 'Bayer 2×2', en: 'Bayer 2×2' },
  { id: 'bayer4', ru: 'Bayer 4×4', en: 'Bayer 4×4' },
  { id: 'bayer8', ru: 'Bayer 8×8', en: 'Bayer 8×8' },
  { id: 'blue', ru: 'Blue noise', en: 'Blue noise' },
  { id: 'white', ru: 'Белый шум', en: 'White noise' },
];

// [dx, dy, вес]; делитель — сумма весов (у Atkinson намеренно 8 из 6/8 — «теряет» ошибку).
const KERNELS = {
  floyd: { d: 16, k: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  atkinson: { d: 8, k: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  jjn: { d: 48, k: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
  stucki: { d: 42, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  burkes: { d: 32, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  sierra: { d: 32, k: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] },
  sierraLite: { d: 4, k: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
};

export const PALETTES = {
  bw: { ru: '1-бит Ч/Б', en: '1-bit B/W', c: ['#000000', '#ffffff'] },
  gray4: { ru: '4 оттенка серого', en: '4 grays', c: ['#000000', '#555555', '#aaaaaa', '#ffffff'] },
  gameboy: { ru: 'Game Boy', en: 'Game Boy', c: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  cga: { ru: 'CGA', en: 'CGA', c: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
  mac: { ru: 'Macintosh 16', en: 'Macintosh 16', c: ['#ffffff', '#fcf305', '#ff6402', '#dd0806', '#f20884', '#4600a5', '#0000d4', '#02abea', '#1fb714', '#006411', '#562c05', '#90713a', '#c0c0c0', '#808080', '#404040', '#000000'] },
  pico8: { ru: 'PICO-8', en: 'PICO-8', c: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'] },
  c64: { ru: 'Commodore 64', en: 'Commodore 64', c: ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'] },
  ega: { ru: 'EGA 16', en: 'EGA 16', c: ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'] },
  eink: { ru: 'E-ink 16 серых', en: 'E-ink 16 grays', c: Array.from({ length: 16 }, (_, i) => { const v = Math.round((i / 15) * 255).toString(16).padStart(2, '0'); return `#${v}${v}${v}`; }) },
  eink7: { ru: 'Цветной e-ink (7 цв.)', en: 'Color e-ink (7 col.)', c: ['#000000', '#ffffff', '#00ff00', '#0000ff', '#ff0000', '#ffff00', '#ff8000'] },
};

const hexToArr = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const paletteFromHex = (list) => list.map(hexToArr);

export async function buildPalette(imageData, colors, algo = 'wuquant') {
  const iq = await import('image-q');
  // Для палитры полное разрешение не нужно: равномерная выборка ~65 тыс. пикселей
  // ускоряет Wu/NeuQuant в десятки раз без видимой разницы.
  const total = imageData.width * imageData.height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 65536)));
  let src = imageData.data; let sw = imageData.width; let sh = imageData.height;
  if (step > 1) {
    sw = Math.ceil(imageData.width / step); sh = Math.ceil(imageData.height / step);
    src = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const s = ((y * step) * imageData.width + x * step) * 4; const d = (y * sw + x) * 4;
        src[d] = imageData.data[s]; src[d + 1] = imageData.data[s + 1]; src[d + 2] = imageData.data[s + 2]; src[d + 3] = imageData.data[s + 3];
      }
    }
  }
  const pc = iq.utils.PointContainer.fromUint8Array(src, sw, sh);
  let pal;
  if (algo === 'wuquant') {
    // Wu считает 4D-моменты (RGBA): при 5 битах на канал это 33⁴ ячеек и ~2 с;
    // 4 бита (17⁴) дают ту же палитру на глаз в разы быстрее.
    const q = new iq.palette.WuQuant(new iq.distance.EuclideanBT709(), colors, 4);
    q.sample(pc);
    pal = q.quantizeSync();
  } else {
    pal = iq.buildPaletteSync([pc], { colors, paletteQuantization: algo, colorDistanceFormula: 'euclidean-bt709' });
  }
  return pal.getPointContainer().getPointArray().map((p) => [p.r, p.g, p.b]);
}

function bayer(n) {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length; const out = Array.from({ length: s * 2 }, () => new Array(s * 2));
    for (let y = 0; y < s; y += 1) {
      for (let x = 0; x < s; x += 1) {
        const v = m[y][x] * 4;
        out[y][x] = v; out[y][x + s] = v + 2; out[y + s][x] = v + 3; out[y + s][x + s] = v + 1;
      }
    }
    m = out;
  }
  const n2 = n * n;
  return Float32Array.from(m.flat().map((v) => (v + 0.5) / n2));
}

// Blue noise 64×64: жадный void-and-cluster — каждый следующий ранг ставится в
// «самую пустую» точку по гауссовой энергии на торе. ~33 млн операций, один раз.
let blueCache = null;
function blueNoise() {
  if (blueCache) return blueCache;
  const N = 64; const S = N * N; const sigma2 = 2 * 1.9 * 1.9;
  const energy = new Float64Array(S); const rank = new Float32Array(S); const used = new Uint8Array(S);
  const R = 7; const lut = [];
  for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) lut.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / sigma2)]);
  let seed = 7;
  let idx = Math.floor(((seed * 9301 + 49297) % 233280) / 233280 * S);
  for (let r = 0; r < S; r += 1) {
    used[idx] = 1; rank[idx] = (r + 0.5) / S;
    const x0 = idx % N; const y0 = (idx / N) | 0;
    for (const [dx, dy, w] of lut) energy[((y0 + dy + N) % N) * N + ((x0 + dx + N) % N)] += w;
    let best = -1; let be = Infinity;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const off = seed % S;
    for (let k = 0; k < S; k += 1) { const i = (k + off) % S; if (!used[i] && energy[i] < be) { be = energy[i]; best = i; } }
    if (best < 0) break;
    idx = best;
  }
  blueCache = rank;
  return rank;
}

// Ближайший цвет палитры в OKLab, с кешем по 15-битному ключу цвета.
function nearestFinder(palette) {
  const labs = palette.map((c) => rgbToOklab(c[0], c[1], c[2]));
  const cache = new Map();
  return (r, g, b) => {
    const R = r < 0 ? 0 : r > 255 ? 255 : r | 0; const G = g < 0 ? 0 : g > 255 ? 255 : g | 0; const B = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    const key = ((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3);
    let hit = cache.get(key);
    if (hit !== undefined) return hit;
    const [L, A, Bb] = rgbToOklab(R, G, B);
    let bi = 0; let bd = Infinity;
    for (let i = 0; i < labs.length; i += 1) {
      const d = (labs[i][0] - L) ** 2 + (labs[i][1] - A) ** 2 + (labs[i][2] - Bb) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    hit = bi; cache.set(key, hit);
    return hit;
  };
}

// Типичный шаг между соседними цветами палитры — масштаб порога упорядоченного дизеринга.
function paletteSpread(palette) {
  if (palette.length < 2) return 128;
  let sum = 0;
  palette.forEach((a, i) => {
    let md = Infinity;
    palette.forEach((b, j) => { if (i !== j) md = Math.min(md, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); });
    sum += md;
  });
  return (sum / palette.length) / Math.sqrt(3);
}

export function ditherImage(imageData, palette, { method = 'floyd', strength = 1, serpentine = true } = {}) {
  const { width: w, height: h, data } = imageData;
  const out = new ImageData(w, h);
  const od = out.data;
  const nearest = nearestFinder(palette);
  const kernel = KERNELS[method];

  if (kernel) {
    const buf = new Float32Array(w * h * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { buf[j] = data[i]; buf[j + 1] = data[i + 1]; buf[j + 2] = data[i + 2]; }
    for (let y = 0; y < h; y += 1) {
      const rev = serpentine && (y & 1);
      for (let xi = 0; xi < w; xi += 1) {
        const x = rev ? w - 1 - xi : xi;
        const p = (y * w + x) * 3;
        const idx = nearest(buf[p], buf[p + 1], buf[p + 2]);
        const c = palette[idx];
        const o = (y * w + x) * 4;
        od[o] = c[0]; od[o + 1] = c[1]; od[o + 2] = c[2]; od[o + 3] = data[o + 3];
        const er = (buf[p] - c[0]) * strength; const eg = (buf[p + 1] - c[1]) * strength; const eb = (buf[p + 2] - c[2]) * strength;
        for (const [dx0, dy, wt] of kernel.k) {
          const dx = rev ? -dx0 : dx0;
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) continue; // eslint-disable-line no-continue
          const q = (ny * w + nx) * 3; const f = wt / kernel.d;
          buf[q] += er * f; buf[q + 1] += eg * f; buf[q + 2] += eb * f;
        }
      }
    }
    return out;
  }

  let thr = null; let tn = 0;
  if (method.startsWith('bayer')) { tn = Number(method.slice(5)); thr = bayer(tn); }
  if (method === 'blue') { tn = 64; thr = blueNoise(); }
  const spread = paletteSpread(palette) * 1.6 * strength;
  let seed = 12345;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      let t = 0;
      if (thr) t = thr[(y % tn) * tn + (x % tn)] - 0.5;
      else if (method === 'white') { seed = (seed * 1103515245 + 12345) & 0x7fffffff; t = seed / 0x7fffffff - 0.5; }
      const add = t * spread;
      const idx = nearest(data[o] + add, data[o + 1] + add, data[o + 2] + add);
      const c = palette[idx];
      od[o] = c[0]; od[o + 1] = c[1]; od[o + 2] = c[2]; od[o + 3] = data[o + 3];
    }
  }
  return out;
}

// Предобработка: яркость/контраст/гамма — сильно влияют на результат дизеринга.
export function adjustImage(imageData, { brightness = 0, contrast = 0, gamma = 1 } = {}) {
  if (!brightness && !contrast && gamma === 1) return imageData;
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const c = (contrast / 100) + 1; const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) {
    let v = ((i / 255) ** (1 / gamma)) * 255;
    v = (v - 128) * c + 128 + brightness * 2.55;
    lut[i] = v;
  }
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  return out;
}
