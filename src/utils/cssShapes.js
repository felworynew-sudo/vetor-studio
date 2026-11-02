// Векторные узоры и блобы для CSS-студии: бесшовная плитка-узор и органическая
// форма из точек по окружности, сглаженная кривыми Безье. Чистые функции → SVG-строки.

export const PATTERN_TYPES = {
  dots: { ru: 'Точки', en: 'Dots' }, grid: { ru: 'Сетка', en: 'Grid' }, stripes: { ru: 'Полоски', en: 'Stripes' },
  checkers: { ru: 'Клетка', en: 'Checkers' }, cross: { ru: 'Кресты', en: 'Crosses' }, waves: { ru: 'Волны', en: 'Waves' }, triangles: { ru: 'Треугольники', en: 'Triangles' },
};

export function tile(type, n, fg, w) {
  const h = n / 2;
  switch (type) {
    case 'dots': return `<circle cx="${h}" cy="${h}" r="${w}" fill="${fg}"/>`;
    case 'grid': return `<path d="M0 0H${n}M0 0V${n}" stroke="${fg}" stroke-width="${w}" fill="none"/>`;
    case 'stripes': return `<path d="M-${n} ${n}L${n} -${n}M0 ${n * 2}L${n * 2} 0" stroke="${fg}" stroke-width="${w * 2}"/>`;
    case 'checkers': return `<rect width="${h}" height="${h}" fill="${fg}"/><rect x="${h}" y="${h}" width="${h}" height="${h}" fill="${fg}"/>`;
    case 'cross': return `<path d="M${h} ${h - w * 2}V${h + w * 2}M${h - w * 2} ${h}H${h + w * 2}" stroke="${fg}" stroke-width="${w}"/>`;
    case 'waves': return `<path d="M0 ${h} Q ${n / 4} 0, ${h} ${h} T ${n} ${h}" stroke="${fg}" stroke-width="${w}" fill="none"/>`;
    case 'triangles': return `<path d="M${h} ${w} L${n - w} ${n - w} L${w} ${n - w} Z" fill="${fg}"/>`;
    default: return '';
  }
}

export function patternSvg(type, scale, fg, bg, weight) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scale}" height="${scale}" viewBox="0 0 ${scale} ${scale}"><rect width="${scale}" height="${scale}" fill="${bg}"/>${tile(type, scale, fg, weight)}</svg>`;
}

// Мулбери32 — детерминированный ГПСЧ по сиду.
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

export function blobPath(points, contrast, seed, size) {
  const cx = size / 2; const cy = size / 2; const base = size * 0.36; const rand = rng(seed);
  const pts = [];
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const r = base * (1 + (rand() - 0.5) * 2 * contrast);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // сглаживание catmull-rom → cubic bezier, замкнуто
  const n = pts.length; let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n]; const p1 = pts[i]; const p2 = pts[(i + 1) % n]; const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6; const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6; const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  return `${d}Z`;
}

export function blobSvg(path, size, mode, c1, c2) {
  const defs = mode === 'gradient' ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${defs}<path d="${path}" fill="${mode === 'gradient' ? 'url(#g)' : c1}"/></svg>`;
}

export const svgUri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
