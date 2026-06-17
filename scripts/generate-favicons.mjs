import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const faviconDir = path.join(publicDir, 'favicon');
const sourceSvg = path.join(faviconDir, 'favicon.svg');
const versionSuffix = '20260612';

function buildIcoFromPng(pngBuffer, width = 32, height = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type: icon
  header.writeUInt16LE(1, 4); // number of images

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width === 256 ? 0 : width, 0);
  entry.writeUInt8(height === 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image data size
  entry.writeUInt32LE(22, 12); // data offset

  return Buffer.concat([header, entry, pngBuffer]);
}

async function renderPng(size) {
  return sharp(sourceSvg, { density: 512 })
    .resize(size, size, { fit: 'contain' })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await fs.mkdir(faviconDir, { recursive: true });

  const png16 = await renderPng(16);
  const png32 = await renderPng(32);
  const png48 = await renderPng(48);
  const png120 = await renderPng(120);
  const png180 = await renderPng(180);
  const ico32 = buildIcoFromPng(png32, 32, 32);

  await Promise.all([
    fs.writeFile(path.join(faviconDir, 'favicon-16.png'), png16),
    fs.writeFile(path.join(faviconDir, 'favicon-32.png'), png32),
    fs.writeFile(path.join(faviconDir, 'favicon-48.png'), png48),
    fs.writeFile(path.join(publicDir, 'favicon.png'), png120),
    fs.writeFile(path.join(publicDir, 'apple-touch-icon.png'), png180),
    fs.writeFile(path.join(publicDir, 'favicon.ico'), ico32),
    fs.copyFile(sourceSvg, path.join(publicDir, 'favicon.svg')),
    fs.writeFile(path.join(publicDir, `favicon-${versionSuffix}.ico`), ico32),
    fs.writeFile(path.join(publicDir, `favicon-${versionSuffix}.png`), png120),
    fs.copyFile(sourceSvg, path.join(publicDir, `favicon-${versionSuffix}.svg`)),
  ]);

  const manifest = {
    name: 'Vetor Studio',
    short_name: 'Vetor',
    icons: [
      { src: '/favicon/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { src: '/favicon/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { src: '/favicon/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { src: '/favicon.png', sizes: '120x120', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { src: `/favicon-${versionSuffix}.png`, sizes: '120x120', type: 'image/png' },
    ],
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0d11',
    theme_color: '#0d0d11',
    lang: 'ru',
  };

  await fs.writeFile(
    path.join(publicDir, 'site.webmanifest'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

main();
