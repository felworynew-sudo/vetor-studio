// Разбор и удаление метаданных изображений БЕЗ перекодирования пикселей.
// Именно здесь живут AI-метки (C2PA/JUMBF в JPEG APP11, XMP-текст в PNG iTXt),
// EXIF, GPS, IPTC. Возвращает список найденного и очищенный файл.

const dec = (bytes) => { try { return new TextDecoder().decode(bytes); } catch { return ''; } };

function classifyJpegApp(marker, payload) {
  const head = dec(payload.subarray(0, 30));
  if (marker === 0xe1) { if (head.startsWith('Exif')) return 'EXIF'; if (/ns\.adobe\.com\/xap/.test(head)) return 'XMP'; return 'APP1'; }
  if (marker === 0xe2 && head.startsWith('ICC_PROFILE')) return 'ICC';
  if (marker === 0xeb) return 'C2PA'; // APP11 JUMBF — метки происхождения/ИИ
  if (marker === 0xed && /Photoshop/.test(head)) return 'IPTC';
  if (marker === 0xee && head.startsWith('Adobe')) return 'Adobe';
  if (marker === 0xfe) return 'Comment';
  return null;
}

function stripJpeg(data) {
  const found = [];
  const keep = [];
  keep.push(data.subarray(0, 2)); // SOI
  let pos = 2;
  // По умолчанию режем EXIF/XMP/C2PA/IPTC/Comment; ICC (цвет) оставляем.
  const stripTypes = new Set(['EXIF', 'XMP', 'C2PA', 'IPTC', 'Comment', 'APP1']);
  while (pos + 4 <= data.length) {
    if (data[pos] !== 0xff) break;
    const marker = data[pos + 1];
    if (marker === 0xda) { keep.push(data.subarray(pos)); pos = data.length; break; } // SOS → до конца
    const len = (data[pos + 2] << 8) | data[pos + 3];
    const seg = data.subarray(pos, pos + 2 + len);
    const type = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe ? classifyJpegApp(marker, seg.subarray(4)) : null;
    if (type && stripTypes.has(type)) found.push({ type, size: seg.length });
    else keep.push(seg);
    pos += 2 + len;
  }
  const total = keep.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total); let o = 0;
  keep.forEach((a) => { out.set(a, o); o += a.length; });
  return { found, clean: out };
}

function stripPng(data) {
  const found = [];
  const keep = [data.subarray(0, 8)]; // сигнатура
  const stripTypes = { tEXt: 'Текст', iTXt: 'XMP/текст', zTXt: 'Текст', eXIf: 'EXIF', tIME: 'Дата', iCCP: null };
  let pos = 8;
  while (pos + 8 <= data.length) {
    const len = (data[pos] << 24 | data[pos + 1] << 16 | data[pos + 2] << 8 | data[pos + 3]) >>> 0;
    const type = dec(data.subarray(pos + 4, pos + 8));
    const chunk = data.subarray(pos, pos + 12 + len);
    if (Object.prototype.hasOwnProperty.call(stripTypes, type) && stripTypes[type]) {
      // C2PA в PNG кладут в iTXt/caBX; помечаем текстовые как возможные AI-метки.
      const label = type === 'iTXt' ? 'XMP/C2PA' : stripTypes[type];
      found.push({ type: label, size: chunk.length });
    } else {
      keep.push(chunk);
    }
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  const total = keep.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total); let o = 0;
  keep.forEach((a) => { out.set(a, o); o += a.length; });
  return { found, clean: out };
}

// WebP — контейнер RIFF: заголовок 'RIFF'<size>'WEBP', далее чанки FourCC+size(LE).
// Метаданные лежат в чанках 'EXIF' и 'XMP ' (C2PA пишут в XMP). ICCP (цвет) — оставляем.
function stripWebp(data) {
  const found = [];
  const chunks = [];
  let pos = 12;
  while (pos + 8 <= data.length) {
    const cc = dec(data.subarray(pos, pos + 4));
    const size = (data[pos + 4] | (data[pos + 5] << 8) | (data[pos + 6] << 16) | (data[pos + 7] << 24)) >>> 0;
    const padded = size + (size & 1); // чанки выровнены по чётности
    const end = Math.min(data.length, pos + 8 + padded);
    chunks.push({ cc, bytes: data.subarray(pos, end) });
    pos = end;
  }
  const kept = [];
  let vp8xIndex = -1;
  chunks.forEach((c) => {
    if (c.cc === 'EXIF') { found.push({ type: 'EXIF', size: c.bytes.length }); return; }
    if (c.cc === 'XMP ') { found.push({ type: 'XMP/C2PA', size: c.bytes.length }); return; }
    if (c.cc === 'VP8X') vp8xIndex = kept.length;
    kept.push(c.bytes);
  });
  const bodyLen = kept.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(12 + bodyLen);
  out.set(data.subarray(0, 12), 0);
  let o = 12;
  kept.forEach((a) => { out.set(a, o); o += a.length; });
  if (vp8xIndex >= 0) {
    let s = 12;
    for (let i = 0; i < vp8xIndex; i += 1) s += kept[i].length;
    out[s + 8] &= ~0x0c; // сбрасываем флаги EXIF(0x08) и XMP(0x04) в VP8X
  }
  const riff = out.length - 8;
  out[4] = riff & 0xff; out[5] = (riff >> 8) & 0xff; out[6] = (riff >> 16) & 0xff; out[7] = (riff >> 24) & 0xff;
  return { found, clean: out };
}

export function cleanImageMetadata(arrayBuffer, mime) {
  const data = new Uint8Array(arrayBuffer);
  if (data[0] === 0xff && data[1] === 0xd8) return { ...stripJpeg(data), format: 'jpeg', ext: 'jpg', mime: 'image/jpeg' };
  if (data[0] === 0x89 && data[1] === 0x50) return { ...stripPng(data), format: 'png', ext: 'png', mime: 'image/png' };
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && dec(data.subarray(8, 12)) === 'WEBP') {
    return { ...stripWebp(data), format: 'webp', ext: 'webp', mime: 'image/webp' };
  }
  return null; // не поддержан — вызвать re-encode fallback
}
