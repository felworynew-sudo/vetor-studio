import { useRef, useState } from 'react';

// Экстрактор палитры: достаёт доминирующие цвета из изображения. Квантизация
// по бакетам + сортировка по частоте. Всё локально в <canvas>.

const TEXT = {
  ru: { drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально', count: 'Цветов', change: 'Другое изображение', copied: 'Скопировано' },
  en: { drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally', count: 'Colors', change: 'Another image', copied: 'Copied' },
};

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function extractPalette(img, count) {
  const canvas = document.createElement('canvas');
  const maxDim = 160; // даунскейл для скорости
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Бакеты по 4 бита на канал (4096 бакетов), копим сумму и счётчик.
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; // пропускаем прозрачные
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) { bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1; }
    else buckets.set(key, { r, g, b, n: 1 });
  }

  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bucket) => ({
      hex: toHex(Math.round(bucket.r / bucket.n), Math.round(bucket.g / bucket.n), Math.round(bucket.b / bucket.n)),
      weight: bucket.n,
    }));
}

function PaletteExtractor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [count, setCount] = useState(6);
  const [palette, setPalette] = useState([]);
  const [preview, setPreview] = useState('');
  const [copied, setCopied] = useState('');

  function run(n = count) {
    if (imgRef.current) setPalette(extractPalette(imgRef.current, n));
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setPreview(url);
      setPalette(extractPalette(img, count));
    };
    img.src = url;
  }

  function copy(hex) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(hex).then(() => {
        setCopied(hex);
        setTimeout(() => setCopied(''), 1200);
      }).catch(() => {});
    }
  }

  return (
    <div className="tool-panel palette-extractor">
      {!preview ? (
        <button
          type="button"
          className="tool-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
        >
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="pe-top">
            <img src={preview} alt="" className="pe-preview" />
            <div className="tool-field">
              <span className="tool-field-label">{t.count}: {count}</span>
              <input
                type="range" min="3" max="12" step="1" value={count}
                onChange={(e) => { const n = Number(e.target.value); setCount(n); run(n); }}
              />
              <button type="button" className="tool-btn small" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>

          <div className="pe-swatches">
            {palette.map((c) => (
              <button key={c.hex} type="button" className="pe-swatch" onClick={() => copy(c.hex)} title={t.copied}>
                <span className="pe-swatch-color" style={{ background: c.hex }} />
                <span className="pe-swatch-hex">{copied === c.hex ? `✓ ${t.copied}` : c.hex.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }}
      />
      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default PaletteExtractor;
