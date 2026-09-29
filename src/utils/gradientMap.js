import { hexToRgb, oklabToRgb, rgbToOklab } from './oklab';

// Gradient map: яркость пикселя → цвет градиента. Яркость — перцептивная (OKLab L
// из линейной светимости), цвета градиента интерполируются в OKLab — переходы
// ровные, без провалов в серость, как при смешивании в RGB.

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i += 1) { const v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }

// stops: [{ pos: 0..1, color: '#hex' }] → Uint8Array(256*3)
export function buildRamp(stops) {
  const s = [...stops].sort((a, b) => a.pos - b.pos).map((x) => ({ pos: x.pos, lab: rgbToOklab(...hexToRgb(x.color)) }));
  const ramp = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let k = 0;
    while (k < s.length - 1 && s[k + 1].pos < t) k += 1;
    let lab;
    if (t <= s[0].pos) lab = s[0].lab;
    else if (t >= s[s.length - 1].pos) lab = s[s.length - 1].lab;
    else {
      const a = s[k]; const b = s[k + 1];
      const f = (t - a.pos) / Math.max(1e-6, b.pos - a.pos);
      lab = [0, 1, 2].map((c) => a.lab[c] + (b.lab[c] - a.lab[c]) * f);
    }
    const rgb = oklabToRgb(...lab);
    ramp.set(rgb, i * 3);
  }
  return ramp;
}

// Перцептивная яркость 0..1 (L из OKLab для серого = кубический корень светимости).
export function perceptualLuma(r, g, b) {
  return Math.cbrt(0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b]);
}

export function applyRamp(imageData, ramp, { contrast = 0, invert = false, mix = 1 } = {}) {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data;
  const k = 1 + contrast / 100;
  const idxLut = new Uint8Array(4096); // яркость с шагом 1/4095 → индекс рампы
  for (let i = 0; i < 4096; i += 1) {
    let v = (i / 4095 - 0.5) * k + 0.5;
    v = Math.max(0, Math.min(1, v));
    if (invert) v = 1 - v;
    idxLut[i] = Math.round(v * 255);
  }
  for (let i = 0; i < d.length; i += 4) {
    const j = idxLut[Math.round(perceptualLuma(d[i], d[i + 1], d[i + 2]) * 4095)] * 3;
    d[i] += (ramp[j] - d[i]) * mix; d[i + 1] += (ramp[j + 1] - d[i + 1]) * mix; d[i + 2] += (ramp[j + 2] - d[i + 2]) * mix;
  }
  return out;
}

export const GRADIENT_PRESETS = [
  { id: 'sunset', ru: 'Закат', en: 'Sunset', stops: ['#1b0b3a', '#8c1b6b', '#ff5a3c', '#ffd38a'] },
  { id: 'cyber', ru: 'Кибер', en: 'Cyber', stops: ['#0b0724', '#3a1c8f', '#00d1ff', '#e6ff4a'] },
  { id: 'sepia', ru: 'Сепия', en: 'Sepia', stops: ['#1d1208', '#6b4a2b', '#c8a47a', '#f6ead4'] },
  { id: 'thermal', ru: 'Тепловизор', en: 'Thermal', stops: ['#000004', '#420a68', '#c73e4c', '#fca50a', '#fcffa4'] },
  { id: 'ocean', ru: 'Океан', en: 'Ocean', stops: ['#03122b', '#0b4f6c', '#20a4a0', '#e8f6e9'] },
  { id: 'spotify', ru: 'Постер', en: 'Poster', stops: ['#1e1bd6', '#ff4d8d'] },
  { id: 'forest', ru: 'Лес', en: 'Forest', stops: ['#0b1a0f', '#2d5a27', '#a3c26b', '#f2f0d0'] },
  { id: 'noir', ru: 'Нуар', en: 'Noir', stops: ['#050505', '#3b3b3b', '#b0b0b0', '#fafafa'] },
];

export const stopsFromList = (list) => list.map((color, i) => ({ pos: list.length === 1 ? 0 : i / (list.length - 1), color }));

export function rampToCss(stops, angle = 90) {
  return `linear-gradient(${angle}deg, ${[...stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${Math.round(s.pos * 100)}%`).join(', ')})`;
}
