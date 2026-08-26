import { useCallback, useRef, useState } from 'react';

// Конвертер изображений: любой → любой. Обычные форматы (PNG/JPG/WebP/BMP)
// считаются мгновенно через <canvas>. Всё остальное (TIFF, AVIF, JXL, PSD, TGA,
// PNM, DDS, HDR, EXR и десятки других) — через ImageMagick-wasm, который грузится
// лениво и только когда реально нужен. Всё локально, файлы не покидают браузер.

const FORMATS = [
  { id: 'png', label: 'PNG', ext: 'png', native: 'image/png', magick: 'Png', group: 'common' },
  { id: 'jpg', label: 'JPG', ext: 'jpg', native: 'image/jpeg', magick: 'Jpeg', lossy: true, noAlpha: true, group: 'common' },
  { id: 'webp', label: 'WebP', ext: 'webp', native: 'image/webp', magick: 'WebP', lossy: true, group: 'common' },
  { id: 'avif', label: 'AVIF', ext: 'avif', magick: 'Avif', lossy: true, group: 'common' },
  { id: 'gif', label: 'GIF', ext: 'gif', magick: 'Gif', group: 'common' },
  { id: 'bmp', label: 'BMP', ext: 'bmp', native: 'bmp', magick: 'Bmp', noAlpha: true, group: 'common' },
  { id: 'tiff', label: 'TIFF', ext: 'tiff', magick: 'Tiff', group: 'common' },
  { id: 'ico', label: 'ICO', ext: 'ico', magick: 'Ico', group: 'common' },
  { id: 'jxl', label: 'JPEG XL', ext: 'jxl', magick: 'Jxl', lossy: true, group: 'pro' },
  { id: 'jp2', label: 'JPEG 2000', ext: 'jp2', magick: 'Jp2', lossy: true, group: 'pro' },
  { id: 'psd', label: 'PSD (Photoshop)', ext: 'psd', magick: 'Psd', group: 'pro' },
  { id: 'tga', label: 'TGA', ext: 'tga', magick: 'Tga', group: 'pro' },
  { id: 'dds', label: 'DDS', ext: 'dds', magick: 'Dds', group: 'pro' },
  { id: 'hdr', label: 'HDR (Radiance)', ext: 'hdr', magick: 'Hdr', group: 'pro' },
  { id: 'exr', label: 'OpenEXR', ext: 'exr', magick: 'Exr', group: 'pro' },
  { id: 'pnm', label: 'PNM', ext: 'pnm', magick: 'Pnm', group: 'pro' },
  { id: 'ppm', label: 'PPM', ext: 'ppm', magick: 'Ppm', group: 'pro' },
  { id: 'pgm', label: 'PGM', ext: 'pgm', magick: 'Pgm', group: 'pro' },
  { id: 'pbm', label: 'PBM', ext: 'pbm', magick: 'Pbm', group: 'pro' },
  { id: 'pcx', label: 'PCX', ext: 'pcx', magick: 'Pcx', group: 'pro' },
  { id: 'sgi', label: 'SGI', ext: 'sgi', magick: 'Sgi', group: 'pro' },
  { id: 'xbm', label: 'XBM', ext: 'xbm', magick: 'Xbm', group: 'pro' },
  { id: 'xpm', label: 'XPM', ext: 'xpm', magick: 'Xpm', group: 'pro' },
  { id: 'wbmp', label: 'WBMP', ext: 'wbmp', magick: 'Wbmp', group: 'pro' },
  { id: 'pict', label: 'PICT', ext: 'pict', magick: 'Pict', group: 'pro' },
  { id: 'fits', label: 'FITS', ext: 'fts', magick: 'Fits', group: 'pro' },
  { id: 'pfm', label: 'PFM', ext: 'pfm', magick: 'Pfm', group: 'pro' },
];

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif',
  gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff', ico: 'image/x-icon',
  jxl: 'image/jxl', jp2: 'image/jp2',
};
// Подсказка входного формата по расширению — для форматов без magic-байтов (TGA и др.).
const EXT2MAGICK = {
  tga: 'Tga', tif: 'Tiff', tiff: 'Tiff', psd: 'Psd', dds: 'Dds', exr: 'Exr', hdr: 'Hdr',
  jp2: 'Jp2', jxl: 'Jxl', avif: 'Avif', pcx: 'Pcx', ppm: 'Ppm', pgm: 'Pgm', pbm: 'Pbm',
  pnm: 'Pnm', pam: 'Pam', sgi: 'Sgi', xbm: 'Xbm', xpm: 'Xpm', wbmp: 'Wbmp', pict: 'Pict',
  fts: 'Fits', fits: 'Fits', pfm: 'Pfm', png: 'Png', jpg: 'Jpeg', jpeg: 'Jpeg', jfif: 'Jpeg',
  jpe: 'Jpeg', webp: 'WebP', gif: 'Gif', bmp: 'Bmp', ico: 'Ico', heic: 'Heic', heif: 'Heic', pcd: 'Pcd',
};
const NATIVE_IN = /\.(png|jpe?g|jfif|jpe|webp|gif|bmp|avif|ico)$/i;
// Что готовы принять: почти всё. Явно перечисляем расширения для файлов без MIME.
const ACCEPT = 'image/*,.heic,.heif,.tif,.tiff,.tga,.psd,.dds,.exr,.hdr,.jp2,.jxl,.avif,.pcx,.ppm,.pgm,.pbm,.pnm,.pam,.sgi,.xbm,.xpm,.wbmp,.ico,.pict,.fts,.fits,.pfm,.pcd';
const KNOWN_EXT = /\.(png|jpe?g|jfif|jpe|webp|gif|bmp|avif|ico|heic|heif|tiff?|tga|psd|dds|exr|hdr|jp2|jxl|pcx|ppm|pgm|pbm|pnm|pam|sgi|xbm|xpm|wbmp|pict|fts|fits|pfm|pcd)$/i;

function encodeBMP(imageData) {
  const { width, height, data } = imageData;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const dv = new DataView(buf);
  dv.setUint16(0, 0x424d, false); dv.setUint32(2, fileSize, true); dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true); dv.setInt32(18, width, true); dv.setInt32(22, height, true);
  dv.setUint16(26, 1, true); dv.setUint16(28, 24, true); dv.setUint32(34, pixelArraySize, true);
  for (let y = 0; y < height; y += 1) {
    let p = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      dv.setUint8(p, data[i + 2]); p += 1; dv.setUint8(p, data[i + 1]); p += 1; dv.setUint8(p, data[i]); p += 1;
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

const TEXT = {
  ru: {
    drop: 'Перетащите картинки сюда или нажмите, чтобы выбрать',
    hint: 'Любой формат в любой: PNG, JPG, WebP, AVIF, TIFF, GIF, BMP, ICO, PSD, TGA и десятки других',
    format: 'Формат на выходе', quality: 'Качество',
    convertAll: 'Конвертировать всё', download: 'Скачать', downloadAll: 'Скачать всё',
    clear: 'Очистить', processing: 'Обработка…',
    localNote: 'Файлы обрабатываются прямо в вашем браузере и никуда не передаются.',
    engineNote: 'Для редких форматов один раз загружается движок конвертации (~15 МБ), дальше — из кеша, в т.ч. офлайн.',
    engineLoading: 'Загрузка движка форматов (один раз)…',
    empty: 'Пока нет файлов', jpgBg: 'Фон (для форматов без прозрачности)',
    grpCommon: 'Обычные', grpPro: 'Профессиональные и редкие',
  },
  en: {
    drop: 'Drop images here or click to choose',
    hint: 'Any format to any: PNG, JPG, WebP, AVIF, TIFF, GIF, BMP, ICO, PSD, TGA and dozens more',
    format: 'Output format', quality: 'Quality',
    convertAll: 'Convert all', download: 'Download', downloadAll: 'Download all',
    clear: 'Clear', processing: 'Processing…',
    localNote: 'Files are processed right in your browser and never uploaded anywhere.',
    engineNote: 'Rare formats load a conversion engine once (~15 MB), then it is cached — offline too.',
    engineLoading: 'Loading the format engine (one time)…',
    empty: 'No files yet', jpgBg: 'Background (for formats without transparency)',
    grpCommon: 'Common', grpPro: 'Professional & rare',
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
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load-error')); };
    img.src = url;
  });
}

function ImageConverter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [format, setFormat] = useState('webp');
  const [quality, setQuality] = useState(0.9);
  const [jpgBg, setJpgBg] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);

  const activeFormat = FORMATS.find((f) => f.id === format) || FORMATS[0];

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/') || KNOWN_EXT.test(f.name));
    if (files.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...files.map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`, file, name: file.name,
        inSize: file.size, outUrl: '', outSize: 0, outName: '', status: 'idle',
      })),
    ]);
  }, []);

  async function canvasConvert(item, fmt) {
    const { img, revoke } = await loadImage(item.file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (fmt.noAlpha) { ctx.fillStyle = jpgBg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0);
    revoke();
    let blob;
    if (fmt.native === 'bmp') blob = encodeBMP(ctx.getImageData(0, 0, canvas.width, canvas.height));
    else blob = await new Promise((resolve) => canvas.toBlob(resolve, fmt.native, fmt.lossy ? quality : undefined));
    if (!blob) throw new Error('encode-error');
    const base = item.name.replace(/\.[^.]+$/, '');
    return { outUrl: URL.createObjectURL(blob), outSize: blob.size, outName: `${base}.${fmt.ext}` };
  }

  async function magickConvertItem(item, fmt) {
    setEngineLoading(true);
    const { magickConvert } = await import('../../utils/magick');
    const bytes = await item.file.arrayBuffer();
    const ext = (item.name.split('.').pop() || '').toLowerCase();
    const out = await magickConvert(bytes, fmt.magick, fmt.lossy ? Math.round(quality * 100) : undefined, EXT2MAGICK[ext] || null);
    setEngineLoading(false);
    const blob = new Blob([out], { type: MIME[fmt.ext] || 'application/octet-stream' });
    const base = item.name.replace(/\.[^.]+$/, '');
    return { outUrl: URL.createObjectURL(blob), outSize: blob.size, outName: `${base}.${fmt.ext}` };
  }

  async function convertOne(item) {
    const fmt = activeFormat;
    const inNative = NATIVE_IN.test(item.file.name) || (item.file.type && /(png|jpeg|webp|gif|bmp|avif|icon)/.test(item.file.type));
    if (fmt.native && inNative) {
      try { return await canvasConvert(item, fmt); } catch { /* упало нативно — пробуем через magick */ }
    }
    return magickConvertItem(item, fmt);
  }

  async function handleConvertAll() {
    setBusy(true);
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await convertOne(item);
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...result, status: 'done' } : it)));
      } catch {
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
      }
    }
    setEngineLoading(false);
    setBusy(false);
  }

  function downloadItem(item) {
    if (!item.outUrl) return;
    const a = document.createElement('a');
    a.href = item.outUrl; a.download = item.outName;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function downloadAll() { items.filter((it) => it.outUrl).forEach((it, i) => setTimeout(() => downloadItem(it), i * 250)); }
  function clearAll() { items.forEach((it) => it.outUrl && URL.revokeObjectURL(it.outUrl)); setItems([]); }

  const doneCount = items.filter((it) => it.status === 'done').length;
  const common = FORMATS.filter((f) => f.group === 'common');
  const pro = FORMATS.filter((f) => f.group === 'pro');

  return (
    <div className="tool-panel image-converter">
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          <select className="cb-select conv-format" value={format} onChange={(e) => setFormat(e.target.value)}>
            <optgroup label={t.grpCommon}>
              {common.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </optgroup>
            <optgroup label={t.grpPro}>
              {pro.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </optgroup>
          </select>
        </div>

        {activeFormat.lossy && (
          <div className="tool-field">
            <span className="tool-field-label">{t.quality}: {Math.round(quality * 100)}%</span>
            <input type="range" min="0.1" max="1" step="0.05" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
          </div>
        )}

        {activeFormat.noAlpha && (
          <div className="tool-field">
            <span className="tool-field-label">{t.jpgBg}</span>
            <input type="color" value={jpgBg} onChange={(e) => setJpgBg(e.target.value)} />
          </div>
        )}
      </div>

      <button
        type="button" className="tool-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={handleConvertAll} disabled={busy}>
            {busy ? t.processing : t.convertAll}
          </button>
          {doneCount > 0 && <button type="button" className="tool-btn" onClick={downloadAll}>{t.downloadAll} ({doneCount})</button>}
          <button type="button" className="tool-btn ghost" onClick={clearAll} disabled={busy}>{t.clear}</button>
        </div>
      )}

      {engineLoading && <p className="conv-engine">⏳ {t.engineLoading}</p>}

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
                  {item.inSize > 0 && <span className="convert-delta"> ({Math.round((1 - item.outSize / item.inSize) * 100)}%)</span>}
                </>
              )}
            </span>
            {item.status === 'done' ? (
              <button type="button" className="tool-btn small" onClick={() => downloadItem(item)}>{t.download}</button>
            ) : item.status === 'error' ? <span className="convert-error">⚠</span> : <span className="convert-pending">•</span>}
          </li>
        ))}
      </ul>

      <p className="tool-local-note">🔒 {t.localNote}</p>
      <p className="tool-local-note">⚙️ {t.engineNote}</p>
    </div>
  );
}

export default ImageConverter;
