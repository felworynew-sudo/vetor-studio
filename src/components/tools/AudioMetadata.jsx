import { useRef, useState } from 'react';
import { fieldsFrom, isMp3, pictureExt, pictureUrl, readMeta, saveTags } from '../../utils/audioMeta';
import { downloadBlob } from '../../utils/wav';

// Метаданные и теги аудио: чтение любых форматов (music-metadata), техническая
// информация (кодек, битрейт, частота, lossless), все теги, обложка. Редактирование
// с обложкой и текстом песни: MP3 — ID3v2.3 мгновенно, остальные форматы — через
// FFmpeg без перекодирования. Полная очистка тегов. Всё локально.

const FIELDS = ['title', 'artist', 'album', 'albumartist', 'year', 'track', 'genre', 'composer', 'comment', 'lyrics'];

const TEXT = {
  ru: {
    drop: 'Загрузите аудиофайл', hint: 'MP3, FLAC, M4A, OGG, Opus, WAV, AIFF, WMA — звук не перекодируется',
    f: { title: 'Название', artist: 'Исполнитель (через ;)', album: 'Альбом', albumartist: 'Исполнитель альбома', year: 'Год', track: 'Трек (3/12)', genre: 'Жанр', composer: 'Композитор', comment: 'Комментарий', lyrics: 'Текст песни' },
    tech: 'Файл', cover: 'Обложка', coverAdd: 'Заменить обложку', coverRemove: 'Убрать обложку', coverDl: 'Скачать обложку', noCover: 'Обложки нет',
    save: 'Сохранить с тегами', strip: 'Убрать все теги', change: 'Другой файл', raw: 'Все теги как есть', saving: 'Сохраняю…',
    lossless: 'без потерь', lossy: 'с потерями', ffNote: 'Для этого формата запись идёт через FFmpeg (≈30 МБ, один раз); обложка сохраняется только в MP3.',
    note: 'Полная очистка убирает все теги, включая сторонние и ИИ-метки. Звук при сохранении не перекодируется.',
  },
  en: {
    drop: 'Upload an audio file', hint: 'MP3, FLAC, M4A, OGG, Opus, WAV, AIFF, WMA — audio is not re-encoded',
    f: { title: 'Title', artist: 'Artist (use ;)', album: 'Album', albumartist: 'Album artist', year: 'Year', track: 'Track (3/12)', genre: 'Genre', composer: 'Composer', comment: 'Comment', lyrics: 'Lyrics' },
    tech: 'File', cover: 'Cover', coverAdd: 'Replace cover', coverRemove: 'Remove cover', coverDl: 'Download cover', noCover: 'No cover',
    save: 'Save with tags', strip: 'Remove all tags', change: 'Another file', raw: 'All raw tags', saving: 'Saving…',
    lossless: 'lossless', lossy: 'lossy', ffNote: 'For this format tags are written with FFmpeg (≈30 MB, once); cover art is saved only in MP3.',
    note: 'Full clean removes all tags, including foreign and AI markers. Audio is not re-encoded on save.',
  },
};

const dur = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');

function AudioMetadata({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null); const coverInput = useRef(null);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(null);
  const [fields, setFields] = useState(null);
  const [cover, setCover] = useState(undefined); // undefined — как было
  const [coverUrl, setCoverUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function loadFile(f) {
    if (!f) return;
    setError(''); setBusy('…');
    try {
      const m = await readMeta(f);
      setFile(f); setMeta(m); setFields(fieldsFrom(m)); setCover(undefined);
      const pic = (m.common.picture || [])[0];
      setCoverUrl((p) => { if (p) URL.revokeObjectURL(p); return pic ? pictureUrl(pic) : ''; });
    } catch (e) { setError(String(e.message || e)); }
    setBusy('');
  }

  async function pickCover(f) {
    if (!f || !f.type.startsWith('image/')) return;
    const data = new Uint8Array(await f.arrayBuffer());
    setCover({ data, format: f.type });
    setCoverUrl((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f); });
  }

  async function save(strip) {
    setBusy(t.saving); setError('');
    try {
      const blob = await saveTags(file, meta, fields, { cover, strip });
      const base = file.name.replace(/\.[^.]+$/, ''); const ext = file.name.match(/\.[^.]+$/)?.[0] || '.mp3';
      downloadBlob(blob, `${base}${strip ? '-notags' : '-tagged'}${ext}`);
    } catch (e) { console.error(e); setError(String(e.message || e)); }
    setBusy('');
  }

  const fmt = meta?.format || {};
  const pic = cover === undefined ? (meta?.common.picture || [])[0] : cover;
  const mp3 = file && meta && isMp3(file, meta);

  return (
    <div className="tool-panel audio-metadata">
      {!meta ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{busy || t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            <div className="am-fields">
              {FIELDS.map((k) => (
                <label key={k} className={k === 'lyrics' || k === 'comment' ? 'am-field am-wide' : 'am-field'}>
                  <span className="tool-field-label">{t.f[k]}</span>
                  {k === 'lyrics' || k === 'comment'
                    ? <textarea className="pf-input" rows={k === 'lyrics' ? 5 : 2} value={fields[k]} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} />
                    : <input type="text" value={fields[k]} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} />}
                </label>
              ))}
            </div>
            {!mp3 && <p className="tool-local-note">ℹ️ {t.ffNote}</p>}
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={() => save(false)} disabled={!!busy}>{busy || t.save}</button>
              <button type="button" className="tool-btn" onClick={() => save(true)} disabled={!!busy}>🧹 {t.strip}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
            {meta.native && (
              <details className="aid-params">
                <summary>{t.raw}</summary>
                <pre>{Object.entries(meta.native).map(([type, tags]) => `[${type}]\n${tags.map((tg) => `${tg.id}: ${typeof tg.value === 'object' ? (tg.value?.data ? `<${tg.value.format || 'binary'} ${tg.value.data.length} B>` : JSON.stringify(tg.value).slice(0, 200)) : String(tg.value).slice(0, 300)}`).join('\n')}`).join('\n\n')}</pre>
              </details>
            )}
          </div>
          <div className="vz-controls">
            <div className="grade-group-title">{t.tech}</div>
            <div className="am-tech">
              <b>{file.name}</b>
              <span>{[fmt.container, fmt.codec].filter(Boolean).join(' · ')}</span>
              <span>{dur(fmt.duration)} · {fmt.bitrate ? `${Math.round(fmt.bitrate / 1000)} kbps` : ''} · {fmt.sampleRate ? `${fmt.sampleRate / 1000} kHz` : ''}{fmt.bitsPerSample ? ` · ${fmt.bitsPerSample}-bit` : ''} · {fmt.numberOfChannels === 1 ? 'mono' : fmt.numberOfChannels === 2 ? 'stereo' : `${fmt.numberOfChannels || '?'} ch`}</span>
              <span>{fmt.lossless ? t.lossless : t.lossy} · {(file.size / 1048576).toFixed(2)} MB</span>
            </div>
            <div className="grade-group-title">{t.cover}</div>
            {pic && coverUrl ? <img className="am-cover" src={coverUrl} alt="" /> : <p className="tool-local-note">{t.noCover}</p>}
            <div className="tool-actions">
              <button type="button" className="tool-btn small" onClick={() => coverInput.current?.click()}>{t.coverAdd}</button>
              {pic && <button type="button" className="tool-btn small" onClick={() => downloadBlob(new Blob([pic.data], { type: pic.format || 'image/jpeg' }), `${file.name.replace(/\.[^.]+$/, '')}-cover.${pictureExt(pic)}`)}>{t.coverDl}</button>}
              {pic && <button type="button" className="tool-btn small ghost" onClick={() => { setCover(null); setCoverUrl(''); }}>{t.coverRemove}</button>}
            </div>
          </div>
        </div>
      )}
      {error && <p className="color-invalid">{error}</p>}
      <input ref={inputRef} type="file" accept="audio/*,.mp3,.flac,.m4a,.ogg,.opus,.wav,.aif,.aiff,.wma,.ape,.wv" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <input ref={coverInput} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { pickCover(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default AudioMetadata;
