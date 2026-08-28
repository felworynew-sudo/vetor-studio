// Генерирует уникальную OG-картинку (1200×630) на каждый инструмент Верстака в
// пиксельно-аркадном стиле бренда: иконка тула + название + чип категории.
// Текст рисуется ВЕКТОРНЫМИ путями (Pixel Operator для латиницы, Handjet для
// кириллицы), поэтому растру не нужен шрифт — результат стабилен на любой машине.
// Соцкраулеры (Telegram/VK/Twitter) рендерят только PNG, отсюда растеризация sharp.
//
// Важно: контуры Handjet очень тяжёлые (~70k символов на глиф, unitsPerEm 8160).
// Если всю карточку собрать в один SVG (~2.5 МБ путей), librsvg молча обрывает
// поздние path. Поэтому каждый текстовый прогон растеризуется в СВОЙ маленький PNG,
// а затем слои композитятся на лёгкий фон — ни один SVG не превышает лимит.
//
// Запуск: node scripts/generate-tool-og.mjs [slug]   (без slug — все тулы, оба языка)
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = process.cwd();
const onlySlug = process.argv[2] || null;

const W = 1200;
const H = 630;
const ACCENT = '#7e83ff';
const CORAL = '#ff5c63';
const TEXT_X = 452;

async function loadFont(rel) {
  const buf = await readFile(path.join(root, rel));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const pixel = await loadFont('public/tools/fonts/PixelOperator-Bold.ttf');
const handjet = await loadFont('scripts/handjet-cyrillic.ttf');

const isCyr = (cp) => (cp >= 0x0400 && cp <= 0x04ff);
const fontFor = (cp) => (isCyr(cp) ? handjet : pixel);

// Ширина строки в пикселях (по адвансам нужного шрифта) — без построения путей.
function measure(str, size) {
  let x = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    const f = fontFor(cp);
    x += (f.charToGlyph(ch).advanceWidth / f.unitsPerEm) * size;
  }
  return x;
}

// Каждый глиф — в СВОЙ крошечный PNG-слой, композитятся по нарастающему x.
// Handjet-контуры так тяжелы, что даже одна строка (~18 глифов ≈ 1.26 МБ путей)
// превышает лимит librsvg и обрывается. Один глиф (~70 КБ) — всегда в пределах.
// Возвращает {ops, width}: ops — массив composite-операций sharp.
async function glyphComposites(str, size, x0, baselineY, fill) {
  const ops = [];
  let x = x0;
  const h = Math.ceil(size * 1.4);
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    const f = fontFor(cp);
    const g = f.charToGlyph(ch);
    const adv = (g.advanceWidth / f.unitsPerEm) * size;
    if (ch !== ' ') {
      const d = g.getPath(2, size, size).toPathData(1); // локально: x=2, базовая y=size
      if (d && d !== 'Z') {
        const w = Math.ceil(adv) + 8;
        const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="${fill}"/></svg>`;
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();
        ops.push({ input: buf, left: Math.round(x), top: Math.round(baselineY - size) });
      }
    }
    x += adv;
  }
  return { ops, width: x - x0 };
}

// Жадный перенос по словам под maxWidth.
function wrap(str, size, maxWidth) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (measure(cand, size) > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Подбирает кегль так, чтобы уложить заголовок максимум в 3 строки и по ширине.
function fitTitle(str, maxWidth, maxSize, minSize) {
  for (let s = maxSize; s >= minSize; s -= 2) {
    const lines = wrap(str, s, maxWidth);
    if (lines.length <= 3 && lines.every((l) => measure(l, s) <= maxWidth)) return { size: s, lines };
  }
  return { size: minSize, lines: wrap(str, minSize, maxWidth) };
}

async function iconBuffer(imgFile) {
  const p = path.join(root, 'public/tools/icons', imgFile);
  try {
    // апскейл пиксель-иконки без сглаживания, чтобы оставалась чёткой
    return await sharp(p).resize(264, 264, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  } catch {
    return null;
  }
}

// Лёгкий фон-SVG: только заливки, сетка, рамки, чипы, подчёркивания — без текста.
function baseSvg({ wordmarkW, titleUnderlineW, titleUnderlineY, chipY, chipW }) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g1" cx="16%" cy="-6%" r="70%">
      <stop offset="0%" stop-color="#6166ff" stop-opacity="0.30"/>
      <stop offset="60%" stop-color="#6166ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="100%" cy="0%" r="65%">
      <stop offset="0%" stop-color="${CORAL}" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="${CORAL}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#0b0b0f"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="${ACCENT}"/>
  <rect x="96" y="171" width="288" height="288" fill="#141420" stroke="#2a2a3a" stroke-width="2"/>
  <rect x="${TEXT_X}" y="196" width="${wordmarkW}" height="3" fill="${ACCENT}" opacity="0.5"/>
  <rect x="${TEXT_X}" y="${titleUnderlineY}" width="${titleUnderlineW}" height="5" fill="${CORAL}"/>
  <rect x="${TEXT_X}" y="${chipY}" width="${chipW}" height="40" fill="rgba(97,102,255,0.16)" stroke="${ACCENT}" stroke-width="1.5"/>
</svg>`;
}

async function renderTool(tool, categories) {
  const cat = categories.find((c) => c.id === tool.categoryId);
  const icon = await iconBuffer(tool.img || `${tool.slug}.png`);

  for (const lang of ['ru', 'en']) {
    const title = (tool[lang]?.title || tool.slug).replace(/[«»""]/g, '').trim();
    const category = (cat ? cat[lang] : '').toUpperCase();
    const wmText = lang === 'ru' ? 'ВЕРСТАК' : 'VERSTAK';

    const maxTextW = W - TEXT_X - 84;
    const { size: titleSize, lines } = fitTitle(title, maxTextW, 80, 40);
    const lh = Math.round(titleSize * 1.12);

    // геометрия
    const titleBaseline0 = 300;
    const titleBottomBaseline = titleBaseline0 + (lines.length - 1) * lh;
    const widest = Math.min(Math.max(...lines.map((l) => measure(l, titleSize))), maxTextW);
    const chipY = titleBottomBaseline + 54;
    const chipPad = 18;
    const chipW = Math.round(measure(category, 26) + chipPad * 2);

    const wm = await glyphComposites(wmText, 34, TEXT_X, 178, ACCENT);
    const composites = [...wm.ops];
    for (let i = 0; i < lines.length; i += 1) {
      const L = await glyphComposites(lines[i], titleSize, TEXT_X, titleBaseline0 + i * lh, '#f4f4f8');
      composites.push(...L.ops);
    }
    const chip = await glyphComposites(category, 26, TEXT_X + chipPad, chipY + 28, ACCENT);
    composites.push(...chip.ops);
    const foot = await glyphComposites('vetor-studio.ru/tools', 26, TEXT_X, 566, '#8a8aa0');
    composites.push(...foot.ops);

    const bg = baseSvg({
      wordmarkW: wm.width,
      titleUnderlineW: Math.round(widest),
      titleUnderlineY: titleBottomBaseline + 16,
      chipY,
      chipW,
    });

    if (icon) composites.push({ input: icon, left: 96 + Math.round((288 - 264) / 2), top: 171 + Math.round((288 - 264) / 2) });

    const out = path.join(root, 'public/og/tools', lang === 'ru' ? `${tool.slug}.png` : `${tool.slug}-en.png`);
    await sharp(Buffer.from(bg)).composite(composites).png({ compressionLevel: 9 }).toFile(out);
  }
}

const data = JSON.parse(await readFile(path.join(root, 'src/data/toolsData.json'), 'utf8'));
await mkdir(path.join(root, 'public/og/tools'), { recursive: true });
const tools = onlySlug ? data.tools.filter((t) => t.slug === onlySlug) : data.tools;
let n = 0;
for (const tool of tools) {
  await renderTool(tool, data.categories);
  n += 1;
  process.stdout.write(`\r  og: ${n}/${tools.length} — ${tool.slug}          `);
}
process.stdout.write(`\n✓ ${n} tools × 2 langs → public/og/tools/\n`);
