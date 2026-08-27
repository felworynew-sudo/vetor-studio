import { useCallback, useRef, useState } from 'react';

// Компрессор изображений: ужимает под целевой размер («до N КБ») бинарным поиском
// качества, а если не влезает даже на минимуме — постепенно уменьшает размер.
// Либо режим фиксированного качества. WebP/JPEG, пакетно, локально.

const TEXT = {
  ru: {
    drop: 'Перетащите изображения или нажмите', hint: 'PNG, JPG, WebP — можно несколько сразу',
    mode: 'Режим', target: 'До размера', quality: 'Качество', targetKb: 'Целевой размер', qual: 'Качество',
    format: 'Формат', run: 'Сжать всё', processing: 'Сжатие…', download: 'Скачать', downloadAll: 'Скачать всё',
    clear: 'Очистить', empty: 'Пока нет файлов', tooSmall: 'не удалось уложиться — минимально возможный',
    note: 'Всё сжимается в браузере, файлы не уходят на сервер. Прозрачность сохраняется только в WebP.',
  },
  en: {
    drop: 'Drop images or click', hint: 'PNG, JPG, WebP — several at once are fine',
    mode: 'Mode', target: 'Target size', quality: 'Quality', targetKb: 'Target size', qual: 'Quality',
    format: 'Format', run: 'Compress all', processing: 'Compressing…', download: 'Download', downloadAll: 'Download all',
    clear: 'Clear', empty: 'No files yet', tooSmall: 'could not reach target — smallest possible',
    note: 'Everything is compressed in your browser, nothing is uploaded. Transparency is kept only in WebP.',
  },
};

const fmtBytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);
const loadImage = (file) => new Promise((res, rej) => { const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => res({ img, revoke: () => URL.revokeObjectURL(url) }); img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('load')); }; img.src = url; });
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

function ImageCompressor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('target');
  const [targetKb, setTargetKb] = useState(200);
  const [quality, setQuality] = useState(0.8);
  const [format, setFormat] = useState('image/webp');
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback((list) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, inSize: file.size, outUrl: '', outSize: 0, outName: '', status: 'idle', warn: false }))]);
  }, []);

  async function compress(item) {
    const { img, revoke } = await loadImage(item.file);
    const ext = format === 'image/webp' ? 'webp' : 'jpg';
    const base = item.name.replace(/\.[^.]+$/, '');
    const draw = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); if (format === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } ctx.drawImage(img, 0, 0, w, h); return c; };
    let blob; let warn = false;
    if (mode === 'quality') {
      blob = await toBlob(draw(img.naturalWidth, img.naturalHeight), format, quality);
    } else {
      const targetBytes = targetKb * 1024;
      let W = img.naturalWidth; let H = img.naturalHeight;
      // бинарный поиск качества при текущем размере; если минимум всё ещё велик — ужимаем размер
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const canvas = draw(W, H);
        let lo = 0.05; let hi = 0.95; let best = await toBlob(canvas, format, lo);
        if (best.size <= targetBytes) {
          // ищем максимальное качество, влезающее в лимит
          for (let s = 0; s < 7; s += 1) { const mid = (lo + hi) / 2; const b = await toBlob(canvas, format, mid); if (b.size <= targetBytes) { best = b; lo = mid; } else hi = mid; } // eslint-disable-line no-await-in-loop
          blob = best; break;
        }
        // даже на мин. качестве не влезает — уменьшаем размер на 25% и повторяем
        blob = best;
        if (attempt === 6) { warn = true; break; }
        W = Math.round(W * 0.8); H = Math.round(H * 0.8);
      }
    }
    revoke();
    if (!blob) throw new Error('encode');
    return { outUrl: URL.createObjectURL(blob), outSize: blob.size, outName: `${base}.${ext}`, warn };
  }

  async function runAll() {
    setBusy(true);
    for (const item of items) {
      try { const r = await compress(item); setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...r, status: 'done' } : it))); } // eslint-disable-line no-await-in-loop
      catch { setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it))); }
    }
    setBusy(false);
  }

  function dl(item) { const a = document.createElement('a'); a.href = item.outUrl; a.download = item.outName; document.body.appendChild(a); a.click(); a.remove(); }
  const done = items.filter((it) => it.status === 'done').length;

  return (
    <div className="tool-panel compressor">
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.mode}</span>
          <div className="segmented">
            <button type="button" className={mode === 'target' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('target')}>{t.target}</button>
            <button type="button" className={mode === 'quality' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('quality')}>{t.quality}</button>
          </div>
        </div>
        {mode === 'target' ? (
          <div className="tool-field"><span className="tool-field-label">{t.targetKb}: {targetKb} KB</span><input type="range" min="20" max="2000" step="10" value={targetKb} onChange={(e) => setTargetKb(Number(e.target.value))} /></div>
        ) : (
          <div className="tool-field"><span className="tool-field-label">{t.qual}: {Math.round(quality * 100)}%</span><input type="range" min="0.1" max="1" step="0.05" value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></div>
        )}
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          <div className="segmented">
            <button type="button" className={format === 'image/webp' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFormat('image/webp')}>WebP</button>
            <button type="button" className={format === 'image/jpeg' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFormat('image/jpeg')}>JPG</button>
          </div>
        </div>
      </div>

      <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={runAll} disabled={busy}>{busy ? t.processing : t.run}</button>
          {done > 0 && <button type="button" className="tool-btn" onClick={() => items.filter((it) => it.outUrl).forEach((it, i) => setTimeout(() => dl(it), i * 200))}>{t.downloadAll} ({done})</button>}
          <button type="button" className="tool-btn ghost" onClick={() => setItems([])} disabled={busy}>{t.clear}</button>
        </div>
      )}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className={`convert-row status-${item.status}`}>
            <span className="convert-name" title={item.name}>{item.name}{item.warn && <span className="ae-detected">{t.tooSmall}</span>}</span>
            <span className="convert-sizes">
              {fmtBytes(item.inSize)}
              {item.status === 'done' && <> <span className="convert-arrow">→</span> <strong>{fmtBytes(item.outSize)}</strong> <span className="convert-delta">(−{Math.max(0, Math.round((1 - item.outSize / item.inSize) * 100))}%)</span></>}
            </span>
            {item.status === 'done' ? <button type="button" className="tool-btn small" onClick={() => dl(item)}>{t.download}</button> : item.status === 'error' ? <span className="convert-error">⚠</span> : <span className="convert-pending">•</span>}
          </li>
        ))}
      </ul>

      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default ImageCompressor;
