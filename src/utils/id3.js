// Чтение/запись ID3-тегов MP3 (title/artist/album/year/comment) и полная
// очистка. Пишем ID3v2.3 в UTF-16 (корректная кириллица). Всё локально.

const td = (label) => new TextDecoder(label);
const enc8 = new TextEncoder();

function synchsafe(n) { return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]; }
function unsynchsafe(b0, b1, b2, b3) { return (b0 << 21) | (b1 << 14) | (b2 << 7) | b3; }

function decodeFrameText(bytes) {
  if (!bytes.length) return '';
  const enc = bytes[0]; const body = bytes.subarray(1);
  try {
    if (enc === 0) return td('latin1').decode(body).replace(/\0+$/, '');
    if (enc === 1) return td('utf-16').decode(body).replace(/\0+$/, '');
    if (enc === 2) return td('utf-16be').decode(body).replace(/\0+$/, '');
    return td('utf-8').decode(body).replace(/\0+$/, '');
  } catch { return ''; }
}

export function parseID3(data) {
  const ascii = (a, b) => String.fromCharCode(...data.subarray(a, b));
  if (ascii(0, 3) !== 'ID3') return { tagEnd: 0, fields: {} };
  const ver = data[3];
  const size = unsynchsafe(data[6], data[7], data[8], data[9]);
  const tagEnd = 10 + size;
  const fields = {};
  const map = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TYER: 'year', TDRC: 'year' };
  let pos = 10;
  while (pos + 10 <= tagEnd) {
    const id = ascii(pos, pos + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fsize = ver === 4
      ? unsynchsafe(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7])
      : ((data[pos + 4] << 24 | data[pos + 5] << 16 | data[pos + 6] << 8 | data[pos + 7]) >>> 0);
    const body = data.subarray(pos + 10, pos + 10 + fsize);
    if (map[id] && !fields[map[id]]) fields[map[id]] = decodeFrameText(body);
    else if (id === 'COMM' && !fields.comment) {
      // enc(1) + lang(3) + shortdesc(null-term) + text
      const enc = body[0]; let i = 4;
      if (enc === 1 || enc === 2) { while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2; i += 2; }
      else { while (i < body.length && body[i] !== 0) i += 1; i += 1; }
      fields.comment = decodeFrameText(new Uint8Array([enc, ...body.subarray(i)]));
    }
    pos += 10 + fsize;
  }
  return { tagEnd, fields };
}

function utf16leBom(str) {
  const bytes = [0xff, 0xfe];
  for (const ch of str) { const code = ch.codePointAt(0); if (code > 0xffff) { bytes.push(0xff, 0xfd); } else { bytes.push(code & 0xff, (code >> 8) & 0xff); } }
  bytes.push(0, 0);
  return bytes;
}

function textFrame(id, str) {
  const payload = [0x01, ...utf16leBom(str)]; // enc=1 UTF-16
  const size = payload.length;
  return [...enc8.encode(id), (size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff, 0, 0, ...payload];
}
function commFrame(str) {
  const payload = [0x01, 0x65, 0x6e, 0x67, 0xff, 0xfe, 0, 0, ...utf16leBom(str)]; // enc + 'eng' + empty desc + text
  const size = payload.length;
  return [0x43, 0x4f, 0x4d, 0x4d, (size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff, 0, 0, ...payload];
}

// Убираем ID3v1 (128 байт 'TAG' в конце), если есть.
function audioBody(data, tagEnd) {
  let end = data.length;
  if (end >= 128 && String.fromCharCode(data[end - 128], data[end - 127], data[end - 126]) === 'TAG') end -= 128;
  return data.subarray(tagEnd, end);
}

export function buildMp3(data, fields, { strip = false } = {}) {
  const { tagEnd } = parseID3(data);
  const body = audioBody(data, tagEnd);
  if (strip) {
    const out = new Uint8Array(body.length); out.set(body, 0); return out;
  }
  const frames = [];
  if (fields.title) frames.push(...textFrame('TIT2', fields.title));
  if (fields.artist) frames.push(...textFrame('TPE1', fields.artist));
  if (fields.album) frames.push(...textFrame('TALB', fields.album));
  if (fields.year) frames.push(...textFrame('TYER', fields.year));
  if (fields.comment) frames.push(...commFrame(fields.comment));
  const size = frames.length;
  const header = [0x49, 0x44, 0x33, 3, 0, 0, ...synchsafe(size)];
  const out = new Uint8Array(header.length + size + body.length);
  out.set(header, 0); out.set(frames, header.length); out.set(body, header.length + size);
  return out;
}
