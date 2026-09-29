import { contrastRatio, hexToRgb, oklabToOklch, oklchToRgbClamped, rgbToHex, rgbToOklab } from './oklab';

// Контраст: WCAG 2.x и APCA (SAPC 0.0.98G-4g, как в черновике WCAG 3), плюс
// «минимальное» исправление цвета: двигаем только светлоту в OKLCH (тон и
// насыщенность сохраняются, насколько позволяет гамут sRGB), пока не достигнем цели.

export const wcag = (fg, bg) => contrastRatio(hexToRgb(fg), hexToRgb(bg));

const APCA = {
  mainTRC: 2.4, normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414, scale: 1.14, loOffset: 0.027, deltaYmin: 0.0005, loClip: 0.1,
};
function apcaY([r, g, b]) {
  const f = (c) => (c / 255) ** APCA.mainTRC;
  return 0.2126729 * f(r) + 0.7151522 * f(g) + 0.072175 * f(b);
}
// Lc: положительный — тёмный текст на светлом, отрицательный — светлый на тёмном.
export function apcaLc(fgHex, bgHex) {
  let yt = apcaY(hexToRgb(fgHex)); let yb = apcaY(hexToRgb(bgHex));
  if (yt < APCA.blkThrs) yt += (APCA.blkThrs - yt) ** APCA.blkClmp;
  if (yb < APCA.blkThrs) yb += (APCA.blkThrs - yb) ** APCA.blkClmp;
  if (Math.abs(yb - yt) < APCA.deltaYmin) return 0;
  let out;
  if (yb > yt) {
    const s = (yb ** APCA.normBG - yt ** APCA.normTXT) * APCA.scale;
    out = s < APCA.loClip ? 0 : s - APCA.loOffset;
  } else {
    const s = (yb ** APCA.revBG - yt ** APCA.revTXT) * APCA.scale;
    out = s > -APCA.loClip ? 0 : s + APCA.loOffset;
  }
  return out * 100;
}

// Рекомендации APCA (упрощённая таблица Bronze): минимальный |Lc| по назначению.
export const APCA_LEVELS = [
  { lc: 90, ru: 'Мелкий текст, тонкие шрифты', en: 'Small text, thin fonts' },
  { lc: 75, ru: 'Основной текст (от 18px)', en: 'Body text (18px+)' },
  { lc: 60, ru: 'Крупный текст, контент', en: 'Large text, content' },
  { lc: 45, ru: 'Заголовки от 36px', en: 'Headlines 36px+' },
  { lc: 30, ru: 'Иконки, плейсхолдеры', en: 'Icons, placeholders' },
  { lc: 15, ru: 'Разделители, декор', en: 'Dividers, decoration' },
];

// Минимальный сдвиг светлоты цвета `hex` (относительно `against`), чтобы
// метрика достигла цели. Пробуем и светлее, и темнее — берём ближайший вариант.
export function fixColor(hex, against, { metric = 'wcag', target = 4.5 } = {}) {
  const score = (h) => (metric === 'apca' ? Math.abs(apcaLc(h, against)) : wcag(h, against));
  if (score(hex) >= target) return { hex, dL: 0, score: score(hex), ok: true };
  const [L, C, H] = oklabToOklch(...rgbToOklab(...hexToRgb(hex)));
  const tryDir = (dir) => {
    const edge = dir > 0 ? 1 : 0;
    const at = (l) => rgbToHex(...oklchToRgbClamped(l, C, H));
    if (score(at(edge)) < target) return null;
    let lo = L; let hi = edge; // lo — не проходит, hi — проходит
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (score(at(mid)) >= target) hi = mid; else lo = mid;
    }
    const h = at(hi);
    return { hex: h, dL: Math.abs(hi - L), score: score(h), ok: true };
  };
  const cands = [tryDir(1), tryDir(-1)].filter(Boolean);
  if (!cands.length) {
    // Даже чёрный/белый не дотягивают — отдаём лучший из них.
    const bw = ['#000000', '#ffffff'].map((h) => ({ hex: h, dL: 1, score: score(h), ok: score(h) >= target }));
    return bw.reduce((a, b) => (b.score > a.score ? b : a));
  }
  return cands.reduce((a, b) => (b.dL < a.dL ? b : a));
}

export function normalizeHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}
