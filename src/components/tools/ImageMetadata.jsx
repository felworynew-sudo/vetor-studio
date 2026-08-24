import { useCallback, useState } from 'react';
import { cleanImageMetadata } from '../../utils/imageMeta';

// Очистка метаданных изображений: удаляет EXIF, XMP, C2PA/AI-метки, IPTC, GPS,
// комментарии — БЕЗ перекодирования пикселей (JPEG/PNG). Прочие форматы — через
// повторное кодирование в PNG. Пакетно, локально.

const TEXT = {
  ru: {
    drop: 'Перетащите изображения сюда или нажмите', hint: 'JPEG и PNG чистятся без потерь; остальное — перекодированием в PNG',
    clean: 'Найденные метаданные будут удалены', nothing: 'Метаданных не найдено — файл уже чистый',
    download: 'Скачать чистый', downloadAll: 'Скачать всё', clear: 'Очистить', empty: 'Пока нет файлов',
    reencode: 'перекодирование', note: 'Удаляются в т.ч. метки происхождения C2PA (которыми помечают ИИ-контент).',
  },
  en: {
    drop: 'Drop images here or click', hint: 'JPEG and PNG cleaned losslessly; others by re-encoding to PNG',
    clean: 'The metadata found will be removed', nothing: 'No metadata found — the file is already clean',
    download: 'Download clean', downloadAll: 'Download all', clear: 'Clear', empty: 'No files yet',
    reencode: 're-encoded', note: 'Removes C2PA provenance markers too (used to tag AI content).',
  },
};

function fmtBytes(b) { return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`; }

function reencodePng(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob); }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function ImageMetadata({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [items, setItems] = useState([]);

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      const id = `${Date.now()}-${Math.random()}`;
      setItems((prev) => [...prev, { id, name: file.name, inSize: file.size, found: [], outUrl: '', outSize: 0, ext: 'png', status: 'busy' }]);
      try {
        // eslint-disable-next-line no-await-in-loop
        const ab = await file.arrayBuffer();
        const res = cleanImageMetadata(ab, file.type);
        if (res) {
          const blob = new Blob([res.clean], { type: res.mime });
          const outUrl = URL.createObjectURL(blob);
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, found: res.found, outUrl, outSize: blob.size, ext: res.ext, status: 'done' } : it)));
        } else {
          // eslint-disable-next-line no-await-in-loop
          const blob = await reencodePng(file);
          const outUrl = blob ? URL.createObjectURL(blob) : '';
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, found: [{ type: t.reencode, size: 0 }], outUrl, outSize: blob ? blob.size : 0, ext: 'png', status: blob ? 'done' : 'error' } : it)));
        }
      } catch {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'error' } : it)));
      }
    }
  }, [t.reencode]);

  function download(item) {
    const a = document.createElement('a');
    a.href = item.outUrl; a.download = `${item.name.replace(/\.[^.]+$/, '')}-clean.${item.ext}`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const done = items.filter((it) => it.status === 'done' && it.outUrl);

  return (
    <div className="tool-panel image-metadata">
      <button type="button" className="tool-dropzone" onClick={() => document.getElementById('imeta-input')?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {done.length > 1 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn" onClick={() => done.forEach((it, i) => setTimeout(() => download(it), i * 200))}>{t.downloadAll} ({done.length})</button>
          <button type="button" className="tool-btn ghost" onClick={() => setItems([])}>{t.clear}</button>
        </div>
      )}

      <ul className="convert-list im-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className="im-row">
            <div className="im-row-top">
              <span className="convert-name" title={item.name}>{item.name}</span>
              <span className="convert-sizes">{fmtBytes(item.inSize)}{item.status === 'done' && <> → <strong>{fmtBytes(item.outSize)}</strong></>}</span>
              {item.status === 'done' && item.outUrl && <button type="button" className="tool-btn small" onClick={() => download(item)}>{t.download}</button>}
              {item.status === 'error' && <span className="convert-error">⚠</span>}
            </div>
            {item.status === 'done' && (
              item.found.length > 0 ? (
                <div className="im-chips">{item.found.map((f, i) => <span key={i} className={/C2PA/i.test(f.type) ? 'im-chip is-ai' : 'im-chip'}>{f.type}{f.size ? ` · ${fmtBytes(f.size)}` : ''}</span>)}</div>
              ) : <div className="im-clean">✓ {t.nothing}</div>
            )}
          </li>
        ))}
      </ul>

      <input id="imeta-input" type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default ImageMetadata;
