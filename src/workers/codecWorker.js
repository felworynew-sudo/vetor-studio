// Воркер кодеков Squoosh (jSquash, Apache-2.0): MozJPEG, WebP, AVIF, OxiPNG.
// Кодирование в отдельном потоке — вкладка не подвисает на больших фото и AVIF.
// Сообщение: { id, imageData, format, quality } → { id, buffer } | { id, error }.

const codecs = {};
async function codec(format) {
  if (codecs[format]) return codecs[format];
  if (format === 'jpeg') codecs[format] = import('@jsquash/jpeg');
  else if (format === 'webp') codecs[format] = import('@jsquash/webp');
  else if (format === 'avif') codecs[format] = import('@jsquash/avif');
  else if (format === 'png') codecs[format] = import('@jsquash/oxipng');
  return codecs[format];
}

async function encode(imageData, format, quality) {
  const mod = await codec(format);
  if (format === 'jpeg') return mod.encode(imageData, { quality, progressive: true, optimize_coding: true });
  if (format === 'webp') return mod.encode(imageData, { quality, method: 5 });
  if (format === 'avif') return mod.encode(imageData, { quality, speed: 7 });
  // PNG: без потерь, quality задаёт уровень OxiPNG (1..6).
  return mod.optimise(imageData, { level: Math.max(1, Math.min(6, Math.round(quality / 17))), interlace: false });
}

self.onmessage = async (e) => {
  const { id, imageData, format, quality } = e.data;
  try {
    const buffer = await encode(imageData, format, quality);
    self.postMessage({ id, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
