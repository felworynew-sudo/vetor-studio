import { useRef, useState } from 'react';

// Масштабатор иконок: вписывает картинку/SVG в стандартные контейнеры
// (16/24/32/48/64/128) с центрированием и настраиваемым отступом. Локально.

const SIZES = [16, 24, 32, 48, 64, 128];

const TEXT = {
  ru: {
    drop: 'Загрузите иконку (PNG или SVG)', hint: 'Лучше квадратную, с запасом по размеру',
    padding: 'Отступ', change: 'Другая иконка', download: 'Скачать', downloadAll: 'Скачать все',
    local: 'Обрабатывается локально, файл никуда не передаётся.',
  },
  en: {
    drop: 'Upload an icon (PNG or SVG)', hint: 'Square and large enough is best',
    padding: 'Padding', change: 'Another icon', download: 'Download', downloadAll: 'Download all',
    local: 'Processed locally, the file is never uploaded.',
  },
};

function IconScaler({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [padding, setPadding] = useState(12);
  const [icons, setIcons] = useState([]);

  function render(img, pad) {
    const out = SIZES.map((size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const inner = size * (1 - pad / 100 * 2);
      const scale = Math.min(inner / img.naturalWidth, inner / img.naturalHeight);
      const w = img.naturalWidth * scale; const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      return { size, url: canvas.toDataURL('image/png') };
    });
    setIcons(out);
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; render(img, padding); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function onPadding(v) {
    setPadding(v);
    if (imgRef.current) render(imgRef.current, v);
  }

  function download(icon) {
    const a = document.createElement('a');
    a.href = icon.url; a.download = `icon-${icon.size}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="tool-panel icon-scaler">
      {icons.length === 0 ? (
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
          <div className="tool-field">
            <span className="tool-field-label">{t.padding}: {padding}%</span>
            <input type="range" min="0" max="35" value={padding} onChange={(e) => onPadding(Number(e.target.value))} />
          </div>

          <div className="fv-grid">
            {icons.map((ic) => (
              <button key={ic.size} type="button" className="fv-item" onClick={() => download(ic)} title={t.download}>
                <span className="is-cell"><img src={ic.url} alt="" style={{ width: Math.min(ic.size, 64), height: Math.min(ic.size, 64) }} /></span>
                <span className="fv-item-size">{ic.size}px</span>
              </button>
            ))}
          </div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => icons.forEach((ic, i) => setTimeout(() => download(ic), i * 180))}>{t.downloadAll}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*,.svg" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
    </div>
  );
}

export default IconScaler;
