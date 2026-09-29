import hbWasmUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';

// Сабсеттинг шрифтов: HarfBuzz hb-subset (тот же движок, что у Google Fonts и
// fonttools-подобных пайплайнов) в WASM + сжатие WOFF2 (woff2-encoder, MIT).
// Вход: TTF/OTF/WOFF/WOFF2, выход: подмножество SFNT и WOFF2.

let hbP = null;
function hb() {
  if (!hbP) hbP = fetch(hbWasmUrl).then((r) => r.arrayBuffer()).then((b) => WebAssembly.instantiate(b, {})).then((m) => m.instance.exports).catch((e) => { hbP = null; throw e; });
  return hbP;
}

const tag = (u8) => String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);

async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// WOFF 1.0 → SFNT: таблицы сжаты zlib по отдельности.
async function woff1ToSfnt(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const flavor = dv.getUint32(4); const num = dv.getUint16(12);
  const tables = [];
  for (let i = 0; i < num; i += 1) {
    const o = 44 + i * 20;
    const t = { tag: dv.getUint32(o), off: dv.getUint32(o + 4), comp: dv.getUint32(o + 8), orig: dv.getUint32(o + 12), sum: dv.getUint32(o + 16) };
    const raw = u8.subarray(t.off, t.off + t.comp);
    t.data = t.comp < t.orig ? await inflate(raw) : raw; // eslint-disable-line no-await-in-loop
    tables.push(t);
  }
  let size = 12 + num * 16; tables.forEach((t) => { size += (t.data.length + 3) & ~3; });
  const out = new Uint8Array(size); const ov = new DataView(out.buffer);
  const es = Math.floor(Math.log2(num));
  ov.setUint32(0, flavor); ov.setUint16(4, num); ov.setUint16(6, 16 * 2 ** es); ov.setUint16(8, es); ov.setUint16(10, num * 16 - 16 * 2 ** es);
  let off = 12 + num * 16;
  tables.forEach((t, i) => {
    const r = 12 + i * 16; ov.setUint32(r, t.tag); ov.setUint32(r + 4, t.sum); ov.setUint32(r + 8, off); ov.setUint32(r + 12, t.data.length);
    out.set(t.data, off); off += (t.data.length + 3) & ~3;
  });
  return out;
}

export async function toSfnt(bytes) {
  const u8 = new Uint8Array(bytes);
  const t = tag(u8);
  if (t === 'wOF2') { const { decompress } = await import('woff2-encoder'); return decompress(u8); }
  if (t === 'wOFF') return woff1ToSfnt(u8);
  return u8;
}

// codepoints — Set<number>; keepFeatures — сохранить все OpenType-фичи (лигатуры, альтернативы);
// dropHinting — убрать хинтинг (заметно легче, на экранах с высоким DPI не нужен).
export async function subsetFont(sfnt, codepoints, { keepFeatures = true, dropHinting = false } = {}) {
  const ex = await hb();
  const heap = () => new Uint8Array(ex.memory.buffer);
  const ptr = ex.malloc(sfnt.byteLength); heap().set(sfnt, ptr);
  const blob = ex.hb_blob_create(ptr, sfnt.byteLength, 2, 0, 0);
  const face = ex.hb_face_create(blob, 0); ex.hb_blob_destroy(blob);
  const input = ex.hb_subset_input_create_or_fail();
  const us = ex.hb_subset_input_unicode_set(input);
  codepoints.forEach((cp) => ex.hb_set_add(us, cp));
  if (keepFeatures) { const lf = ex.hb_subset_input_set(input, 6); ex.hb_set_clear(lf); ex.hb_set_invert(lf); }
  if (dropHinting) ex.hb_subset_input_set_flags(input, 0x1);
  const sub = ex.hb_subset_or_fail(face, input);
  ex.hb_subset_input_destroy(input);
  if (!sub) { ex.hb_face_destroy(face); ex.free(ptr); throw new Error('hb-subset: не удалось выделить подмножество'); }
  const res = ex.hb_face_reference_blob(sub);
  const off = ex.hb_blob_get_data(res, 0); const len = ex.hb_blob_get_length(res);
  const out = heap().slice(off, off + len);
  ex.hb_blob_destroy(res); ex.hb_face_destroy(sub); ex.hb_face_destroy(face); ex.free(ptr);
  if (!len) throw new Error('Пустой результат — в шрифте нет ни одного из выбранных символов');
  return out;
}

export async function toWoff2(sfnt) { const { compress } = await import('woff2-encoder'); return compress(sfnt); }

// Компактная запись unicode-range из набора кодовых точек.
export function unicodeRange(cps) {
  const s = [...cps].sort((a, b) => a - b); const parts = []; let i = 0;
  while (i < s.length) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j += 1;
    const h = (n) => n.toString(16).toUpperCase();
    parts.push(i === j ? `U+${h(s[i])}` : `U+${h(s[i])}-${h(s[j])}`); i = j + 1;
  }
  return parts.join(', ');
}
