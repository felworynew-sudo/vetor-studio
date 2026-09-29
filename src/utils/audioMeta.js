// Метаданные аудио: чтение любых форматов через music-metadata (MIT: MP3, FLAC,
// M4A/AAC, OGG/Opus, WAV, AIFF, WMA, APE, WavPack…), запись ID3v2.3 для MP3 через
// browser-id3-writer (MIT) и через FFmpeg (-c copy, без перекодирования) — для остальных.

import { ffmpegRun } from './ffmpeg';
import { buildMp3 } from './id3';

export async function readMeta(file) {
  const mm = await import('music-metadata');
  return mm.parseBlob(file, { duration: true, skipCovers: false });
}

export const isMp3 = (file, meta) => /mpeg/i.test(meta?.format?.container || '') || /\.mp3$/i.test(file.name) || file.type === 'audio/mpeg';

export function pictureUrl(pic) {
  return URL.createObjectURL(new Blob([pic.data], { type: pic.format || 'image/jpeg' }));
}
export const pictureExt = (pic) => ((pic.format || '').split('/')[1] || 'jpg').replace('jpeg', 'jpg');

// Поля редактора ↔ общие теги music-metadata.
export function fieldsFrom(meta) {
  const c = meta.common || {};
  return {
    title: c.title || '', artist: (c.artists && c.artists.join('; ')) || c.artist || '', album: c.album || '', albumartist: c.albumartist || '',
    year: c.year ? String(c.year) : '', track: c.track?.no ? `${c.track.no}${c.track.of ? `/${c.track.of}` : ''}` : '',
    genre: (c.genre || []).join('; '), composer: (c.composer || []).join('; '), comment: (c.comment || []).map((x) => (typeof x === 'string' ? x : x.text)).filter(Boolean).join('\n'),
    lyrics: (c.lyrics || []).map((x) => (typeof x === 'string' ? x : x.text || (x.syncText || []).map((s) => s.text).join('\n'))).filter(Boolean).join('\n'),
  };
}

const split = (s) => s.split(/\s*;\s*/).filter(Boolean);

async function writeMp3(file, f, cover) {
  const { ID3Writer } = await import('browser-id3-writer');
  // Снимаем старые теги (v2 и v1), затем пишем новый ID3v2.3.
  const clean = buildMp3(new Uint8Array(await file.arrayBuffer()), {}, { strip: true });
  const w = new ID3Writer(clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.byteLength));
  if (f.title) w.setFrame('TIT2', f.title);
  if (f.artist) w.setFrame('TPE1', split(f.artist));
  if (f.album) w.setFrame('TALB', f.album);
  if (f.albumartist) w.setFrame('TPE2', f.albumartist);
  if (/^\d{4}$/.test(f.year)) w.setFrame('TYER', Number(f.year));
  if (f.track) w.setFrame('TRCK', f.track);
  if (f.genre) w.setFrame('TCON', split(f.genre));
  if (f.composer) w.setFrame('TCOM', split(f.composer));
  if (f.comment) w.setFrame('COMM', { description: '', text: f.comment, language: 'rus' });
  if (f.lyrics) w.setFrame('USLT', { description: '', lyrics: f.lyrics, language: 'rus' });
  if (cover) w.setFrame('APIC', { type: 3, data: cover.data, description: 'Cover' });
  w.addTag();
  return new Blob([w.arrayBuffer], { type: 'audio/mpeg' });
}

async function writeFfmpeg(file, f, strip) {
  const ext = (file.name.match(/\.([^.]+)$/) || [, 'm4a'])[1].toLowerCase();
  const args = ['-map', '0', '-c', 'copy', '-map_metadata', '-1'];
  if (!strip) {
    const tags = { title: f.title, artist: f.artist, album: f.album, album_artist: f.albumartist, date: f.year, track: f.track, genre: f.genre, composer: f.composer, comment: f.comment, lyrics: f.lyrics };
    Object.entries(tags).forEach(([k, v]) => { if (v) args.push('-metadata', `${k}=${v}`); });
  }
  const out = await ffmpegRun(file, args, `out.${ext}`);
  return new Blob([out], { type: file.type || 'application/octet-stream' });
}

// cover: undefined — оставить (только MP3), null — убрать, { data, format } — заменить.
export async function saveTags(file, meta, fields, { cover, strip = false } = {}) {
  if (isMp3(file, meta)) {
    if (strip) { const clean = buildMp3(new Uint8Array(await file.arrayBuffer()), {}, { strip: true }); return new Blob([clean], { type: 'audio/mpeg' }); }
    const keep = cover === undefined ? (meta.common.picture || [])[0] : cover;
    return writeMp3(file, fields, keep || null);
  }
  return writeFfmpeg(file, fields, strip);
}
