import { useRef, useState } from 'react';
import { parseID3, buildMp3 } from '../../utils/id3';

// Редактор метаданных аудио (ID3-теги MP3): просмотр, правка и полная очистка
// (в т.ч. любых сторонних/ИИ-меток в тегах). Локально, без перекодирования звука.

const TEXT = {
  ru: {
    drop: 'Загрузите MP3', hint: 'ID3-теги читаются и правятся локально, звук не перекодируется',
    title: 'Название', artist: 'Исполнитель', album: 'Альбом', year: 'Год', comment: 'Комментарий',
    save: 'Сохранить с тегами', strip: 'Убрать все теги', change: 'Другой файл',
    note: 'Полная очистка убирает все ID3-теги, включая посторонние и ИИ-метки в тегах.',
    onlyMp3: 'Поддерживается MP3 (ID3).',
  },
  en: {
    drop: 'Upload an MP3', hint: 'ID3 tags are read and edited locally, audio is not re-encoded',
    title: 'Title', artist: 'Artist', album: 'Album', year: 'Year', comment: 'Comment',
    save: 'Save with tags', strip: 'Remove all tags', change: 'Another file',
    note: 'Full clean removes all ID3 tags, including foreign and AI markers in the tags.',
    onlyMp3: 'MP3 (ID3) is supported.',
  },
};

function AudioMetadata({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const dataRef = useRef(null);
  const [name, setName] = useState('');
  const [fields, setFields] = useState(null);
  const [error, setError] = useState('');

  function loadFile(file) {
    if (!file) return;
    if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') { setError(t.onlyMp3); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      dataRef.current = data;
      const { fields: f } = parseID3(data);
      setFields({ title: f.title || '', artist: f.artist || '', album: f.album || '', year: f.year || '', comment: f.comment || '' });
      setName(file.name); setError('');
    };
    reader.readAsArrayBuffer(file);
  }

  function save(strip) {
    if (!dataRef.current) return;
    const out = buildMp3(dataRef.current, fields, { strip });
    const blob = new Blob([out], { type: 'audio/mpeg' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\.[^.]+$/, '')}${strip ? '-notags' : '-tagged'}.mp3`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  const set = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  return (
    <div className="tool-panel audio-metadata">
      {!fields ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="am-fields">
            {['title', 'artist', 'album', 'year', 'comment'].map((k) => (
              <label key={k} className="am-field">
                <span className="tool-field-label">{t[k]}</span>
                <input type="text" value={fields[k]} onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => save(false)}>{t.save}</button>
            <button type="button" className="tool-btn" onClick={() => save(true)}>🧹 {t.strip}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}
      {error && <p className="color-invalid">{error}</p>}
      <input ref={inputRef} type="file" accept=".mp3,audio/mpeg" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default AudioMetadata;
