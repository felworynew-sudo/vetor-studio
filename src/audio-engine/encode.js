// Кодирование результата: WAV 16 бит (с TPDF-дизерингом), WAV 24 бит, MP3.

export function encodeWav(chans, sr, bits = 24) {
  const nc = chans.length; const len = chans[0].length; const bps = bits / 8;
  const dataSize = len * nc * bps;
  const ab = new ArrayBuffer(44 + dataSize); const dv = new DataView(ab);
  let p = 0;
  const wS = (s) => { for (let i = 0; i < s.length; i += 1) { dv.setUint8(p, s.charCodeAt(i)); p += 1; } };
  const w32 = (v) => { dv.setUint32(p, v, true); p += 4; };
  const w16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  wS('RIFF'); w32(36 + dataSize); wS('WAVE'); wS('fmt '); w32(16); w16(1); w16(nc);
  w32(sr); w32(sr * nc * bps); w16(nc * bps); w16(bits); wS('data'); w32(dataSize);
  const u8 = new Uint8Array(ab);
  if (bits === 16) {
    for (let i = 0; i < len; i += 1) {
      for (let c = 0; c < nc; c += 1) {
        const d = (Math.random() - Math.random()); // TPDF ±1 LSB
        let v = Math.round(chans[c][i] * 32767 + d);
        v = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
        dv.setInt16(p, v, true); p += 2;
      }
    }
  } else {
    for (let i = 0; i < len; i += 1) {
      for (let c = 0; c < nc; c += 1) {
        let v = Math.round(chans[c][i] * 8388607);
        v = v < -8388608 ? -8388608 : v > 8388607 ? 8388607 : v;
        u8[p] = v & 255; u8[p + 1] = (v >> 8) & 255; u8[p + 2] = (v >> 16) & 255; p += 3;
      }
    }
  }
  return ab;
}

export async function encodeMp3(chans, sr, kbps = 320) {
  const lame = await import('@breezystack/lamejs');
  const Mp3Encoder = lame.Mp3Encoder || (lame.default && lame.default.Mp3Encoder);
  const nc = Math.min(2, chans.length);
  const enc = new Mp3Encoder(nc, sr, kbps);
  const toInt16 = (f) => {
    const o = new Int16Array(f.length);
    for (let i = 0; i < f.length; i += 1) { const s = Math.max(-1, Math.min(1, f[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    return o;
  };
  const L = toInt16(chans[0]); const R = nc > 1 ? toInt16(chans[1]) : null;
  const parts = []; let total = 0;
  for (let i = 0; i < L.length; i += 1152) {
    const m = R ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)) : enc.encodeBuffer(L.subarray(i, i + 1152));
    if (m.length) { parts.push(new Uint8Array(m)); total += m.length; }
  }
  const end = enc.flush(); if (end.length) { parts.push(new Uint8Array(end)); total += end.length; }
  const out = new Uint8Array(total); let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out.buffer;
}
