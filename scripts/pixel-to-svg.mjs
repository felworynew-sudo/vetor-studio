// Векторизация пиксель-арт PNG → SVG: каждый непрозрачный пиксель становится
// вектором-квадратом того же цвета. Горизонтальные прогоны одного цвета
// сливаются в один <rect> (меньше узлов). shape-rendering=crispEdges — квадраты
// остаются чёткими при любом масштабе. Источник — E:\бренд\иконки пиксель.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'E:\\бренд\\иконки пиксель';
const OUT = process.argv[3] || path.join(process.cwd(), 'public', 'tools', 'px');
const ALPHA_MIN = 8; // ниже — считаем прозрачным

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
function slug(name) {
  return name.toLowerCase().split('').map((ch) => (TR[ch] ?? ch)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

async function convert(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const rects = [];
  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      const i = (y * w + x) * channels;
      const a = data[i + 3];
      if (a < ALPHA_MIN) { x += 1; continue; }
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      let run = 1;
      // тянем прогон, пока цвет И альфа совпадают
      while (x + run < w) {
        const j = (y * w + x + run) * channels;
        if (data[j + 3] < ALPHA_MIN || data[j] !== r || data[j + 1] !== g || data[j + 2] !== b || data[j + 3] !== a) break;
        run += 1;
      }
      const op = a === 255 ? '' : ` fill-opacity="${(a / 255).toFixed(3)}"`;
      rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${hex(r, g, b)}"${op}/>`);
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects.join('')}</svg>\n`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.png') && !f.startsWith('._'));
  const map = {};
  let total = 0;
  for (const f of files) {
    const base = f.replace(/\.png$/i, '');
    const name = `${slug(base)}.svg`;
    const svg = await convert(path.join(SRC, f)); // eslint-disable-line no-await-in-loop
    fs.writeFileSync(path.join(OUT, name), svg);
    map[base] = name;
    total += 1;
  }
  fs.writeFileSync(path.join(OUT, '_index.json'), `${JSON.stringify(map, null, 2)}\n`);
  console.log(`Готово: ${total} SVG → ${OUT}`);
  console.log(Object.entries(map).map(([ru, en]) => `  ${ru} → ${en}`).join('\n'));
}
main();
