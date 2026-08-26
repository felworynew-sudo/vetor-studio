// ImageMagick-wasm для «длинного хвоста» форматов (tiff, psd, tga, pnm, dds,
// exr, hdr, ico, jp2, pcx, sgi, xbm/xpm и т.д.) на чтение и запись. Тяжёлый wasm
// (~15 МБ) грузится ЛЕНИВО и только когда формат не берётся нативным canvas.
// wasm лежит same-origin (Vite копирует в dist) → работает офлайн после кеша.

import {
  initializeImageMagick, ImageMagick, MagickFormat, MagickReadSettings,
} from '@imagemagick/magick-wasm';
import wasmUrl from '@imagemagick/magick-wasm/magick.wasm?url'; // x86 (32-бит) — совместим с generic initializeImageMagick

let initPromise = null;
function ensureMagick() {
  if (!initPromise) {
    initPromise = fetch(wasmUrl)
      .then((r) => r.arrayBuffer())
      .then((b) => initializeImageMagick(new Uint8Array(b)));
  }
  return initPromise;
}

// Конвертация байтов в формат по ключу MagickFormat ('Tiff', 'Png'…).
// inputFormatKey — подсказка формата ВХОДА (нужна форматам без magic-байтов,
// например TGA: иначе NoDecodeDelegate). Обычно берётся из расширения файла.
export async function magickConvert(inputBytes, formatKey, quality, inputFormatKey) {
  await ensureMagick();
  const out = MagickFormat[formatKey] ?? formatKey;
  const inFmt = inputFormatKey ? (MagickFormat[inputFormatKey] ?? null) : null;
  return new Promise((resolve, reject) => {
    try {
      const write = (img) => {
        if (quality && Number.isFinite(quality)) img.quality = quality;
        img.write(out, (data) => resolve(new Uint8Array(data)));
      };
      if (inFmt) {
        const settings = new MagickReadSettings();
        settings.format = inFmt;
        ImageMagick.read(new Uint8Array(inputBytes), settings, write);
      } else {
        ImageMagick.read(new Uint8Array(inputBytes), write);
      }
    } catch (e) { reject(e); }
  });
}

export function preloadMagick() { return ensureMagick(); }
export { MagickFormat };
