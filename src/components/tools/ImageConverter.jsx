import { useCallback, useRef, useState } from 'react';

// Конвертер изображений: PNG / JPEG / WebP. Всё считается локально через
// <canvas> — файлы не покидают браузер. Поддержка пакетной обработки.

const FORMATS = [
  { id: 'image/png', label: 'PNG', ext: 'png', lossy: false },
  { id: 'image/jpeg', label: 'JPG', ext: 'jpg', lossy: true },
  { id: 'image/webp', label: 'WebP', ext: 'webp', lossy: true },
];

const TEXT = {
  ru: {
    drop: 'Перетащите картинки сюда или нажмите, чтобы выбрать',
    hint: 'PNG, JPG, WebP, GIF, BMP — можно несколько файлов сразу',
    format: 'Формат на выходе',
    quality: 'Качество',
    convertAll: 'Конвертировать всё',
    convert: 'Конвертировать',
    download: 'Скачать',
    downloadAll: 'Скачать всё',
    clear: 'Очистить',
    processing: 'Обработка…',
    localNote: 'Файлы обрабатываются прямо в вашем браузере и никуда не передаются.',
    empty: 'Пока нет файлов',
    jpgBg: 'Фон для JPG (нет прозрачности)',
  },
  en: {
    drop: 'Drop images here or click to choose',
    hint: 'PNG, JPG, WebP, GIF, BMP — several files at once are fine',
    format: 'Output format',
    quality: 'Quality',
    convertAll: 'Convert all',
    convert: 'Convert',
    download: 'Download',
    downloadAll: 'Download all',
    clear: 'Clear',
    processing: 'Processing…',
    localNote: 'Files are processed right in your browser and never uploaded anywhere.',
    empty: 'No files yet',
    jpgBg: 'Background for JPG (no transparency)',
  },
};

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load-error'));
    };
    img.src = url;
  });
}

function ImageConverter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [format, setFormat] = useState('image/webp');
  const [quality, setQuality] = useState(0.9);
  const [jpgBg, setJpgBg] = useState('#ffffff');
  const [busy, setBusy] = useState(false);

  const activeFormat = FORMATS.find((f) => f.id === format) || FORMATS[0];

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...files.map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        name: file.name,
        inSize: file.size,
        outUrl: '',
        outSize: 0,
        outName: '',
        status: 'idle',
      })),
    ]);
  }, []);

  async function convertOne(item) {
    const { img, revoke } = await loadImage(item.file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (activeFormat.id === 'image/jpeg') {
      ctx.fillStyle = jpgBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    revoke();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, activeFormat.id, activeFormat.lossy ? quality : undefined);
    });
    if (!blob) throw new Error('encode-error');

    const baseName = item.name.replace(/\.[^.]+$/, '');
    return {
      outUrl: URL.createObjectURL(blob),
      outSize: blob.size,
      outName: `${baseName}.${activeFormat.ext}`,
    };
  }

  async function handleConvertAll() {
    setBusy(true);
    // Работаем по одной, чтобы не забивать память при пакете.
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await convertOne(item);
        setItems((prev) => prev.map((it) => (it.id === item.id
          ? { ...it, ...result, status: 'done' }
          : it)));
      } catch {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
      }
    }
    setBusy(false);
  }

  function downloadItem(item) {
    if (!item.outUrl) return;
    const a = document.createElement('a');
    a.href = item.outUrl;
    a.download = item.outName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadAll() {
    items.filter((it) => it.outUrl).forEach((it, i) => {
      // Небольшая задержка, чтобы браузер не блокировал множественные скачивания.
      setTimeout(() => downloadItem(it), i * 250);
    });
  }

  function clearAll() {
    items.forEach((it) => it.outUrl && URL.revokeObjectURL(it.outUrl));
    setItems([]);
  }

  const doneCount = items.filter((it) => it.status === 'done').length;

  return (
    <div className="tool-panel image-converter">
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          <div className="segmented">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={f.id === format ? 'segmented-btn is-active' : 'segmented-btn'}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {activeFormat.lossy && (
          <div className="tool-field">
            <span className="tool-field-label">{t.quality}: {Math.round(quality * 100)}%</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>
        )}

        {activeFormat.id === 'image/jpeg' && (
          <div className="tool-field">
            <span className="tool-field-label">{t.jpgBg}</span>
            <input type="color" value={jpgBg} onChange={(e) => setJpgBg(e.target.value)} />
          </div>
        )}
      </div>

      <button
        type="button"
        className="tool-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={handleConvertAll} disabled={busy}>
            {busy ? t.processing : t.convertAll}
          </button>
          {doneCount > 0 && (
            <button type="button" className="tool-btn" onClick={downloadAll}>
              {t.downloadAll} ({doneCount})
            </button>
          )}
          <button type="button" className="tool-btn ghost" onClick={clearAll} disabled={busy}>
            {t.clear}
          </button>
        </div>
      )}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className={`convert-row status-${item.status}`}>
            <span className="convert-name" title={item.name}>{item.name}</span>
            <span className="convert-sizes">
              {formatBytes(item.inSize)}
              {item.status === 'done' && (
                <>
                  <span className="convert-arrow"> → </span>
                  <strong>{formatBytes(item.outSize)}</strong>
                  {item.inSize > 0 && (
                    <span className="convert-delta">
                      {' '}({Math.round((1 - item.outSize / item.inSize) * 100)}%)
                    </span>
                  )}
                </>
              )}
            </span>
            {item.status === 'done' ? (
              <button type="button" className="tool-btn small" onClick={() => downloadItem(item)}>
                {t.download}
              </button>
            ) : item.status === 'error' ? (
              <span className="convert-error">⚠</span>
            ) : (
              <span className="convert-pending">•</span>
            )}
          </li>
        ))}
      </ul>

      <p className="tool-local-note">🔒 {t.localNote}</p>
    </div>
  );
}

export default ImageConverter;
