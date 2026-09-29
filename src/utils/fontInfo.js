// Разбор шрифта через fontkit (MIT): имена, метрики, покрытие письменностей,
// OpenType-фичи, вариативные оси и именованные начертания. Плюс подключение
// шрифта в документ через FontFace для живого превью.

export async function openFont(file) {
  const fontkit = await import('fontkit');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let font = (fontkit.create || fontkit.default.create)(bytes);
  if (font.fonts) [font] = font.fonts; // коллекция TTC — берём первый
  const family = `F${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const ff = new FontFace(family, bytes);
  await ff.load(); document.fonts.add(ff);
  return { font, family, bytes, name: file.name.replace(/\.[^.]+$/, '') };
}

export const FEATURE_NAMES = {
  liga: 'Стандартные лигатуры', dlig: 'Дискретные лигатуры', clig: 'Контекстные лигатуры', calt: 'Контекстные альтернативы', salt: 'Стилистические альтернативы',
  swsh: 'Росчерки', smcp: 'Капитель', c2sc: 'Капитель из прописных', case: 'Для прописных', onum: 'Минускульные цифры', lnum: 'Прописные цифры',
  tnum: 'Моноширинные цифры', pnum: 'Пропорциональные цифры', zero: 'Перечёркнутый ноль', frac: 'Дроби', sups: 'Надстрочные', subs: 'Подстрочные',
  ordn: 'Порядковые', kern: 'Кернинг', locl: 'Локальные формы', ss01: 'Стилистический набор 1', ss02: 'Стилистический набор 2', ss03: 'Стилистический набор 3',
  ss04: 'Стилистический набор 4', ss05: 'Стилистический набор 5', ss06: 'Стилистический набор 6', ss07: 'Стилистический набор 7', ss08: 'Стилистический набор 8',
  cv01: 'Вариант символа 1', cv02: 'Вариант символа 2', hist: 'Исторические формы', titl: 'Заголовочные', aalt: 'Все альтернативы', mark: 'Диакритика', mkmk: 'Диакритика на диакритике',
  ccmp: 'Составные глифы', rlig: 'Обязательные лигатуры', init: 'Начальные формы', medi: 'Средние формы', fina: 'Конечные формы', isol: 'Изолированные формы',
};
export const AXIS_NAMES = { wght: 'Насыщенность', wdth: 'Ширина', slnt: 'Наклон', ital: 'Курсив', opsz: 'Оптический размер', GRAD: 'Градация', XHGT: 'Высота x', CASL: 'Casual', MONO: 'Моно', CRSV: 'Курсивность' };

const SCRIPTS = [
  { id: 'latin', ru: 'Латиница', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' },
  { id: 'latinext', ru: 'Латиница расшир.', chars: 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿĄąĆćĘęŁłŃńŚśŹźŻżŠšŽžČčŘřŮůĞğİıŞş' },
  { id: 'cyr', ru: 'Кириллица', chars: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' },
  { id: 'cyrext', ru: 'Укр./бел./каз.', chars: 'ҐґЄєІіЇїЎўҒғҚқҢңӨөҰұҮүҺһӘә' },
  { id: 'greek', ru: 'Греческий', chars: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω' },
  { id: 'digits', ru: 'Цифры', chars: '0123456789' },
  { id: 'typo', ru: 'Типографика', chars: '«»„“”‘’—–…№€₽$£¥©®™§°±×÷' },
];

// Именованные начертания из таблицы fvar. Свой разбор: font.namedVariations в fontkit
// падает, если имя начертания записано не на английском.
export function namedInstances(font) {
  const out = {};
  try {
    const fv = font.fvar; if (!fv) return out;
    const tags = fv.axis.map((a) => a.axisTag);
    fv.instance.forEach((inst, i) => {
      const nm = inst.name && typeof inst.name === 'object' ? (inst.name.en || Object.values(inst.name)[0]) : null;
      const std = inst.nameID === 2 || inst.nameID === 17 ? (font.subfamilyName || 'Regular') : null;
      out[nm || std || `#${i + 1}`] = Object.fromEntries(tags.map((tg, k) => [tg, inst.coord[k]]));
    });
  } catch { /* нет fvar */ }
  return out;
}

export function fontInfo(font) {
  const cov = SCRIPTS.map((s) => {
    const chars = [...s.chars]; const have = chars.filter((c) => font.hasGlyphForCodePoint(c.codePointAt(0))).length;
    return { ...s, have, total: chars.length };
  });
  let features = [];
  try { features = [...new Set(font.availableFeatures || [])].sort(); } catch { features = []; }
  const axes = font.variationAxes || {};
  const instances = namedInstances(font);
  return {
    family: font.familyName, sub: font.subfamilyName, full: font.fullName, ps: font.postscriptName, version: font.version,
    copyright: font.copyright, designer: font.getName?.('designer'), license: font.getName?.('licenseDescription'), licenseUrl: font.getName?.('licenseURL'),
    upm: font.unitsPerEm, ascent: font.ascent, descent: font.descent, lineGap: font.lineGap, capHeight: font.capHeight, xHeight: font.xHeight,
    italicAngle: font.italicAngle, glyphs: font.numGlyphs, chars: (font.characterSet || []).length, format: font.type, coverage: cov, features, axes, instances,
  };
}

export function glyphSvg(glyph, font, size = 200) {
  const upm = font.unitsPerEm; const pad = upm * 0.1;
  const w = Math.max(glyph.advanceWidth, upm * 0.3);
  const top = font.ascent; const h = font.ascent - font.descent;
  const d = glyph.path.toSVG();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" width="${size * (w + pad * 2) / (h + pad * 2)}" height="${size}"><path transform="matrix(1 0 0 -1 0 ${top})" d="${d}"/></svg>`;
}
