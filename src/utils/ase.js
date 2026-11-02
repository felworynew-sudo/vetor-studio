// Adobe Swatch Exchange (.ase): палитра для Photoshop, Illustrator, InDesign и
// Figma-плагинов. Все числа big-endian, имена — UTF-16BE с нулём в конце.
// groups: [{ name, colors: [{ name, hex }] }]

function nameBytes(name) {
  const s = `${name}\0`; const b = new Uint8Array(2 + s.length * 2); const dv = new DataView(b.buffer);
  dv.setUint16(0, s.length);
  for (let i = 0; i < s.length; i += 1) dv.setUint16(2 + i * 2, s.charCodeAt(i));
  return b;
}

function block(type, body) {
  const b = new Uint8Array(6 + body.length); const dv = new DataView(b.buffer);
  dv.setUint16(0, type); dv.setUint32(2, body.length); b.set(body, 6);
  return b;
}

function colorBody(name, hex) {
  const n = nameBytes(name); const b = new Uint8Array(n.length + 4 + 12 + 2); const dv = new DataView(b.buffer);
  b.set(n, 0); let o = n.length;
  b.set([0x52, 0x47, 0x42, 0x20], o); o += 4; // 'RGB '
  const h = hex.replace('#', '');
  [0, 2, 4].forEach((i) => { dv.setFloat32(o, parseInt(h.slice(i, i + 2), 16) / 255); o += 4; });
  dv.setUint16(o, 2); // обычный (не глобальный и не плашечный) цвет
  return b;
}

export function buildAse(groups) {
  const blocks = [];
  groups.forEach((g) => {
    blocks.push(block(0xc001, nameBytes(g.name)));
    g.colors.forEach((c) => blocks.push(block(0x0001, colorBody(c.name, c.hex))));
    blocks.push(block(0xc002, new Uint8Array(0)));
  });
  const head = new Uint8Array(12); const dv = new DataView(head.buffer);
  head.set([0x41, 0x53, 0x45, 0x46]); dv.setUint16(4, 1); dv.setUint16(6, 0); dv.setUint32(8, blocks.length);
  const out = new Uint8Array(12 + blocks.reduce((s, b) => s + b.length, 0)); out.set(head, 0);
  let o = 12; blocks.forEach((b) => { out.set(b, o); o += b.length; });
  return out;
}
