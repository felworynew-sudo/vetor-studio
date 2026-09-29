import { oklabToLinear } from './oklab';

// Цветовая математика цветокоррекции — ОДНА модель в двух реализациях:
// GLSL (превью и экспорт на GPU) и JS (запекание в LUT .cube). Держим их зеркальными.
// Порядок: sRGB → линейный свет → экспозиция и баланс белого (в линейном свете,
// физически корректно) → OKLab → тени/света, контраст, fade (по перцептивной L) →
// насыщенность и вибранс (хрома) → обратно в sRGB.

export const GRADE_DEFAULTS = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temperature: 0, tint: 0, vibrance: 0, saturation: 0, fade: 0,
  clarity: 0, sharpen: 0, denoise: 0, vignette: 0, grain: 0,
};

// Параметры для шейдера/JS из значений ползунков (-100..100 / 0..100).
export function gradeUniforms(p) {
  const t = p.temperature / 100; const u = p.tint / 100;
  const g = [1 + 0.22 * t, 1 - 0.16 * u, 1 - 0.22 * t];
  const y = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
  return {
    exposure: 2 ** ((p.exposure / 100) * 2),
    wb: g.map((v) => v / y),
    contrast: 1 + p.contrast / 100 * 0.8,
    highlights: p.highlights / 100, shadows: p.shadows / 100,
    whites: p.whites / 100, blacks: p.blacks / 100,
    fade: (p.fade / 100) * 0.14,
    saturation: 1 + p.saturation / 100, vibrance: p.vibrance / 100,
    clarity: p.clarity / 100, sharpen: (p.sharpen / 100) * 1.6, denoise: p.denoise / 100,
    vignette: p.vignette / 100, grain: (p.grain / 100) * 0.08,
  };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const s2l = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const l2s = (v) => { const c = Math.max(0, Math.min(1, v)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const PIVOT = 0.5647; // OKLab L среднего серого (18% отражения)

function linToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// JS-версия цветовой части (без пространственных эффектов) — для LUT.
export function gradeColor([r0, g0, b0], U) {
  let r = s2l(r0) * U.exposure * U.wb[0];
  let g = s2l(g0) * U.exposure * U.wb[1];
  let b = s2l(b0) * U.exposure * U.wb[2];
  let [L, A, B] = linToOklab(Math.max(0, r), Math.max(0, g), Math.max(0, b));
  L += U.shadows * 0.2 * (1 - smooth(0, 0.62, L));
  L += U.highlights * 0.2 * smooth(0.45, 1, L);
  L += U.whites * 0.12 * smooth(0.7, 1.05, L);
  L += U.blacks * 0.12 * (1 - smooth(-0.05, 0.3, L));
  L = PIVOT + (L - PIVOT) * U.contrast;
  L = U.fade + Math.max(0, L) * (1 - U.fade);
  const C = Math.hypot(A, B);
  const k = U.saturation * (1 + U.vibrance * (1 - smooth(0, 0.18, C)));
  A *= k; B *= k;
  [r, g, b] = oklabToLinear(L, A, B);
  return [l2s(r), l2s(g), l2s(b)];
}

export const GRADE_GLSL = `
float sm(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
vec3 s2l(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 l2s(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 linToOklab(vec3 c){
  c = max(c, 0.0);
  float l = pow(0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b, 1.0/3.0);
  float m = pow(0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b, 1.0/3.0);
  float s = pow(0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b, 1.0/3.0);
  return vec3(0.2104542553*l + 0.7936177850*m - 0.0040720468*s, 1.9779984951*l - 2.4285922050*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.8086757660*s);
}
vec3 oklabToLin(vec3 c){
  float l = pow(c.x + 0.3963377774*c.y + 0.2158037573*c.z, 3.0);
  float m = pow(c.x - 0.1055613458*c.y - 0.0638541728*c.z, 3.0);
  float s = pow(c.x - 0.0894841775*c.y - 1.2914855480*c.z, 3.0);
  return vec3(4.0767416621*l - 3.3077115913*m + 0.2309699292*s, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s, -0.0041960863*l - 0.7034186147*m + 1.7076147010*s);
}
uniform float uExposure; uniform vec3 uWb; uniform float uContrast; uniform float uHighlights; uniform float uShadows;
uniform float uWhites; uniform float uBlacks; uniform float uFade; uniform float uSaturation; uniform float uVibrance;
vec3 gradeColor(vec3 srgb){
  vec3 lin = s2l(srgb) * uExposure * uWb;
  vec3 lab = linToOklab(lin);
  float L = lab.x;
  L += uShadows * 0.2 * (1.0 - sm(0.0, 0.62, L));
  L += uHighlights * 0.2 * sm(0.45, 1.0, L);
  L += uWhites * 0.12 * sm(0.7, 1.05, L);
  L += uBlacks * 0.12 * (1.0 - sm(-0.05, 0.3, L));
  L = 0.5647 + (L - 0.5647) * uContrast;
  L = uFade + max(L, 0.0) * (1.0 - uFade);
  float C = length(lab.yz);
  float k = uSaturation * (1.0 + uVibrance * (1.0 - sm(0.0, 0.18, C)));
  return l2s(oklabToLin(vec3(L, lab.yz * k)));
}
`;
