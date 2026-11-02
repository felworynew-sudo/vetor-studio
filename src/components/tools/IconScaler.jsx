import { useEffect, useRef, useState } from 'react';
import { buildIco, downscaleSteps } from '../../utils/ico';

// Масштабатор иконок: вписывает картинку/SVG в наборы размеров (стандартный, iOS,
// Android или свои) с центрированием, отступом и фоном. Растр уменьшается шагами
// по ×2 (чистые 16–32 px), SVG рисуется сразу в нужном размере. Выгрузка — ZIP
// (для Android — по папкам mipmap-*) и ICO. Всё локально.

const PRESETS = {
  standard: { sizes: [16, 24, 32, 48, 64, 128, 256] },
  ios: { sizes: [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024], solid: true },
  android: {
    sizes: [48, 72, 96, 144, 192, 512],
    folder: { 48: 'mipmap-mdpi', 72: 'mipmap-hdpi', 96: 'mipmap-xhdpi', 144: 'mipmap-xxhdpi', 192: 'mipmap-xxxhdpi', 512: 'play-store' },
  },
  custom: { sizes: [] },
};

const TEXT = {
  ru: {
    drop: 'Загрузите иконку (PNG, SVG или WebP)', hint: 'Лучше квадратную и крупнее самого большого размера',
    preset: 'Набор', standard: 'Стандарт', ios: 'iOS', android: 'Android', custom: 'Свои размеры',
    customPh: 'Например: 16, 32, 100, 300', padding: 'Отступ', bg: 'Фон', transparent: 'Прозрачный',
    radius: 'Скругление фона', change: 'Другая иконка', zip: 'Скачать всё (ZIP)', ico: 'Скачать .ico',
    icoHint: 'В .ico попадают размеры до 256 px.', iosNote: 'Apple не принимает прозрачные иконки — фон обязателен.',
    clickHint: 'Клик по иконке — скачать один размер.', local: 'Обрабатывается локально, файл никуда не передаётся.',
    bad: 'Не получилось открыть файл как картинку.',
  },
  en: {
    drop: 'Upload an icon (PNG, SVG or WebP)', hint: 'Square and larger than the biggest size is best',
    preset: 'Set', standard: 'Standard', ios: 'iOS', android: 'Android', custom: 'Custom sizes',
    customPh: 'E.g. 16, 32, 100, 300', padding: 'Padding', bg: 'Background', transparent: 'Transparent',
    radius: 'Background radius', change: 'Another icon', zip: 'Download all (ZIP)', ico: 'Download .ico',
    icoHint: 'The .ico gets sizes up to 256 px.', iosNote: 'Apple rejects transparent icons — a background is required.',
    clickHint: 'Click an icon to download one size.', local: 'Processed locally, the file is never uploaded.',
    bad: 'Could not open the file as an image.',
  },
};

function parseSizes(str) {
  return [...new Set(String(str).split(/[^\d]+/).map(Number).filter((n) => n >= 8 && n <= 2048))].sort((a, b) => a - b);
}

function renderSize(src, size, o) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  if (o.bg) {
    ctx.fillStyle = o.bg; const r = (o.radius / 100) * size * 0.5;
    ctx.beginPath(); ctx.roundRect(0, 0, size, size, r); ctx.fill();
  }
  const inner = size * (1 - (o.padding / 100) * 2);
  const k = Math.min(inner / src.w, inner / src.h);
  const w = Math.max(1, Math.round(src.w * k)); const h = Math.max(1, Math.round(src.h * k));
  const img = src.vector ? src.img : downscaleSteps(src.img, w, h);
  ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
  return c;
}

const toBytes = (canvas) => new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));

function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function IconScaler({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [src, setSrc] = useState(null); // { img, w, h, vector, name }
  const [preset, setPreset] = useState('standard');
  const [custom, setCustom] = useState('16, 32, 64, 128');
  const [padding, setPadding] = useState(8);
  const [bg, setBg] = useState('transparent');
  const [radius, setRadius] = useState(22);
  const [icons, setIcons] = useState([]);
  const [error, setError] = useState('');

  const p = PRESETS[preset];
  const sizes = preset === 'custom' ? parseSizes(custom) : p.sizes;
  const fill = bg === 'transparent' ? (p.solid ? '#ffffff' : null) : bg;
  const opts = { padding, bg: fill, radius: p.solid ? 0 : radius };

  useEffect(() => {
    if (!src) return;
    setIcons(sizes.map((size) => {
      const canvas = renderSize(src, size, opts);
      return { size, canvas, url: canvas.toDataURL('image/png') };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, preset, custom, padding, bg, radius]);

  function loadFile(file) {
    if (!file || !(file.type.startsWith('image/') || /\.svg$/i.test(file.name))) return;
    const vector = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // SVG без width/height: берём пропорции из viewBox, которые браузер уже применил (или квадрат)
      const w = img.naturalWidth || 512; const h = img.naturalHeight || 512;
      setError(''); setSrc({ img, w, h, vector, name: file.name.replace(/\.[^.]+$/, '') || 'icon' });
    };
    img.onerror = () => setError(t.bad);
    img.src = url;
  }

  const fileName = (size) => (p.folder ? `${p.folder[size]}/ic_launcher.png` : `${src.name}-${size}.png`);

  async function downloadOne(icon) {
    saveBlob(new Blob([await toBytes(icon.canvas)], { type: 'image/png' }), `${src.name}-${icon.size}.png`);
  }

  async function downloadZip() {
    const { zipSync } = await import('fflate');
    const files = {};
    for (const ic of icons) files[fileName(ic.size)] = await toBytes(ic.canvas); // eslint-disable-line no-await-in-loop
    saveBlob(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${src.name}-${preset}.zip`);
  }

  async function downloadIco() {
    const frames = await Promise.all(icons.filter((ic) => ic.size <= 256).map(async (ic) => ({ size: ic.size, data: await toBytes(ic.canvas) })));
    saveBlob(new Blob([buildIco(frames)], { type: 'image/x-icon' }), `${src.name}.ico`);
  }

  const canIco = preset !== 'ios' && preset !== 'android' && icons.some((ic) => ic.size <= 256);

  return (
    <div className="tool-panel icon-scaler">
      {!src ? (
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
          <div className="tool-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.preset}</span>
              <div className="segmented">
                {Object.keys(PRESETS).map((k) => (
                  <button key={k} type="button" className={preset === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setPreset(k)}>{t[k]}</button>
                ))}
              </div>
            </div>
            {preset === 'custom' && (
              <label className="tool-field">
                <span className="tool-field-label">{t.custom}</span>
                <input type="text" className="tool-input" value={custom} placeholder={t.customPh} onChange={(e) => setCustom(e.target.value)} />
              </label>
            )}
            <label className="tool-field">
              <span className="tool-field-label">{t.padding}: {padding}%</span>
              <input type="range" min="0" max="35" value={padding} onChange={(e) => setPadding(Number(e.target.value))} />
            </label>
            <div className="tool-field">
              <span className="tool-field-label">{t.bg}</span>
              <div className="is-bg-row">
                <label className="rec-opt"><input type="checkbox" checked={bg === 'transparent'} disabled={p.solid} onChange={(e) => setBg(e.target.checked ? 'transparent' : '#ffffff')} /> {t.transparent}</label>
                {(bg !== 'transparent' || p.solid) && <input type="color" value={bg === 'transparent' ? '#ffffff' : bg} onChange={(e) => setBg(e.target.value)} />}
              </div>
            </div>
            {fill && !p.solid && (
              <label className="tool-field">
                <span className="tool-field-label">{t.radius}: {radius}%</span>
                <input type="range" min="0" max="100" value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
              </label>
            )}
          </div>
          {p.solid && <p className="tool-local-note">ℹ️ {t.iosNote}</p>}

          <div className="fv-grid">
            {icons.map((ic) => (
              <button key={ic.size} type="button" className="fv-item" onClick={() => downloadOne(ic)} title={fileName(ic.size)}>
                <span className="is-cell"><img src={ic.url} alt="" style={{ width: Math.min(ic.size, 96), height: Math.min(ic.size, 96), imageRendering: ic.size < 48 ? 'pixelated' : 'auto' }} /></span>
                <span className="fv-item-size">{ic.size}px</span>
              </button>
            ))}
          </div>
          <p className="tool-local-note">{t.clickHint}{canIco ? ` ${t.icoHint}` : ''}</p>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" disabled={!icons.length} onClick={downloadZip}>{t.zip}</button>
            {canIco && <button type="button" className="tool-btn" onClick={downloadIco}>{t.ico}</button>}
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}
      {error && <p className="color-invalid">{error}</p>}

      <input ref={inputRef} type="file" accept="image/*,.svg" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
    </div>
  );
}

export default IconScaler;
