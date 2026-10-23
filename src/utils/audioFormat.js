// Общий слой «импорт и экспорт в исходном формате» для аудио-инструментов:
//  • probeAudio — что за файл (формат, частота, битрейт, битность), по тегам файла (music-metadata)
//    с запасным вариантом по расширению;
//  • decodeNative — декод с родной частотой файла (без тихого пересчёта в 48 кГц);
//  • encodeLike — кодирование обратно в тот же формат: WAV той же битности (16/24/32f),
//    MP3 с ближайшим стандартным битрейтом, FLAC/OGG/Opus/AAC через FFmpeg.
// Чистые функции (идентификация по имени, подбор битрейта, описание) тестируются в Node.

import { encodeMp3 as encodeMp3Raw, encodeWav } from '../audio-engine/encode.js';

const EXT_TO_ID = {
  mp3: 'mp3', mpga: 'mp3', wav: 'wav', wave: 'wav', flac: 'flac', ogg: 'ogg', oga: 'ogg', opus: 'opus', m4a: 'aac', aac: 'aac', mp4: 'aac', webm: 'opus', weba: 'opus',
};
const MIME_TO_ID = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/mp4': 'aac', 'audio/x-m4a': 'aac', 'audio/aac': 'aac', 'audio/webm': 'opus',
};

export const FORMAT_INFO = {
  mp3: { label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', lossy: true, rates: [64, 96, 112, 128, 160, 192, 224, 256, 320] },
  wav: { label: 'WAV', ext: 'wav', mime: 'audio/wav', lossy: false, rates: [] },
  flac: { label: 'FLAC', ext: 'flac', mime: 'audio/flac', lossy: false, rates: [] },
  ogg: { label: 'OGG Vorbis', ext: 'ogg', mime: 'audio/ogg', lossy: true, rates: [64, 96, 128, 160, 192, 256, 320], ff: ['-c:a', 'libvorbis'] },
  opus: { label: 'Opus', ext: 'opus', mime: 'audio/ogg', lossy: true, rates: [48, 64, 96, 128, 160, 192, 256], ff: ['-c:a', 'libopus'] },
  aac: { label: 'AAC (M4A)', ext: 'm4a', mime: 'audio/mp4', lossy: true, rates: [64, 96, 128, 160, 192, 256, 320], ff: ['-c:a', 'aac'] },
};

export const nearest = (list, v) => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0]);

// Формат по имени/MIME (запасной путь, когда теги не прочитались).
export function guessFormatId(name = '', mime = '') {
  const ext = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return EXT_TO_ID[ext] || MIME_TO_ID[String(mime).toLowerCase().split(';')[0]] || 'other';
}

// Формат по контейнеру/кодеку из music-metadata.
export function idFromMeta(container = '', codec = '', fallback = 'other') {
  const s = `${container} ${codec}`.toLowerCase();
  if (/flac/.test(s)) return 'flac';
  if (/opus/.test(s)) return 'opus';
  if (/vorbis|ogg/.test(s)) return 'ogg';
  if (/wave|wav|pcm|riff/.test(s) && !/mpeg/.test(s)) return 'wav';
  if (/mpeg/.test(s) && /layer 3|mp3|layer3/.test(s)) return 'mp3';
  if (/mpeg/.test(s) && !/mpeg-4|mp4/.test(s)) return 'mp3';
  if (/aac|mp4|m4a|alac/.test(s)) return 'aac';
  return fallback;
}

// Битрейт «как у исходника»: ближайший стандартный; нет данных — по размеру файла и длительности.
export function pickBitrate(id, probeKbps, size, durationSec) {
  const rates = FORMAT_INFO[id]?.rates || [];
  if (!rates.length) return 0;
  let kbps = probeKbps;
  if (!(kbps > 0) && size > 0 && durationSec > 0) kbps = (size * 8) / 1000 / durationSec;
  if (!(kbps > 0)) kbps = id === 'opus' ? 128 : 192;
  return nearest(rates, kbps);
}

export function describeSource(p) {
  if (!p) return '';
  const info = FORMAT_INFO[p.id];
  const parts = [info ? info.label : (p.ext || '?').toUpperCase()];
  if (p.id === 'wav' || p.id === 'flac') { if (p.bits) parts.push(p.float ? '32 float' : `${p.bits} бит`); } else if (p.bitrate) parts.push(`${Math.round(p.bitrate)} кбит/с`);
  if (p.sampleRate) parts.push(`${Math.round(p.sampleRate / 100) / 10} кГц`);
  if (p.channels) parts.push(p.channels === 1 ? 'моно' : p.channels === 2 ? 'стерео' : `${p.channels} кан.`);
  return parts.join(' · ');
}

export async function probeAudio(file) {
  const base = { size: file.size, id: guessFormatId(file.name, file.type), ext: (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase(), sampleRate: null, channels: null, bitrate: null, bits: null, float: false, lossless: false };
  try {
    const mm = await import('music-metadata');
    const meta = await mm.parseBlob(file, { duration: false, skipCovers: true });
    const f = meta.format;
    const id = idFromMeta(f.container, f.codec, base.id);
    return {
      ...base,
      id,
      sampleRate: f.sampleRate >= 8000 && f.sampleRate <= 192000 ? f.sampleRate : null,
      channels: f.numberOfChannels || null,
      bitrate: f.bitrate ? f.bitrate / 1000 : null,
      bits: f.bitsPerSample || null,
      float: /float/i.test(f.codec || ''),
      lossless: !!f.lossless,
    };
  } catch {
    return base;
  }
}

// Декод с родной частотой файла: OfflineAudioContext нужной частоты не пересчитывает в 48 кГц.
export async function decodeNative(file, probe, fallbackCtx) {
  const data = await file.arrayBuffer();
  const sr = probe?.sampleRate;
  let ctx = null;
  try { if (sr && typeof OfflineAudioContext !== 'undefined') ctx = new OfflineAudioContext(1, 1, sr); } catch { ctx = null; }
  return (ctx || fallbackCtx).decodeAudioData(data.slice(0));
}

function wavFloat32(chans, sr) {
  const nc = chans.length; const len = chans[0].length; const dataSize = len * nc * 4;
  const ab = new ArrayBuffer(44 + dataSize); const dv = new DataView(ab); let p = 0;
  const wS = (s) => { for (let i = 0; i < s.length; i += 1) { dv.setUint8(p, s.charCodeAt(i)); p += 1; } };
  const w32 = (v) => { dv.setUint32(p, v, true); p += 4; }; const w16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  wS('RIFF'); w32(36 + dataSize); wS('WAVE'); wS('fmt '); w32(16); w16(3); w16(nc); w32(sr); w32(sr * nc * 4); w16(nc * 4); w16(32); wS('data'); w32(dataSize);
  for (let i = 0; i < len; i += 1) for (let c = 0; c < nc; c += 1) { dv.setFloat32(p, chans[c][i], true); p += 4; }
  return ab;
}

// Целевой формат «как исходный»: для неизвестного — WAV 24 бит (без потерь).
export function resolveTarget(target, probe) {
  const id = target === 'source' || !target ? (FORMAT_INFO[probe?.id] ? probe.id : 'wav') : target;
  const fromSource = (target === 'source' || !target) && FORMAT_INFO[probe?.id];
  return { id, fromSource: !!fromSource };
}

// buf: { numberOfChannels, sampleRate, length, getChannelData } либо { chans, sr }.
// opts: { target: 'source'|id, bitrate, onProgress, ffmpegRun }
export async function encodeLike(buf, probe, opts = {}) {
  const chans = buf.chans || Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const sr = buf.sr || buf.sampleRate;
  const { id, fromSource } = resolveTarget(opts.target, probe);
  const info = FORMAT_INFO[id];
  const duration = chans[0].length / sr;
  const kbps = opts.bitrate || (fromSource || probe?.id === id ? pickBitrate(id, probe?.bitrate, probe?.size, duration) : pickBitrate(id, 0, 0, 0));
  const bits = fromSource || probe?.id === id ? (probe?.float || probe?.bits >= 32 ? 32 : probe?.bits >= 24 ? 24 : 16) : 24;
  const done = (data, extra = {}) => ({ blob: new Blob([data], { type: info.mime }), ext: info.ext, mime: info.mime, id, label: info.label, bitrate: kbps || null, bits: id === 'wav' || id === 'flac' ? bits : null, ...extra });

  if (id === 'wav') return done(bits === 32 ? wavFloat32(chans, sr) : encodeWav(chans, sr, bits));
  if (id === 'mp3') return done(await encodeMp3Raw(chans, sr, kbps || 192));
  const run = opts.ffmpegRun || (await import('./ffmpeg')).ffmpegRun;
  const wav = new File([encodeWav(chans, sr, 24)], 'part.wav', { type: 'audio/wav' });
  const args = id === 'flac'
    ? ['-vn', '-c:a', 'flac', '-sample_fmt', bits > 16 ? 's32' : 's16']
    : ['-vn', ...info.ff, '-b:a', `${kbps}k`];
  const out = await run(wav, args, `out.${info.ext}`, { onProgress: opts.onProgress });
  return done(out);
}

// «имя-eq.mp3» из «имя.wav» и нового суффикса.
export function outputName(fileName, suffix, ext) {
  const base = String(fileName || 'audio').replace(/\.[^.]+$/, '');
  return `${base}${suffix ? `-${suffix}` : ''}.${ext}`;
}

// Варианты для выбора формата в интерфейсе: «Как исходный (…)» первым.
export function formatChoices(probe, lang = 'ru') {
  const src = probe && FORMAT_INFO[probe.id] ? probe : null;
  const head = { id: 'source', label: src ? `${lang === 'en' ? 'Same as source' : 'Как исходный'} (${FORMAT_INFO[src.id].label})` : (lang === 'en' ? 'Same as source' : 'Как исходный') };
  return [head, ...['wav', 'flac', 'mp3', 'aac', 'opus', 'ogg'].map((id) => ({ id, label: FORMAT_INFO[id].label.replace(' (M4A)', '') }))];
}

// Предупреждение, если исходник сжатый, а экспорт тоже сжатый (повторное кодирование).
export function recompressNote(probe, targetId, lang = 'ru') {
  const { id } = resolveTarget(targetId, probe);
  if (!probe || !FORMAT_INFO[probe.id]?.lossy || !FORMAT_INFO[id]?.lossy) return '';
  return lang === 'en'
    ? `The source is lossy (${FORMAT_INFO[probe.id].label}); exporting to ${FORMAT_INFO[id].label} re-encodes it with a small quality loss. Pick WAV or FLAC to keep everything.`
    : `Исходник сжатый (${FORMAT_INFO[probe.id].label}): при экспорте в ${FORMAT_INFO[id].label} звук кодируется повторно, качество чуть снижается. Чтобы ничего не потерять, выберите WAV или FLAC.`;
}
