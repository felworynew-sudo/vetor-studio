// OKLab / OKLCH (Björn Ottosson, 2020) — перцептивно равномерное пространство.
// Евклидово расстояние в OKLab ≈ видимая разница цветов, поэтому на нём строятся
// кластеризация палитр, перенос палитры и подбор контраста. Каналы sRGB 0..255.

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

// Таблица sRGB → linear на 256 значений: конвертация миллионов пикселей без pow.
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i += 1) LIN[i] = toLinear(i);

export function rgbToOklab(r, g, b) {
  const lr = LIN[r | 0]; const lg = LIN[g | 0]; const lb = LIN[b | 0];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

// Линейный RGB без клампа — нужен, чтобы проверять попадание в sRGB-гамут.
export function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToRgb(L, a, b) {
  const [r, g, bl] = oklabToLinear(L, a, b);
  return [fromLinear(r), fromLinear(g), fromLinear(bl)];
}

export function oklabToOklch(L, a, b) {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function oklchToOklab(L, C, h) {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

export function inGamut(L, a, b, eps = 0.0005) {
  return oklabToLinear(L, a, b).every((v) => v >= -eps && v <= 1 + eps);
}

// OKLCH → sRGB с сохранением L и h: при выходе за гамут уменьшаем хрому бинпоиском.
export function oklchToRgbClamped(L, C, h) {
  let [, a, b] = oklchToOklab(L, C, h);
  if (!inGamut(L, a, b)) {
    let lo = 0; let hi = C;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      [, a, b] = oklchToOklab(L, mid, h);
      if (inGamut(L, a, b)) lo = mid; else hi = mid;
    }
    [, a, b] = oklchToOklab(L, lo, h);
  }
  return oklabToRgb(L, a, b);
}

export function deltaOK(p, q) {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function formatOklch(L, C, h) {
  return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${C < 0.002 ? 0 : h.toFixed(1)})`;
}

// Относительная яркость WCAG 2.x и коэффициент контраста.
export function relLuminance(r, g, b) {
  return 0.2126 * LIN[r | 0] + 0.7152 * LIN[g | 0] + 0.0722 * LIN[b | 0];
}
export function contrastRatio(rgb1, rgb2) {
  const l1 = relLuminance(...rgb1); const l2 = relLuminance(...rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
