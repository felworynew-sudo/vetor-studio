import { useRef, useState } from 'react';
import { dominantColors, imageToData } from '../../utils/quantize';

// Экстрактор палитры: достаёт доминирующие цвета из изображения. Квантизация
// по бакетам + сортировка по частоте. Всё локально в <canvas>.

const TEXT = {
  ru: { drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально', count: 'Цветов', change: 'Другое изображение', copied: 'Скопировано' },
  en: { drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally', count: 'Colors', change: 'Another image', copied: 'Copied' },
};

function extractPalette(img, count) {
  return dominantColors(imageToData(img, 200), count, { mergeDist: 46 });
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
