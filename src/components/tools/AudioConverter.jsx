import { useCallback, useRef, useState } from 'react';
import { encodeWAV, encodeMp3, getAudioCtx, downloadBlob } from '../../utils/wav';

// Аудио-конвертер: принимает практически любой аудиофайл (браузер декодирует
// WAV/MP3/OGG/FLAC/M4A/AAC/Opus через decodeAudioData) и выдаёт WAV или MP3 с
// выбором битрейта. Пакетно, всё локально в браузере.

const TEXT = {
  ru: {
    drop: 'Перетащите аудио или нажмите — можно несколько', hint: 'WAV, MP3, OGG, FLAC, M4A, AAC — всё локально',
    format: 'Формат', quality: 'Битрейт', convertAll: 'Конвертировать все', add: 'Добавить', clear: 'Очистить',
    download: 'Скачать', converting: 'Конвертирую…', done: 'Готово', queued: 'В очереди', error: 'Ошибка декода',
    note: 'Файлы декодируются и кодируются на вашем устройстве — ничего не уходит на сервер.',
  },
  en: {
    drop: 'Drop audio or click — several at once', hint: 'WAV, MP3, OGG, FLAC, M4A, AAC — all local',
    format: 'Format', quality: 'Bitrate', convertAll: 'Convert all', add: 'Add', clear: 'Clear',
    download: 'Download', converting: 'Converting…', done: 'Done', queued: 'Queued', error: 'Decode error',
    note: 'Files are decoded and encoded on your device — nothing goes to a server.',
  },
};

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
let cid = 0;

function AudioConverter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]); // { id, file, name, status, outBlob, outName, outSize }
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState(192);
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback((files) => {
    const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|opus|weba|webm)$/i.test(f.name));
    if (!list.length) return;
    setItems((prev) => [...prev, ...list.map((file) => { cid += 1; return { id: cid, file, name: file.name, status: 'queued', outBlob: null }; })]);
  }, []);

  async function convertOne(item) {
    const buffer = await getAudioCtx().decodeAudioData((await item.file.arrayBuffer()).slice(0));
    const blob = format === 'wav' ? encodeWAV(buffer) : await encodeMp3(buffer, bitrate);
    const base = item.name.replace(/\.[^.]+$/, '');
    return { outBlob: blob, outName: `${base}.${format}`, outSize: blob.size };
  }

  async function convertAll() {
    if (busy) return;
    setBusy(true);
    for (const item of items) {
      if (item.status === 'done') continue; // eslint-disable-line no-continue
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'converting' } : it)));
      try {
        const res = await convertOne(item); // eslint-disable-line no-await-in-loop
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'done', ...res } : it)));
      } catch {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
      }
    }
    setBusy(false);
  }

  function clearAll() { setItems([]); }
  function removeItem(id) { setItems((prev) => prev.filter((it) => it.id !== id)); }

  return (
    <div className="tool-panel audio-converter">
      {items.length === 0 ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="ac-bar">
            <label className="tool-field ac-field"><span className="tool-field-label">{t.format}</span>
              <div className="segmented">
                <button type="button" className={format === 'mp3' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFormat('mp3')}>MP3</button>
                <button type="button" className={format === 'wav' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFormat('wav')}>WAV</button>
              </div>
            </label>
            {format === 'mp3' && (
              <label className="tool-field ac-field"><span className="tool-field-label">{t.quality}</span>
                <div className="segmented">
                  {[128, 192, 320].map((b) => (
                    <button key={b} type="button" className={bitrate === b ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBitrate(b)}>{b}</button>
                  ))}
                </div>
              </label>
            )}
            <div className="ac-bar-spacer" />
            <button type="button" className="tool-btn small" onClick={() => inputRef.current?.click()}>+ {t.add}</button>
            <button type="button" className="tool-btn small ghost" onClick={clearAll}>{t.clear}</button>
            <button type="button" className="tool-btn primary" disabled={busy} onClick={convertAll}>{busy ? t.converting : t.convertAll}</button>
          </div>

          <ul className="ac-list">
            {items.map((it) => (
              <li key={it.id} className={`ac-item is-${it.status}`}>
                <span className="ac-name" title={it.name}>{it.name}</span>
                <span className="ac-meta">
                  {it.status === 'queued' && <span className="ac-tag">{t.queued}</span>}
                  {it.status === 'converting' && <span className="ac-tag is-run">{t.converting}</span>}
                  {it.status === 'error' && <span className="ac-tag is-err">{t.error}</span>}
                  {it.status === 'done' && <span className="ac-tag is-ok">{fmtSize(it.outSize)}</span>}
                </span>
                {it.status === 'done' ? (
                  <button type="button" className="tool-btn small" onClick={() => downloadBlob(it.outBlob, it.outName)}>↓ {t.download}</button>
                ) : (
                  <button type="button" className="ac-x" onClick={() => removeItem(it.id)} aria-label="×">✕</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <input ref={inputRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.opus" multiple hidden
        onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default AudioConverter;
