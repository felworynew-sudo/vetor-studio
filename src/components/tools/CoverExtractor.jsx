import { useRef, useState } from 'react';
import { pictureExt, pictureUrl, readMeta } from '../../utils/audioMeta';
import { downloadBlob } from '../../utils/wav';

// Обложки из аудиофайлов: MP3, FLAC, M4A, OGG, Opus, WMA — достаёт все встроенные
// картинки (обложка, задник, буклет) в исходном качестве. Пакетно, ZIP. Локально.

const TEXT = {
  ru: { drop: 'Перетащите аудиофайлы (можно альбом целиком)', hint: 'MP3, FLAC, M4A, OGG, Opus, WMA — картинки достаются без пережатия', none: 'нет обложки', zip: 'Скачать все (ZIP)', clear: 'Очистить', reading: 'Читаю…', note: 'Картинки сохраняются в исходном формате и разрешении — так, как они вшиты в файл.' },
  en: { drop: 'Drop audio files (a whole album is fine)', hint: 'MP3, FLAC, M4A, OGG, Opus, WMA — images are extracted without re-compression', none: 'no cover', zip: 'Download all (ZIP)', clear: 'Clear', reading: 'Reading…', note: 'Images are saved in their original format and resolution — exactly as embedded.' },
};

function CoverExtractor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]); // { name, pics: [{ url, pic, w, h }] }
  const [busy, setBusy] = useState(false);

  async function add(list) {
    const files = [...(list || [])];
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const m = await readMeta(f); // eslint-disable-line no-await-in-loop
        const pics = (m.common.picture || []).map((pic) => ({ pic, url: pictureUrl(pic) }));
        setItems((p) => [...p, { name: f.name.replace(/\.[^.]+$/, ''), title: [m.common.artist, m.common.album || m.common.title].filter(Boolean).join(' — '), pics }]);
      } catch { setItems((p) => [...p, { name: f.name, pics: [] }]); }
    }
    setBusy(false);
  }

  const fname = (it, i, pic) => `${it.name}${i ? `-${i + 1}` : ''}.${pictureExt(pic)}`;
  async function zip() {
    const { zipSync } = await import('fflate'); const files = {}; const used = new Set();
    items.forEach((it) => it.pics.forEach(({ pic }, i) => { let n = fname(it, i, pic); while (used.has(n)) n = `_${n}`; used.add(n); files[n] = [new Uint8Array(pic.data), { level: 0 }]; }));
    downloadBlob(new Blob([zipSync(files)], { type: 'application/zip' }), 'covers.zip');
  }
  const total = items.reduce((s, it) => s + it.pics.length, 0);

  return (
    <div className="tool-panel cover-extractor">
      <button type="button" className="tool-dropzone ss-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{busy ? t.reading : t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>
      {items.length > 0 && (
        <>
          <div className="tool-actions">
            {total > 0 && <button type="button" className="tool-btn primary" onClick={zip}>{t.zip} ({total})</button>}
            <button type="button" className="tool-btn ghost" onClick={() => setItems([])}>{t.clear}</button>
          </div>
          <div className="ce-grid">
            {items.map((it, k) => (it.pics.length ? it.pics.map(({ pic, url }, i) => (
              <button key={`${k}-${i}`} type="button" className="ce-card" onClick={() => downloadBlob(new Blob([pic.data], { type: pic.format }), fname(it, i, pic))}>
                <img src={url} alt="" />
                <b>{it.title || it.name}</b>
                <span>{(pic.format || '').split('/')[1]?.toUpperCase()} · {Math.round(pic.data.length / 1024)} KB{pic.type ? ` · ${pic.type}` : ''} ↓</span>
              </button>
            )) : (
              <div key={k} className="ce-card is-empty"><span className="ce-none">♪</span><b>{it.name}</b><span>{t.none}</span></div>
            )))}
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="audio/*,.mp3,.flac,.m4a,.ogg,.opus,.wma" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default CoverExtractor;
