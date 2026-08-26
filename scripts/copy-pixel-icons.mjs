// Копирует пиксель-иконки PNG в public/tools/icons с ascii-именами и печатает
// карту «русское имя → файл». Мелкие PNG рендерятся на сайте с image-rendering:
// pixelated (чётко, без размытия) и весят копейки — для брендовых иконок этого
// достаточно; истинную векторизацию делает отдельный инструмент студии.
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'E:\\бренд\\иконки пиксель';
const OUT = process.argv[3] || path.join(process.cwd(), 'public', 'tools', 'icons');
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slug = (n) => n.toLowerCase().split('').map((c) => (TR[c] ?? c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.png') && !f.startsWith('._'));
const map = {};
for (const f of files) {
  const name = `${slug(f.replace(/\.png$/i, ''))}.png`;
  fs.copyFileSync(path.join(SRC, f), path.join(OUT, name));
  map[f.replace(/\.png$/i, '')] = name;
}
fs.writeFileSync(path.join(OUT, '_index.json'), `${JSON.stringify(map, null, 2)}\n`);
console.log(`Скопировано ${files.length} PNG → ${OUT}`);
