// ICO-контейнер с PNG-кадрами (поддерживается браузерами и Windows Vista+).
// frames: [{ size, data: Uint8Array PNG }]
export function buildIco(frames) {
  const head = 6 + frames.length * 16; const total = head + frames.reduce((s, f) => s + f.data.length, 0);
  const buf = new Uint8Array(total); const dv = new DataView(buf.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, frames.length, true);
  let off = head;
  frames.forEach((f, i) => {
    const e = 6 + i * 16;
    buf[e] = f.size >= 256 ? 0 : f.size; buf[e + 1] = f.size >= 256 ? 0 : f.size; buf[e + 2] = 0; buf[e + 3] = 0;
    dv.setUint16(e + 4, 1, true); dv.setUint16(e + 6, 32, true); dv.setUint32(e + 8, f.data.length, true); dv.setUint32(e + 12, off, true);
    buf.set(f.data, off); off += f.data.length;
  });
  return buf;
}

// Качественное уменьшение: шагами не больше ×2 (одним drawImage в 16 px браузер
// берёт лишь часть пикселей исходника — края «рвутся» и появляется муар).
export function downscaleSteps(src, w, h) {
  let cur = src; let cw = src.naturalWidth || src.width; let ch = src.naturalHeight || src.height;
  while (cw / 2 >= w && ch / 2 >= h) {
    const nw = Math.max(w, Math.round(cw / 2)); const nh = Math.max(h, Math.round(ch / 2));
    const c = document.createElement('canvas'); c.width = nw; c.height = nh;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, nw, nh);
    cur = c; cw = nw; ch = nh;
  }
  return cur;
}
