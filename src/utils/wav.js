// Общие аудио-хелперы: единый AudioContext, декодирование файла, кодирование WAV.

let sharedCtx = null;
export function getAudioCtx() {
  if (!sharedCtx) { const C = window.AudioContext || window.webkitAudioContext; sharedCtx = new C(); }
  return sharedCtx;
}

export async function decodeAudioFile(file) {
  const ab = await file.arrayBuffer();
  return getAudioCtx().decodeAudioData(ab.slice(0));
}

export function encodeWAV(buffer) {
  const nc = buffer.numberOfChannels; const sr = buffer.sampleRate; const len = buffer.length;
  const dataSize = len * nc * 2; const ab = new ArrayBuffer(44 + dataSize); const dv = new DataView(ab);
  let p = 0;
  const wS = (s) => { for (let i = 0; i < s.length; i += 1) { dv.setUint8(p, s.charCodeAt(i)); p += 1; } };
  const w32 = (v) => { dv.setUint32(p, v, true); p += 4; };
  const w16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  wS('RIFF'); w32(36 + dataSize); wS('WAVE'); wS('fmt '); w32(16); w16(1); w16(nc); w32(sr); w32(sr * nc * 2); w16(nc * 2); w16(16); wS('data'); w32(dataSize);
  const ch = []; for (let c = 0; c < nc; c += 1) ch.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i += 1) for (let c = 0; c < nc; c += 1) { const s = Math.max(-1, Math.min(1, ch[c][i])); dv.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
