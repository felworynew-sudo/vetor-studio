// Генерация OG-картинок 1200x630 (превью ссылок в мессенджерах/соцсетях).
// Единый фирменный шаблон: тёмный градиент + логотип Vetor + название раздела.
// Запуск: node scripts/generate-og-images.mjs  (нужен sharp из devDependencies).
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'og');
mkdirSync(outDir, { recursive: true });

const W = 1200, H = 630;
const logo = readFileSync(path.join(root, 'public', 'logos', 'vetorlogo.svg'));

const cards = [
  { file: 'default', title: 'Превью, обложки и брендинг' },
  { file: 'previews', title: 'Превью для YouTube' },
  { file: 'design', title: 'Дизайн и брендинг' },
  { file: 'fonts', title: 'Авторские шрифты' },
  { file: 'price', title: 'Прайс без созвонов' },
  { file: 'plugins', title: 'Resto — реставрация фото' },
  { file: 'blog', title: 'Блог о дизайне' },
  // Английские варианты для /en/ (превью ссылок в международных соцсетях).
  { file: 'default-en', title: 'Thumbnails, covers & branding' },
  { file: 'previews-en', title: 'YouTube thumbnails' },
  { file: 'design-en', title: 'Design & branding' },
  { file: 'fonts-en', title: 'Original fonts' },
  { file: 'price-en', title: 'Pricing, no calls needed' },
  { file: 'plugins-en', title: 'Resto — photo restoration' },
  { file: 'blog-en', title: 'Design blog' },
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const logoW = 560;
const logoPng = await sharp(logo, { density: 300 }).resize({ width: logoW }).png().toBuffer();
const logoMeta = await sharp(logoPng).metadata();
const logoLeft = Math.round((W - (logoMeta.width || logoW)) / 2);

for (const card of cards) {
  const fontSize = card.title.length > 22 ? 54 : 64;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d0d11"/>
      <stop offset="0.55" stop-color="#141021"/>
      <stop offset="1" stop-color="#210732"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="1050" cy="120" r="220" fill="#6166ff" opacity="0.14"/>
  <circle cx="180" cy="560" r="200" fill="#ff5c63" opacity="0.10"/>
  <text x="${W / 2}" y="430" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#f5f7fb">${esc(card.title)}</text>
  <rect x="${W / 2 - 60}" y="470" width="120" height="6" rx="3" fill="#ff5c63"/>
  <text x="${W / 2}" y="560" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#a8afbc">vetor-studio.ru</text>
</svg>`;
  const outPath = path.join(outDir, `${card.file}.png`);
  await sharp(Buffer.from(bg))
    .composite([{ input: logoPng, top: 150, left: logoLeft }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log('wrote', path.relative(root, outPath));
}
console.log('done:', cards.length, 'OG images');
