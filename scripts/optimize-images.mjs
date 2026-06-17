import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'public');
const outputRoot = path.join(publicDir, 'optimized');

const jobs = [
  { folder: 'thumbs', widths: [720, 1280], quality: 76 },
  { folder: 'music', widths: [560, 960], quality: 80 },
  { folder: 'gallery', widths: [720, 1280], quality: 78 },
];

const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function sanitizeAssetName(value) {
  const normalized = String(value || '');
  const replaced = Array.from(normalized).map((character) => {
    if (/^[A-Za-z0-9_-]$/.test(character)) {
      return character;
    }

    return `_u${character.codePointAt(0).toString(16)}_`;
  }).join('');

  return replaced.replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'asset';
}

async function listImageFiles(folder) {
  const root = path.join(publicDir, folder);

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

function outputPathFor(filePath, folder, width) {
  const parsed = path.parse(filePath);
  const safeName = sanitizeAssetName(parsed.name);
  return path.join(outputRoot, folder, `${safeName}-${width}.webp`);
}

async function optimizeFile(filePath, folder, widths, quality) {
  await fs.mkdir(path.join(outputRoot, folder), { recursive: true });

  await Promise.all(widths.map(async (width) => {
    const target = outputPathFor(filePath, folder, width);

    await sharp(filePath, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 5 })
      .toFile(target);
  }));

  return widths.length;
}

async function main() {
  await fs.rm(outputRoot, { recursive: true, force: true });
  let totalFiles = 0;
  let totalVariants = 0;

  for (const job of jobs) {
    const files = await listImageFiles(job.folder);
    totalFiles += files.length;

    for (const file of files) {
      const variants = await optimizeFile(file, job.folder, job.widths, job.quality);
      totalVariants += variants;
      console.log(`optimized ${path.relative(publicDir, file)} -> ${variants} webp`);
    }
  }

  console.log(`Done. ${totalFiles} images, ${totalVariants} optimized variants.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
