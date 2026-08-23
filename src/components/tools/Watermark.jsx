import { useCallback, useRef, useState } from 'react';

// Водяные знаки: наложение текста или логотипа на изображения. Пакетно, локально
// через <canvas>. Режим — плитка по диагонали или одиночный в углу.

const TEXT = {
  ru: {
    drop: 'Перетащите изображения сюда или нажмите', hint: 'Можно несколько файлов сразу',
    wmText: 'Текст водяного знака', useLogo: 'Использовать логотип', logo: 'Логотип (PNG)',
    opacity: 'Прозрачность', size: 'Размер', mode: 'Режим', tile: 'Плиткой', corner: 'В углу',
    color: 'Цвет', apply: 'Наложить и скачать всё', empty: 'Пока нет файлов',
    local: 'Всё обрабатывается в браузере, файлы никуда не передаются.', download: 'Скачать',
  },
  en: {
    drop: 'Drop images here or click', hint: 'Several files at once are fine',
    wmText: 'Watermark text', useLogo: 'Use a logo', logo: 'Logo (PNG)',
    opacity: 'Opacity', size: 'Size', mode: 'Mode', tile: 'Tiled', corner: 'Corner',
    color: 'Color', apply: 'Apply & download all', empty: 'No files yet',
    local: 'Everything is processed in your browser, files are never uploaded.', download: 'Download',
  },
};

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

function Watermark({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const logoRef = useRef(null);
  const [items, setItems] = useState([]);
  const [wmText, setWmText] = useState('© Vetor');
  const [useLogo, setUseLogo] = useState(false);
  const [logoImg, setLogoImg] = useState(null);
  const [opacity, setOpacity] = useState(0.35);
  const [size, setSize] = useState(0.18); // доля от ширины
  const [mode, setMode] = useState('tile');
  const [color, setColor] = useState('#ffffff');
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, outUrl: '' }))]);
  }, []);

  function loadLogo(file) {
    if (!file) return;
    loadImageFromFile(file).then(({ img, revoke }) => { setLogoImg(img); setUseLogo(true); revoke(); });
  }

  async function processOne(item) {
    const { img, revoke } = await loadImageFromFile(item.file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    revoke();
    ctx.globalAlpha = opacity;

    const unit = canvas.width * size;
    const drawStamp = (cx, cy) => {
      if (useLogo && logoImg) {
        const w = unit;
        const h = (logoImg.naturalHeight / logoImg.naturalWidth) * unit;
        ctx.drawImage(logoImg, cx - w / 2, cy - h / 2, w, h);
      } else {
        ctx.fillStyle = color;
        ctx.font = `600 ${Math.max(12, unit * 0.5)}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wmText || ' ', cx, cy);
      }
    };

    if (mode === 'tile') {
      const stepX = unit * 2.4;
      const stepY = unit * 2.0;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      for (let y = -canvas.height; y < canvas.height * 2; y += stepY) {
        for (let x = -canvas.width; x < canvas.width * 2; x += stepX) {
          drawStamp(x, y);
        }
      }
      ctx.restore();
    } else {
      const margin = unit * 0.9;
      drawStamp(canvas.width - margin, canvas.height - margin * 0.6);
    }

    ctx.globalAlpha = 1;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const baseName = item.name.replace(/\.[^.]+$/, '');
    return { outUrl: URL.createObjectURL(blob), outName: `${baseName}-wm.png` };
  }

  async function applyAll() {
    setBusy(true);
    const results = [];
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await processOne(item);
        results.push({ ...item, ...r });
      } catch { results.push(item); }
    }
    setItems(results);
    // авто-скачивание
    results.filter((r) => r.outUrl).forEach((r, i) => setTimeout(() => {
      const a = document.createElement('a');
      a.href = r.outUrl; a.download = r.outName;
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 250));
    setBusy(false);
  }

  return (
    <div className="tool-panel watermark">
      <div className="tool-controls">
        <label className="wm-check">
          <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} />
          {t.useLogo}
        </label>
        {useLogo ? (
          <button type="button" className="tool-btn small" onClick={() => logoRef.current?.click()}>
            {logoImg ? '✓ ' : ''}{t.logo}
          </button>
        ) : (
          <div className="tool-field">
            <span className="tool-field-label">{t.wmText}</span>
            <input type="text" className="wm-text-input" value={wmText} onChange={(e) => setWmText(e.target.value)} />
          </div>
        )}
        {!useLogo && (
          <div className="tool-field">
            <span className="tool-field-label">{t.color}</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        )}
      </div>

      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.opacity}: {Math.round(opacity * 100)}%</span>
          <input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.size}: {Math.round(size * 100)}%</span>
          <input type="range" min="0.05" max="0.5" step="0.01" value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.mode}</span>
          <div className="segmented">
            <button type="button" className={mode === 'tile' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('tile')}>{t.tile}</button>
            <button type="button" className={mode === 'corner' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('corner')}>{t.corner}</button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="tool-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={applyAll} disabled={busy}>{t.apply} ({items.length})</button>
          <button type="button" className="tool-btn ghost" onClick={() => setItems([])} disabled={busy}>✕</button>
        </div>
      )}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className="convert-row">
            <span className="convert-name">{item.name}</span>
            <span />
            {item.outUrl ? (
              <a className="tool-btn small" href={item.outUrl} download={item.outName}>{t.download}</a>
            ) : <span className="convert-pending">•</span>}
          </li>
        ))}
      </ul>

      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={logoRef} type="file" accept="image/png,image/*" hidden onChange={(e) => { loadLogo(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
    </div>
  );
}

export default Watermark;
