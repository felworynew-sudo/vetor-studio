import { useEffect, useRef, useState } from 'react';

// Спрайт-шит: кадры (PNG/JPG/WebP) → один атлас-сетка + JSON (формат TexturePacker
// «hash», понимают Phaser, PixiJS, Unity-плагины) и CSS-классы. Обрезка прозрачных
// полей, отступы, степень двойки, превью анимации. Второй режим — обратно: нарезать
// готовый спрайт-шит на кадры (ZIP).

const TEXT = {
  ru: {
    build: 'Собрать из кадров', split: 'Нарезать шит на кадры', drop: 'Перетащите кадры по порядку (можно много)', dropSheet: 'Перетащите спрайт-шит',
    cols: 'Колонок (0 — авто)', padding: 'Отступ', trim: 'Обрезать прозрачные поля', pot: 'Размер — степень двойки', fps: 'Скорость превью, кадр/с',
    rows: 'Строк', columns: 'Колонок', png: 'Скачать PNG', json: 'JSON (TexturePacker)', css: 'CSS-спрайт', zip: 'Скачать кадры ZIP', clear: 'Очистить',
    frames: (n) => `Кадров: ${n}`, sheet: (w, h) => `Атлас ${w}×${h}`,
    note: 'Всё локально. Имена кадров берутся из имён файлов — сортируйте их по порядку (frame_01, frame_02…).',
  },
  en: {
    build: 'Build from frames', split: 'Split a sheet into frames', drop: 'Drop frames in order (many at once)', dropSheet: 'Drop a sprite sheet',
    cols: 'Columns (0 — auto)', padding: 'Padding', trim: 'Trim transparent edges', pot: 'Power-of-two size', fps: 'Preview speed, fps',
    rows: 'Rows', columns: 'Columns', png: 'Download PNG', json: 'JSON (TexturePacker)', css: 'CSS sprite', zip: 'Download frames ZIP', clear: 'Clear',
    frames: (n) => `Frames: ${n}`, sheet: (w, h) => `Atlas ${w}×${h}`,
    note: 'All local. Frame names come from file names — sort them in order (frame_01, frame_02…).',
  },
};

const loadImg = (file) => new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => res({ img: i, url: u, name: file.name.replace(/\.[^.]+$/, '') }); i.onerror = rej; i.src = u; });

function trimBox(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width; let y0 = c.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < c.height; y += 1) for (let xx = 0; xx < c.width; xx += 1) if (d[(y * c.width + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const pot = (v) => 2 ** Math.ceil(Math.log2(v));
const blobDownload = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };

function SpriteSheet({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [mode, setMode] = useState('build');
  const [frames, setFrames] = useState([]);
  const [cols, setCols] = useState(0);
  const [padding, setPadding] = useState(2);
  const [trim, setTrim] = useState(false);
  const [usePot, setUsePot] = useState(false);
  const [fps, setFps] = useState(12);
  const [sheet, setSheet] = useState(null); // { canvas, meta }
  const [splitSrc, setSplitSrc] = useState(null);
  const [grid, setGrid] = useState({ rows: 4, cols: 4 });
  const inputRef = useRef(null); const sheetInput = useRef(null); const animRef = useRef(null);

  async function addFrames(list) {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const loaded = await Promise.all(files.map(loadImg));
    setFrames((prev) => [...prev, ...loaded]);
  }

  useEffect(() => {
    if (mode !== 'build' || !frames.length) { setSheet(null); return; }
    const boxes = frames.map((f) => (trim ? trimBox(f.img) : { x: 0, y: 0, w: f.img.naturalWidth, h: f.img.naturalHeight }));
    const cw = Math.max(...boxes.map((b) => b.w)); const ch = Math.max(...boxes.map((b) => b.h));
    const n = frames.length; const c = cols > 0 ? cols : Math.ceil(Math.sqrt(n)); const r = Math.ceil(n / c);
    let W = c * cw + (c + 1) * padding; let H = r * ch + (r + 1) * padding;
    if (usePot) { W = pot(W); H = pot(H); }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const meta = { frames: {}, meta: { app: 'Vetor Studio — vetor-studio.ru', image: 'spritesheet.png', format: 'RGBA8888', size: { w: W, h: H }, scale: '1', frameTags: [] } };
    frames.forEach((f, i) => {
      const b = boxes[i]; const col = i % c; const row = Math.floor(i / c);
      const dx = padding + col * (cw + padding) + Math.floor((cw - b.w) / 2); const dy = padding + row * (ch + padding) + Math.floor((ch - b.h) / 2);
      x.drawImage(f.img, b.x, b.y, b.w, b.h, dx, dy, b.w, b.h);
      meta.frames[f.name] = {
        frame: { x: dx, y: dy, w: b.w, h: b.h }, rotated: false, trimmed: trim && (b.w !== f.img.naturalWidth || b.h !== f.img.naturalHeight),
        spriteSourceSize: { x: b.x, y: b.y, w: b.w, h: b.h }, sourceSize: { w: f.img.naturalWidth, h: f.img.naturalHeight }, duration: Math.round(1000 / fps),
      };
    });
    setSheet({ canvas: cv, meta, cw, ch, c, boxes });
  }, [frames, cols, padding, trim, usePot, fps, mode]);

  // Превью анимации по кадрам атласа.
  useEffect(() => {
    if (!sheet || !animRef.current) return undefined;
    const cv = animRef.current; const x = cv.getContext('2d');
    const list = Object.values(sheet.meta.frames);
    cv.width = sheet.cw; cv.height = sheet.ch;
    let i = 0;
    const id = setInterval(() => {
      const f = list[i % list.length]; x.clearRect(0, 0, cv.width, cv.height);
      x.drawImage(sheet.canvas, f.frame.x, f.frame.y, f.frame.w, f.frame.h, Math.floor((cv.width - f.frame.w) / 2), Math.floor((cv.height - f.frame.h) / 2), f.frame.w, f.frame.h);
      i += 1;
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [sheet, fps]);

  function cssSprite() {
    const lines = [`.sprite { background-image: url(spritesheet.png); background-repeat: no-repeat; display: inline-block; }`];
    Object.entries(sheet.meta.frames).forEach(([n, f]) => lines.push(`.sprite-${n.replace(/[^a-z0-9_-]/gi, '-')} { width: ${f.frame.w}px; height: ${f.frame.h}px; background-position: -${f.frame.x}px -${f.frame.y}px; }`));
    return lines.join('\n');
  }

  async function splitZip() {
    const { img } = splitSrc; const { zipSync } = await import('fflate');
    const fw = img.naturalWidth / grid.cols; const fh = img.naturalHeight / grid.rows; const files = {};
    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        const cv = document.createElement('canvas'); cv.width = Math.round(fw); cv.height = Math.round(fh);
        cv.getContext('2d').drawImage(img, c * fw, r * fh, fw, fh, 0, 0, cv.width, cv.height);
        const b = await new Promise((res) => cv.toBlob(res, 'image/png')); // eslint-disable-line no-await-in-loop
        files[`frame_${String(r * grid.cols + c + 1).padStart(3, '0')}.png`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }]; // eslint-disable-line no-await-in-loop
      }
    }
    blobDownload(new Blob([zipSync(files)], { type: 'application/zip' }), `${splitSrc.name}-frames.zip`);
  }

  const num = (label, v, setV, min, max) => (
    <label className="tool-field"><span className="tool-field-label">{label}: {v}</span><input type="range" min={min} max={max} value={v} onChange={(e) => setV(Number(e.target.value))} /></label>
  );

  return (
    <div className="tool-panel sprite-sheet">
      <div className="segmented">{[['build', t.build], ['split', t.split]].map(([id, l]) => <button key={id} type="button" className={mode === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode(id)}>{l}</button>)}</div>
      {mode === 'build' ? (
        <>
          <button type="button" className="tool-dropzone ss-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFrames(e.dataTransfer.files); }}>
            <span className="tool-dropzone-title">{t.drop}</span>
            <span className="tool-dropzone-hint">{t.frames(frames.length)}</span>
          </button>
          {sheet && (
            <div className="vz-layout">
              <div className="vz-view">
                <div className="ss-sheet"><img src={sheet.canvas.toDataURL('image/png')} alt="" /></div>
                <p className="tool-local-note">{t.sheet(sheet.canvas.width, sheet.canvas.height)} · {t.frames(frames.length)}</p>
                <div className="tool-actions">
                  <button type="button" className="tool-btn primary" onClick={() => sheet.canvas.toBlob((b) => blobDownload(b, 'spritesheet.png'), 'image/png')}>{t.png}</button>
                  <button type="button" className="tool-btn" onClick={() => blobDownload(new Blob([JSON.stringify(sheet.meta, null, 2)], { type: 'application/json' }), 'spritesheet.json')}>{t.json}</button>
                  <button type="button" className="tool-btn" onClick={() => blobDownload(new Blob([cssSprite()], { type: 'text/css' }), 'spritesheet.css')}>{t.css}</button>
                  <button type="button" className="tool-btn ghost" onClick={() => setFrames([])}>{t.clear}</button>
                </div>
              </div>
              <div className="vz-controls">
                <div className="ss-anim"><canvas ref={animRef} /></div>
                {num(t.fps, fps, setFps, 1, 60)}
                {num(t.cols, cols, setCols, 0, 32)}
                {num(t.padding, padding, setPadding, 0, 16)}
                <label className="tool-check"><input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> {t.trim}</label>
                <label className="tool-check"><input type="checkbox" checked={usePot} onChange={(e) => setUsePot(e.target.checked)} /> {t.pot}</label>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <button type="button" className="tool-dropzone ss-drop" onClick={() => sheetInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadImg(f).then(setSplitSrc); }}>
            <span className="tool-dropzone-title">{t.dropSheet}</span>
          </button>
          {splitSrc && (
            <>
              <div className="ss-sheet ss-split" style={{ '--r': grid.rows, '--c': grid.cols }}><img src={splitSrc.url} alt="" /><span className="ss-grid" /></div>
              <div className="tool-controls">
                {num(t.rows, grid.rows, (v) => setGrid((g) => ({ ...g, rows: v })), 1, 32)}
                {num(t.columns, grid.cols, (v) => setGrid((g) => ({ ...g, cols: v })), 1, 32)}
              </div>
              <button type="button" className="tool-btn primary" onClick={splitZip}>{t.zip} ({grid.rows * grid.cols})</button>
            </>
          )}
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFrames(e.target.files); e.target.value = ''; }} />
      <input ref={sheetInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; if (f) loadImg(f).then(setSplitSrc); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default SpriteSheet;
