// Проставляет поле "img" (пиксель-иконка) тулам и категориям в toolsData.json.
// Иконки лежат в public/tools/icons. Где иконки нет — остаётся эмодзи (фолбэк).
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'src', 'data', 'toolsData.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const TOOL_ICONS = {
  'image-converter': 'fayly', crop: 'nozhnicy', 'color-grade': 'foto',
  'color-converter': 'cveta', 'color-harmony': 'itenkrug', 'color-weight': 'vesy',
  'mood-palettes': 'palitra', 'pastel-pairs': 'pastel-i-temn-para', 'contrast-checker': 'kontrast',
  'palette-extractor': 'palitra-iz-foto', 'colorblind-simulator': 'ochki', 'noise-generator': 'shum',
  'break-timer': 'taymer', watermark: 'birka', 'svg-cleaner': 'pipidastr',
  'design-challenge': 'lampochka', 'gradient-generator': 'palitra-1', 'favicon-generator': 'favikon',
  'qr-generator': 'kyuar', 'barcode-generator': 'shtrihkod', 'voronoi-generator': 'voroniy',
  'rule-of-thirds': 'pravilo-tretey', 'icon-scaler': 'masshtab', 'eink-simulator': 'printer',
  'karma-counter': 'schety', 'background-remover': 'nozhnicy', upscaler: 'apskeyl',
  'smart-crop': 'mishen', 'lofi-radio': 'radio', 'audio-enhancer': 'zvukplyus',
  'blur-analyzer': 'glaz', 'audio-trimmer': 'naushniki', 'image-metadata': 'pipidastr',
  'ai-detector': 'lupaii', 'ascii-art': 'monitor', 'css-from-svg': 'svg',
  isometry: 't-izometriya', 'glyph-map': 'abv', 'yt-thumbnail': 'yutub',
  'audio-metadata': 'birka',
};
const CAT_ICONS = {
  image: 'foto', color: 'palitra', svg: 'svg', generators: 'zvezdy',
  ai: 'mozg', audio: 'naushniki', utility: 'klyuch-gaechnyy',
};

let nt = 0; let nc = 0;
data.tools.forEach((t) => { if (TOOL_ICONS[t.slug]) { t.img = `${TOOL_ICONS[t.slug]}.png`; nt += 1; } });
data.categories.forEach((c) => { if (CAT_ICONS[c.id]) { c.img = `${CAT_ICONS[c.id]}.png`; nc += 1; } });

fs.writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Иконки проставлены: ${nt} тулов, ${nc} категорий.`);
