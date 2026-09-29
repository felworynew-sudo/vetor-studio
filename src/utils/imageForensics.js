// Экспертиза изображения: набор независимых улик вместо одного «87% AI».
// Каждая улика — { id, weight, dir: 'ai' | 'real' | 'neutral', title, detail }.
// weight — сила улики (0..3); из суммы получается уровень «высокие/средние/низкие».

const latin1 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
};

// ---------- Контейнеры: вытаскиваем ТОЛЬКО метаданные (не пиксели) ----------

function jpegSegments(data) {
  const meta = []; const dqt = [];
  let pos = 2;
  while (pos + 4 <= data.length && data[pos] === 0xff) {
    const marker = data[pos + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = (data[pos + 2] << 8) | data[pos + 3];
    const payload = data.subarray(pos + 4, pos + 2 + len);
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) meta.push(payload);
    if (marker === 0xdb) dqt.push(payload);
    pos += 2 + len;
  }
  return { meta, dqt };
}

async function inflate(bytes) {
  try {
    const ds = new DecompressionStream('deflate');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  } catch { return new Uint8Array(0); }
}

async function pngChunks(data) {
  const texts = []; const meta = [];
  let pos = 8;
  const u8 = new TextDecoder();
  while (pos + 8 <= data.length) {
    const len = (data[pos] << 24 | data[pos + 1] << 16 | data[pos + 2] << 8 | data[pos + 3]) >>> 0;
    const type = latin1(data.subarray(pos + 4, pos + 8));
    const body = data.subarray(pos + 8, pos + 8 + len);
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const z = body.indexOf(0);
      const key = latin1(body.subarray(0, z));
      let text = '';
      if (type === 'tEXt') text = latin1(body.subarray(z + 1));
      else if (type === 'zTXt') text = u8.decode(await inflate(body.subarray(z + 2)));
      else {
        // iTXt: key\0 flag method lang\0 tkey\0 text
        const flag = body[z + 1];
        let p = z + 3;
        p = body.indexOf(0, p) + 1; p = body.indexOf(0, p) + 1;
        const raw = body.subarray(p);
        text = u8.decode(flag ? await inflate(raw) : raw);
      }
      texts.push({ key, text });
      meta.push(body);
    } else if (type === 'caBX' || type === 'eXIf') meta.push(body);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  return { texts, meta };
}

function webpChunks(data) {
  const meta = [];
  let pos = 12;
  while (pos + 8 <= data.length) {
    const cc = latin1(data.subarray(pos, pos + 4));
    const size = (data[pos + 4] | (data[pos + 5] << 8) | (data[pos + 6] << 16) | (data[pos + 7] << 24)) >>> 0;
    if (cc === 'EXIF' || cc === 'XMP ') meta.push(data.subarray(pos + 8, pos + 8 + size));
    pos += 8 + size + (size & 1);
  }
  return { meta };
}

// ---------- JPEG: оценка качества по таблицам квантования ----------

const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];

function jpegQuality(dqtPayloads) {
  for (const p of dqtPayloads) {
    let i = 0;
    while (i < p.length) {
      const pq = p[i] >> 4; const tq = p[i] & 15; i += 1;
      const table = [];
      for (let k = 0; k < 64; k += 1) { table.push(pq ? (p[i] << 8) | p[i + 1] : p[i]); i += pq ? 2 : 1; }
      if (tq === 0) {
        // Таблица в файле идёт в zigzag-порядке; стандартная — в естественном.
        let sum = 0;
        for (let k = 0; k < 64; k += 1) sum += (table[k] * 100) / STD_LUMA[ZIGZAG[k]];
        const S = sum / 64;
        const q = S <= 100 ? (200 - S) / 2 : 5000 / S;
        const exact = table.every((v, k) => {
          const qs = q < 50 ? 5000 / q : 200 - 2 * q;
          return Math.abs(Math.max(1, Math.min(255, Math.floor((STD_LUMA[ZIGZAG[k]] * qs + 50) / 100))) - v) <= 1;
        });
        return { quality: Math.max(1, Math.min(100, Math.round(q))), standard: exact };
      }
    }
  }
  return null;
}

// ---------- Паттерны в метаданных ----------

const GENERATORS = [
  ['Stable Diffusion', /stable[\s_-]?diffusion|\bsd[\s_-]?xl\b|sampler:\s*\w|cfg scale|negative prompt/i],
  ['ComfyUI', /comfyui|"class_type"\s*:/i],
  ['Automatic1111 / Forge', /steps:\s*\d+,\s*sampler/i],
  ['NovelAI', /novelai/i],
  ['Midjourney', /midjourney/i],
  ['DALL·E / OpenAI', /dall[\s·.-]?e|openai|chatgpt|gpt-image/i],
  ['Adobe Firefly', /firefly/i],
  ['Google Imagen / Gemini', /imagen|gemini|google ai|synthid/i],
  ['Microsoft Designer / Bing', /bing image creator|microsoft designer/i],
  ['Leonardo.ai', /leonardo\.ai/i],
  ['Ideogram', /ideogram/i],
  ['FLUX / Black Forest Labs', /black forest labs|\bflux[\s.-]?(1|dev|pro|schnell)/i],
  ['Recraft', /recraft/i],
  ['Krea', /krea\.ai/i],
  ['Grok / xAI', /\bgrok\b|\bx\.ai\b/i],
  ['Seedream / ByteDance', /seedream|dreamina/i],
  ['Runway', /runwayml|runway gen/i],
];
const EDITORS = [
  ['Adobe Photoshop', /photoshop/i], ['Adobe Lightroom', /lightroom/i], ['GIMP', /\bgimp\b/i],
  ['Affinity Photo', /affinity/i], ['Snapseed', /snapseed/i], ['Pixelmator', /pixelmator/i],
  ['Capture One', /capture one/i], ['Canva', /\bcanva\b/i], ['Figma', /\bfigma\b/i], ['Photopea', /photopea/i],
];
const AI_SOURCE = /digitalsourcetype\/(trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic)/i;
const CAPTURE_SOURCE = /digitalsourcetype\/(digitalCapture|computationalCapture|negativeFilm|positiveFilm|print)/i;

// Типичные размеры выхода генераторов (без учёта ориентации).
const GEN_SIZES = new Set(['512x512', '768x768', '1024x1024', '2048x2048', '832x1216', '896x1152', '768x1344', '640x1536', '1024x1536', '1024x1792', '1152x2048', '1344x768', '1536x640', '1216x832', '1152x896', '1792x1024', '1536x1024', '2048x1152', '1024x576', '1456x816', '1232x928', '1312x736', '1248x832', '1184x864', '1664x928', '1472x1104', '1584x1056', '1728x1296', '2016x1134']);

export async function inspectMetadata(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  let format = 'other'; let metaBytes = []; let dqt = []; let pngTexts = [];
  if (data[0] === 0xff && data[1] === 0xd8) { format = 'jpeg'; ({ meta: metaBytes, dqt } = jpegSegments(data)); }
  else if (data[0] === 0x89 && data[1] === 0x50) { format = 'png'; const r = await pngChunks(data); metaBytes = r.meta; pngTexts = r.texts; }
  else if (latin1(data.subarray(0, 4)) === 'RIFF' && latin1(data.subarray(8, 12)) === 'WEBP') { format = 'webp'; metaBytes = webpChunks(data).meta; }
  else if (/heic|heif|avif/.test(file.type)) { format = file.type.split('/')[1]; metaBytes = [data.subarray(0, Math.min(data.length, 512 * 1024))]; }

  const metaText = metaBytes.map(latin1).join('\n') + pngTexts.map((t) => `${t.key}: ${t.text}`).join('\n');

  let exif = null;
  try {
    const exifr = await import('exifr');
    exif = await (exifr.default || exifr).parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, ifd1: false, mergeOutput: true });
  } catch { exif = null; }

  return {
    format, size: data.length, metaText, pngTexts, exif: exif || {},
    jpeg: format === 'jpeg' ? jpegQuality(dqt) : null,
    hasC2PA: /jumb/.test(metaText) && /c2pa/i.test(metaText),
  };
}

// ---------- ELA: карта ошибок повторного сжатия ----------

export async function elaMap(img, quality = 0.9, gain = 18) {
  const maxSide = 1400;
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s)); const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const orig = ctx.getImageData(0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  const bmp = await createImageBitmap(blob);
  ctx.drawImage(bmp, 0, 0);
  const re = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < out.data.length; i += 4) {
    const d = Math.max(Math.abs(orig.data[i] - re.data[i]), Math.abs(orig.data[i + 1] - re.data[i + 1]), Math.abs(orig.data[i + 2] - re.data[i + 2]));
    const v = Math.min(255, d * gain);
    // Тепловая шкала: чёрный → фиолетовый → жёлтый.
    out.data[i] = Math.min(255, v * 1.6); out.data[i + 1] = Math.max(0, v * 1.4 - 110); out.data[i + 2] = v < 128 ? v * 1.5 : Math.max(0, 380 - v * 1.4); out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL('image/png');
}

// ---------- Сборка улик ----------

export function buildEvidence({ meta, img, classifier }) {
  const ev = [];
  const W = img.naturalWidth; const H = img.naturalHeight;
  const e = meta.exif || {};
  const txt = meta.metaText || '';

  if (meta.hasC2PA || AI_SOURCE.test(txt) || CAPTURE_SOURCE.test(txt)) {
    if (AI_SOURCE.test(txt)) ev.push({ id: 'c2paAi', dir: 'ai', weight: 3, value: txt.match(AI_SOURCE)[1] });
    else if (CAPTURE_SOURCE.test(txt)) ev.push({ id: 'c2paCapture', dir: 'real', weight: 2, value: txt.match(CAPTURE_SOURCE)[1] });
    else ev.push({ id: 'c2paPresent', dir: 'neutral', weight: 0 });
  }

  const gens = GENERATORS.filter(([, re]) => re.test(txt)).map(([n]) => n);
  if (gens.length) ev.push({ id: 'generator', dir: 'ai', weight: 3, value: gens.join(', ') });
  const sdParams = meta.pngTexts.find((t) => /^(parameters|prompt|workflow|Dream|sd-metadata|invokeai_metadata)$/i.test(t.key));
  if (sdParams && !gens.length) ev.push({ id: 'generator', dir: 'ai', weight: 3, value: `PNG: ${sdParams.key}` });

  const make = e.Make; const model = e.Model;
  const exposure = e.ExposureTime || e.FNumber || e.ISO || e.FocalLength;
  if (make || model) {
    ev.push({ id: 'camera', dir: 'real', weight: exposure ? 1 : 0.5, value: [make, model, e.LensModel].filter(Boolean).join(' · ') });
  }

  const software = [e.Software, e.CreatorTool, e.HistorySoftwareAgent].flat().filter(Boolean).join(' ');
  const editors = EDITORS.filter(([, re]) => re.test(software) || re.test(txt)).map(([n]) => n);
  if (editors.length || software) ev.push({ id: 'software', dir: 'neutral', weight: 0, value: editors.length ? editors.join(', ') : software.slice(0, 80) });

  const inconsist = [];
  const dOrig = e.DateTimeOriginal instanceof Date ? e.DateTimeOriginal : null;
  const dMod = e.ModifyDate instanceof Date ? e.ModifyDate : null;
  if (dOrig && dMod && Math.abs(dMod - dOrig) > 86400000) inconsist.push('dates');
  const ew = e.ExifImageWidth || e.ImageWidth; const eh = e.ExifImageHeight || e.ImageHeight;
  if (ew && eh && !((ew === W && eh === H) || (ew === H && eh === W))) inconsist.push('dims');
  if ((make || model) && !exposure) inconsist.push('noExposure');
  if (inconsist.length) ev.push({ id: 'inconsistent', dir: 'neutral', weight: 0, value: inconsist });

  const key = `${Math.max(W, H) === W ? W : H}x${Math.max(W, H) === W ? H : W}`;
  const key2 = `${W}x${H}`;
  if (GEN_SIZES.has(key) || GEN_SIZES.has(key2) || GEN_SIZES.has(`${H}x${W}`)) ev.push({ id: 'genSize', dir: 'ai', weight: 0.5, value: `${W}×${H}` });
  else if (W % 64 === 0 && H % 64 === 0 && Math.max(W, H) <= 2048) ev.push({ id: 'mult64', dir: 'ai', weight: 0.25, value: `${W}×${H}` });

  if (meta.jpeg) ev.push({ id: 'jpegQ', dir: 'neutral', weight: 0, value: meta.jpeg });

  if (!make && !model && !software && !meta.hasC2PA && !gens.length && !sdParams) ev.push({ id: 'noMeta', dir: 'neutral', weight: 0 });

  if (classifier && classifier.spread > 0.35) {
    // Ответы по фрагментам расходятся — мнение модели в счёт не идёт.
    ev.push({ id: 'classifierSpread', dir: 'neutral', weight: 0 });
  } else if (classifier) {
    const p = classifier.prob;
    if (p >= 0.85) ev.push({ id: 'classifier', dir: 'ai', weight: 1.5, value: 'strongAi' });
    else if (p >= 0.62) ev.push({ id: 'classifier', dir: 'ai', weight: 0.75, value: 'leanAi' });
    else if (p <= 0.15) ev.push({ id: 'classifier', dir: 'real', weight: 0.75, value: 'strongReal' });
    else if (p <= 0.38) ev.push({ id: 'classifier', dir: 'real', weight: 0.4, value: 'leanReal' });
    else ev.push({ id: 'classifier', dir: 'neutral', weight: 0, value: 'unsure' });
  }

  const ai = ev.filter((x) => x.dir === 'ai').reduce((s, x) => s + x.weight, 0);
  const real = ev.filter((x) => x.dir === 'real').reduce((s, x) => s + x.weight, 0);
  const net = ai - real * 0.8;
  const level = ai >= 3 || net >= 2.25 ? 'high' : net >= 1 ? 'medium' : 'low';
  return { evidence: ev, level };
}
