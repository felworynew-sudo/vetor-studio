// Разбор и выборочное удаление метаданных изображений БЕЗ перекодирования пикселей.
// Категории: EXIF, GPS (только координаты внутри EXIF), XMP, C2PA (JUMBF: JPEG APP11,
// PNG caBX, WebP C2PA), IPTC, Comment, Text (текстовые чанки PNG — там, например,
// параметры генерации Stable Diffusion/ComfyUI), ICC (цветовой профиль).
// found — всё распознанное (с флагом removed), clean — очищенный файл.

export const CATEGORIES = ['EXIF', 'GPS', 'XMP', 'C2PA', 'IPTC', 'Comment', 'Text', 'ICC'];
export const DEFAULT_REMOVE = ['EXIF', 'GPS', 'XMP', 'C2PA', 'IPTC', 'Comment', 'Text'];

const dec = (bytes) => { try { return new TextDecoder().decode(bytes); } catch { return ''; } };
const concat = (parts) => { const out = new Uint8Array(parts.reduce((s, a) => s + a.length, 0)); let o = 0; parts.forEach((a) => { out.set(a, o); o += a.length; }); return out; };

// Удаляет GPS из TIFF-структуры EXIF: стирает GPS IFD и его значения нулями и
// вычёркивает тег 0x8825 из IFD0. Меняет tiff на месте, возвращает true, если GPS был.
export function stripGpsTiff(tiff) {
  if (tiff.length < 8) return false;
  const le = tiff[0] === 0x49; const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o) => dv.getUint16(o, le); const u32 = (o) => dv.getUint32(o, le);
  const ifd0 = u32(4); if (ifd0 + 2 > tiff.length) return false;
  const n = u16(ifd0);
  for (let i = 0; i < n; i += 1) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > tiff.length || u16(e) !== 0x8825) continue;
    const gps = u32(e + 8);
    if (gps + 2 <= tiff.length) {
      const gn = u16(gps); const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };
      for (let j = 0; j < gn; j += 1) {
        const ge = gps + 2 + j * 12; if (ge + 12 > tiff.length) break;
        const bytes = (SZ[u16(ge + 2)] || 1) * u32(ge + 4);
        if (bytes > 4) { const off = u32(ge + 8); if (off + bytes <= tiff.length) tiff.fill(0, off, off + bytes); }
      }
      tiff.fill(0, gps, Math.min(tiff.length, gps + 2 + gn * 12 + 4));
    }
    // сдвигаем хвост IFD0 (записи после GPS + указатель next IFD) на 12 байт вверх
    const tail = ifd0 + 2 + n * 12 + 4;
    tiff.copyWithin(e, e + 12, tail); tiff.fill(0, tail - 12, tail);
    dv.setUint16(ifd0, n - 1, le);
    return true;
  }
  return false;
}

function classifyJpegApp(marker, payload) {
  const head = dec(payload.subarray(0, 40));
  if (marker === 0xe1) { if (head.startsWith('Exif')) return 'EXIF'; if (/ns\.adobe\.com\/(xap|xmp)/.test(head)) return 'XMP'; return 'XMP'; }
  if (marker === 0xe2 && head.startsWith('ICC_PROFILE')) return 'ICC';
  if (marker === 0xeb) return 'C2PA'; // APP11 JUMBF — метки происхождения/ИИ
  if (marker === 0xed && /Photoshop/.test(head)) return 'IPTC';
  if (marker === 0xfe) return 'Comment';
  return null; // JFIF, Adobe APP14 и прочее служебное — не трогаем
}

function hasGps(tiff) { const c = tiff.slice(); return stripGpsTiff(c); }

function stripJpeg(data, remove) {
  const found = []; const keep = [data.subarray(0, 2)];
  let pos = 2;
  while (pos + 4 <= data.length) {
    if (data[pos] !== 0xff) break;
    const marker = data[pos + 1];
    if (marker === 0xda) { keep.push(data.subarray(pos)); break; } // SOS → до конца
    const len = (data[pos + 2] << 8) | data[pos + 3];
    const seg = data.subarray(pos, pos + 2 + len);
    const type = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe ? classifyJpegApp(marker, seg.subarray(4)) : null;
    if (type === 'EXIF') {
      const tiff = seg.subarray(10); const gps = hasGps(tiff);
      if (remove.has('EXIF')) { found.push({ type, size: seg.length, removed: true }); if (gps) found.push({ type: 'GPS', size: 0, removed: true }); }
      else {
        found.push({ type, size: seg.length, removed: false });
        if (gps && remove.has('GPS')) { const copy = seg.slice(); stripGpsTiff(copy.subarray(10)); keep.push(copy); found.push({ type: 'GPS', size: 0, removed: true }); }
        else { if (gps) found.push({ type: 'GPS', size: 0, removed: false }); keep.push(seg); }
      }
    } else if (type) {
      const rm = remove.has(type); found.push({ type, size: seg.length, removed: rm }); if (!rm) keep.push(seg);
    } else keep.push(seg);
    pos += 2 + len;
  }
  return { found, clean: concat(keep) };
}

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function pngChunkType(type, body) {
  if (type === 'eXIf') return 'EXIF';
  if (type === 'caBX') return 'C2PA';
  if (type === 'iCCP') return 'ICC';
  if (type === 'iTXt' && dec(body.subarray(0, 17)) === 'XML:com.adobe.xmp') return 'XMP';
  if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt' || type === 'tIME') return 'Text';
  return null;
}

function stripPng(data, remove) {
  const found = []; const keep = [data.subarray(0, 8)];
  let pos = 8;
  while (pos + 8 <= data.length) {
    const len = (data[pos] << 24 | data[pos + 1] << 16 | data[pos + 2] << 8 | data[pos + 3]) >>> 0;
    const type = dec(data.subarray(pos + 4, pos + 8));
    const chunk = data.subarray(pos, pos + 12 + len); const body = chunk.subarray(8, 8 + len);
    const cat = pngChunkType(type, body);
    if (cat === 'EXIF') {
      const gps = hasGps(body);
      if (remove.has('EXIF')) { found.push({ type: cat, size: chunk.length, removed: true }); if (gps) found.push({ type: 'GPS', size: 0, removed: true }); }
      else if (gps && remove.has('GPS')) {
        const copy = chunk.slice(); stripGpsTiff(copy.subarray(8, 8 + len));
        new DataView(copy.buffer).setUint32(8 + len, crc32(copy.subarray(4, 8 + len)));
        keep.push(copy); found.push({ type: cat, size: chunk.length, removed: false }, { type: 'GPS', size: 0, removed: true });
      } else { keep.push(chunk); found.push({ type: cat, size: chunk.length, removed: false }); if (gps) found.push({ type: 'GPS', size: 0, removed: false }); }
    } else if (cat) {
      const rm = remove.has(cat); found.push({ type: cat, size: chunk.length, removed: rm }); if (!rm) keep.push(chunk);
    } else keep.push(chunk);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  return { found, clean: concat(keep) };
}

// WebP — RIFF: 'RIFF'<size>'WEBP', далее чанки FourCC+size(LE), выровненные по чётности.
function stripWebp(data, remove) {
  const found = []; const kept = []; let vp8x = -1; let flagsOff = 0;
  let pos = 12;
  while (pos + 8 <= data.length) {
    const cc = dec(data.subarray(pos, pos + 4));
    const size = (data[pos + 4] | (data[pos + 5] << 8) | (data[pos + 6] << 16) | (data[pos + 7] << 24)) >>> 0;
    const end = Math.min(data.length, pos + 8 + size + (size & 1));
    let bytes = data.subarray(pos, end);
    const cat = cc === 'EXIF' ? 'EXIF' : cc === 'XMP ' ? 'XMP' : cc === 'ICCP' ? 'ICC' : cc === 'C2PA' ? 'C2PA' : null;
    if (cat === 'EXIF') {
      const body = bytes.subarray(8, 8 + size); const off = dec(body.subarray(0, 4)) === 'Exif' ? 6 : 0; const gps = hasGps(body.subarray(off));
      if (remove.has('EXIF')) { found.push({ type: cat, size: bytes.length, removed: true }); if (gps) found.push({ type: 'GPS', size: 0, removed: true }); pos = end; continue; }
      if (gps && remove.has('GPS')) { bytes = bytes.slice(); stripGpsTiff(bytes.subarray(8 + off, 8 + size)); found.push({ type: 'GPS', size: 0, removed: true }); } else if (gps) found.push({ type: 'GPS', size: 0, removed: false });
      found.push({ type: cat, size: bytes.length, removed: false });
    } else if (cat) {
      const rm = remove.has(cat); found.push({ type: cat, size: bytes.length, removed: rm }); if (rm) { flagsOff |= cat === 'ICC' ? 0x20 : cat === 'XMP' ? 0x04 : 0; pos = end; continue; }
    }
    if (cc === 'VP8X') vp8x = kept.length;
    kept.push(bytes); pos = end;
  }
  if (remove.has('EXIF')) flagsOff |= 0x08;
  const out = concat([data.subarray(0, 12), ...kept]);
  if (vp8x >= 0) { let s = 12; for (let i = 0; i < vp8x; i += 1) s += kept[i].length; out[s + 8] &= ~flagsOff; }
  const riff = out.length - 8;
  out[4] = riff & 0xff; out[5] = (riff >> 8) & 0xff; out[6] = (riff >> 16) & 0xff; out[7] = (riff >> 24) & 0xff;
  return { found, clean: out };
}

export function cleanImageMetadata(arrayBuffer, removeList = DEFAULT_REMOVE) {
  const data = new Uint8Array(arrayBuffer); const remove = new Set(removeList);
  if (data[0] === 0xff && data[1] === 0xd8) return { ...stripJpeg(data, remove), format: 'jpeg', ext: 'jpg', mime: 'image/jpeg' };
  if (data[0] === 0x89 && data[1] === 0x50) return { ...stripPng(data, remove), format: 'png', ext: 'png', mime: 'image/png' };
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && dec(data.subarray(8, 12)) === 'WEBP') {
    return { ...stripWebp(data, remove), format: 'webp', ext: 'webp', mime: 'image/webp' };
  }
  return null; // не поддержан — вызвать re-encode fallback
}

// Текстовые чанки PNG (tEXt/iTXt/zTXt без сжатия) — ключ → текст. Там живут
// параметры генерации (SD «parameters», ComfyUI «prompt»/«workflow»).
export async function readPngText(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer); const out = [];
  if (!(data[0] === 0x89 && data[1] === 0x50)) return out;
  let pos = 8;
  while (pos + 8 <= data.length) {
    const len = (data[pos] << 24 | data[pos + 1] << 16 | data[pos + 2] << 8 | data[pos + 3]) >>> 0;
    const type = dec(data.subarray(pos + 4, pos + 8)); const body = data.subarray(pos + 8, pos + 8 + len);
    const z = body.indexOf(0);
    if (z > 0 && type === 'tEXt') out.push({ key: dec(body.subarray(0, z)), value: new TextDecoder('latin1').decode(body.subarray(z + 1)) });
    else if (z > 0 && type === 'zTXt') {
      try { const { unzlibSync } = await import('fflate'); out.push({ key: dec(body.subarray(0, z)), value: new TextDecoder('latin1').decode(unzlibSync(body.subarray(z + 2))) }); } catch { /* пропускаем */ }
    } else if (z > 0 && type === 'iTXt') {
      const key = dec(body.subarray(0, z)); const compressed = body[z + 1];
      let p = z + 3; const langEnd = body.indexOf(0, p); p = langEnd + 1; const trEnd = body.indexOf(0, p); p = trEnd + 1;
      let text = body.subarray(p);
      if (compressed) { try { const { unzlibSync } = await import('fflate'); text = unzlibSync(text); } catch { text = new Uint8Array(); } }
      if (key !== 'XML:com.adobe.xmp') out.push({ key, value: dec(text) });
    }
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}
