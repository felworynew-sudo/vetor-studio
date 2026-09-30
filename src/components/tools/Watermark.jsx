import { useCallback, useEffect, useRef, useState } from 'react';

// Водяные знаки: наложение текста или логотипа на изображения. Пакетно, локально
// через <canvas>. Режим — плитка по диагонали или одиночный в углу.

// Общая отрисовка знака — используется и в предпросмотре, и в финальной обработке.
// Позиция: плитка (с углом и шагом) или одна из 9 точек с отступом от края.
function drawWatermark(ctx, W, H, { useLogo, logoImg, wmText, color, opacity, size, mode, pos, angle, gap, outline }) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const unit = W * size;
  const fontPx = Math.max(10, unit * 0.5);
  ctx.font = `600 ${fontPx}px Inter, Arial, sans-serif`;
  const box = useLogo && logoImg
    ? { w: unit, h: (logoImg.naturalHeight / logoImg.naturalWidth) * unit }
    : { w: ctx.measureText(wmText || ' ').width, h: fontPx };
  const drawStamp = (cx, cy) => {
    if (useLogo && logoImg) {
      ctx.drawImage(logoImg, cx - box.w / 2, cy - box.h / 2, box.w, box.h);
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (outline) { ctx.lineWidth = Math.max(1, fontPx / 12); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineJoin = 'round'; ctx.strokeText(wmText || ' ', cx, cy); }
      ctx.fillStyle = color;
      ctx.fillText(wmText || ' ', cx, cy);
    }
  };
  if (mode === 'tile') {
    const stepX = (box.w + unit * 0.6) * gap; const stepY = (box.h + unit * 0.9) * gap;
    const R = Math.hypot(W, H);
    ctx.translate(W / 2, H / 2); ctx.rotate((-angle * Math.PI) / 180);
    let row = 0;
    for (let y = -R; y < R; y += stepY, row += 1) for (let x = -R + (row % 2) * stepX * 0.5; x < R; x += stepX) drawStamp(x, y);
  } else {
    const m = Math.min(W, H) * 0.04;
    const col = pos[1] === 'l' ? 0 : pos[1] === 'r' ? 2 : 1; const rw = pos[0] === 't' ? 0 : pos[0] === 'b' ? 2 : 1;
    const cx = [m + box.w / 2, W / 2, W - m - box.w / 2][col];
    const cy = [m + box.h / 2, H / 2, H - m - box.h / 2][rw];
    drawStamp(cx, cy);
  }
  ctx.restore();
}

// Выходной формат: «как исходный» сохраняет JPEG/WebP/PNG, остальное → PNG.
const FORMATS = { png: ['image/png', 'png'], jpeg: ['image/jpeg', 'jpg'], webp: ['image/webp', 'webp'] };
function pickFormat(file, format) {
  if (format !== 'auto') return FORMATS[format];
  if (file.type === 'image/jpeg') return FORMATS.jpeg;
  if (file.type === 'image/webp') return FORMATS.webp;
  return FORMATS.png;
}
const POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

const TEXT = {
  ru: {
    drop: 'Перетащите изображения сюда или нажмите', hint: 'Можно несколько файлов сразу',
    wmText: 'Текст водяного знака', useLogo: 'Использовать логотип', logo: 'Логотип (PNG)',
    opacity: 'Прозрачность', size: 'Размер', mode: 'Режим', tile: 'Плиткой', corner: 'В углу',
    color: 'Цвет', apply: 'Наложить и скачать всё', empty: 'Пока нет файлов', preview: 'Предпросмотр',
    local: 'Всё обрабатывается в браузере, файлы никуда не передаются. Формат «как исходный» сохраняет JPEG/WebP/PNG.', download: 'Скачать',
    angle: 'Угол', gap: 'Разреженность', pos: 'Положение', outline: 'Обводка для читаемости', format: 'Формат', auto: 'Как исходный', quality: 'Качество',
    zip: 'Скачать ZIP',
  },
  en: {
    drop: 'Drop images here or click', hint: 'Several files at once are fine',
    wmText: 'Watermark text', useLogo: 'Use a logo', logo: 'Logo (PNG)',
    opacity: 'Opacity', size: 'Size', mode: 'Mode', tile: 'Tiled', corner: 'Corner',
    color: 'Color', apply: 'Apply & download all', empty: 'No files yet', preview: 'Preview',
    local: 'Everything is processed in your browser, files are never uploaded. “Same as source” keeps JPEG/WebP/PNG.', download: 'Download',
    angle: 'Angle', gap: 'Spacing', pos: 'Position', outline: 'Outline for legibility', format: 'Format', auto: 'Same as source', quality: 'Quality',
    zip: 'Download ZIP',
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
  const [pos, setPos] = useState('br');
  const [angle, setAngle] = useState(30);
  const [gap, setGap] = useState(1.2);
  const [outline, setOutline] = useState(false);
  const [format, setFormat] = useState('auto');
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const previewCanvasRef = useRef(null);
  const previewImgRef = useRef({ id: null, img: null });

  // Живой предпросмотр на первой загруженной картинке — чтобы масштаб/плотность
  // настраивались не вслепую.
  useEffect(() => {
    const first = items[0];
    const canvas = previewCanvasRef.current;
    if (!first || !canvas) return;
    let cancelled = false;
    const render = (img) => {
      if (cancelled) return;
      const maxW = 480;
      const scale = Math.min(1, maxW / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawWatermark(ctx, canvas.width, canvas.height, { useLogo, logoImg, wmText, color, opacity, size, mode, pos, angle, gap, outline });
    };
    if (previewImgRef.current.id === first.id && previewImgRef.current.img) {
      render(previewImgRef.current.img);
    } else {
      loadImageFromFile(first.file).then(({ img, revoke }) => {
        previewImgRef.current = { id: first.id, img };
        revoke();
        render(img);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [items, useLogo, logoImg, wmText, color, opacity, size, mode, pos, angle, gap, outline]);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, outUrl: '' }))]);
  }, []);

  function loadLogo(file) {
    if (!file) return;
    loadImageFromFile(file).then(({ img, revoke }) => { setLogoImg(img); setUseLogo(true); revoke(); });
  }

  const wmOpts = { useLogo, logoImg, wmText, color, opacity, size, mode, pos, angle, gap, outline };

  async function processOne(item) {
    const { img, revoke } = await loadImageFromFile(item.file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    const [mime, ext] = pickFormat(item.file, format);
    if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0);
    revoke();
    drawWatermark(ctx, canvas.width, canvas.height, wmOpts);
    const blob = await new Promise((res) => canvas.toBlob(res, mime, mime === 'image/png' ? undefined : quality));
    const baseName = item.name.replace(/\.[^.]+$/, '');
    return { blob, outUrl: URL.createObjectURL(blob), outName: `${baseName}-wm.${ext}` };
  }

  function save(href, name) {
    const a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Картинки уже сжаты — в ZIP кладём без повторного сжатия (level 0).
  async function saveZip(list) {
    const { zipSync } = await import('fflate');
    const files = {}; const used = new Set();
    for (const r of list) {
      let name = r.outName; let n = 1;
      while (used.has(name)) { name = r.outName.replace(/(\.[^.]+)$/, `-${n}$1`); n += 1; }
      used.add(name);
      // eslint-disable-next-line no-await-in-loop
      files[name] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }];
    }
    const url = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' }));
    save(url, 'watermarked.zip'); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function applyAll() {
    setBusy(true); setProgress(0);
    items.forEach((it) => it.outUrl && URL.revokeObjectURL(it.outUrl));
    const results = [];
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await processOne(item);
        results.push({ ...item, ...r });
      } catch { results.push({ ...item, outUrl: '' }); }
      setProgress(results.length);
    }
    setItems(results);
    setBusy(false);
    const ok = results.filter((r) => r.outUrl);
    if (ok.length === 1) save(ok[0].outUrl, ok[0].outName);
    else if (ok.length > 1) await saveZip(ok);
  }

  const done = items.filter((i) => i.outUrl);
  const seg = (value, set, opts) => (
    <div className="segmented">
      {opts.map(([v, label]) => <button key={v} type="button" className={value === v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(v)}>{label}</button>)}
    </div>
  );

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
          {seg(mode, setMode, [['tile', t.tile], ['corner', t.corner]])}
        </div>
      </div>

      <div className="tool-controls">
        {mode === 'tile' ? (
          <>
            <div className="tool-field">
              <span className="tool-field-label">{t.angle}: {angle}°</span>
              <input type="range" min="-90" max="90" step="5" value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.gap}: {gap.toFixed(1)}×</span>
              <input type="range" min="0.6" max="3" step="0.1" value={gap} onChange={(e) => setGap(Number(e.target.value))} />
            </div>
          </>
        ) : (
          <div className="tool-field">
            <span className="tool-field-label">{t.pos}</span>
            <div className="wm-pos">
              {POSITIONS.map((p) => <button key={p} type="button" className={p === pos ? 'wm-pos-cell is-active' : 'wm-pos-cell'} onClick={() => setPos(p)} aria-label={p} />)}
            </div>
          </div>
        )}
        {!useLogo && <label className="wm-check"><input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} /> {t.outline}</label>}
      </div>

      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          {seg(format, setFormat, [['auto', t.auto], ['jpeg', 'JPEG'], ['webp', 'WebP'], ['png', 'PNG']])}
        </div>
        {format !== 'png' && (
          <div className="tool-field">
            <span className="tool-field-label">{t.quality}: {Math.round(quality * 100)}</span>
            <input type="range" min="0.5" max="1" step="0.01" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
          </div>
        )}
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
        <div className="wm-preview">
          <span className="tool-field-label">{t.preview}</span>
          <div className="wm-preview-box"><canvas ref={previewCanvasRef} /></div>
        </div>
      )}

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={applyAll} disabled={busy}>{busy ? `${progress} / ${items.length}` : `${t.apply} (${items.length})`}</button>
          {done.length > 1 && !busy && <button type="button" className="tool-btn" onClick={() => saveZip(done)}>{t.zip}</button>}
          <button type="button" className="tool-btn ghost" onClick={() => setItems([])} disabled={busy}>✕</button>
        </div>
      )}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className="convert-row">
            <span className="convert-name">{item.name}</span>
            <span className="convert-pending">{item.outName ? item.outName.split('.').pop().toUpperCase() : ''}</span>
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
