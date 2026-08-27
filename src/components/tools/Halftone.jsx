import { useCallback, useEffect, useRef, useState } from 'react';

// Halftone (полутон): картинка превращается в сетку точек — темнее пиксель,
// крупнее точка. Классический газетно-комиксный эффект. Угол сетки, шаг, цвет,
// инверсия, форма (точка/квадрат). Живой предпросмотр, экспорт PNG. Локально.

const TEXT = {
  ru: { drop: 'Перетащите картинку или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально', gap: 'Шаг сетки', angle: 'Угол', color: 'Цвет точек', bg: 'Фон', invert: 'Инверсия', shape: 'Форма', dot: 'Точка', sq: 'Квадрат', change: 'Другое', save: 'Скачать PNG', note: 'Полутон считается по яркости. Всё локально, файлы не уходят на сервер.' },
  en: { drop: 'Drop an image or click', hint: 'PNG, JPG, WebP — processed locally', gap: 'Grid step', angle: 'Angle', color: 'Dot color', bg: 'Background', invert: 'Invert', shape: 'Shape', dot: 'Dot', sq: 'Square', change: 'Another', save: 'Download PNG', note: 'Halftone maps luminance. All local, nothing is uploaded.' },
};

function Halftone({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [src, setSrc] = useState('');
  const [gap, setGap] = useState(8);
  const [angle, setAngle] = useState(45);
  const [color, setColor] = useState('#0d0d11');
  const [bg, setBg] = useState('#ffffff');
  const [invert, setInvert] = useState(false);
  const [square, setSquare] = useState(false);

  const render = useCallback(() => {
    const img = imgRef.current; const canvas = canvasRef.current; if (!img || !canvas) return;
    let w = img.naturalWidth; let h = img.naturalHeight; const cap = 1400; const s = Math.min(1, cap / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
    // офскрин для сэмплинга яркости
    const off = document.createElement('canvas'); off.width = w; off.height = h; const octx = off.getContext('2d'); octx.drawImage(img, 0, 0, w, h);
    const data = octx.getImageData(0, 0, w, h).data;
    canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = color;
    const g = Math.max(3, gap); const rad = (angle * Math.PI) / 180; const cos = Math.cos(rad); const sin = Math.sin(rad);
    const cx = w / 2; const cy = h / 2; const diag = Math.ceil(Math.hypot(w, h) / g) + 2; const maxR = g * 0.72;
    for (let j = -diag; j <= diag; j += 1) {
      for (let i = -diag; i <= diag; i += 1) {
        // повёрнутая сетка
        const px = cx + (i * g) * cos - (j * g) * sin; const py = cy + (i * g) * sin + (j * g) * cos;
        const ix = Math.round(px); const iy = Math.round(py); if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
        const o = (iy * w + ix) * 4; let lum = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
        if (invert) lum = 1 - lum;
        const r = (1 - lum) * maxR; if (r < 0.4) continue;
        if (square) { ctx.save(); ctx.translate(px, py); ctx.rotate(rad); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }, [gap, angle, color, bg, invert, square]);

  useEffect(() => { if (src) render(); }, [src, render]);

  function loadFile(file) { if (!file || !file.type.startsWith('image/')) return; const url = URL.createObjectURL(file); setSrc(url); const img = new Image(); img.onload = () => { imgRef.current = img; render(); }; img.src = url; }
  function save() { canvasRef.current?.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'halftone.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png'); }

  return (
    <div className="tool-panel halftone">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="iso-layout">
          <div className="iso-stage" style={{ padding: 12, background: 'var(--surface-strong)' }}><canvas ref={canvasRef} className="grade-canvas" /></div>
          <div className="iso-controls">
            <label className="tool-field"><span className="tool-field-label">{t.gap}: {gap}px</span><input type="range" min="4" max="24" value={gap} onChange={(e) => setGap(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.angle}: {angle}°</span><input type="range" min="0" max="90" value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></label>
            <div className="t3-row">
              <label className="t3-color"><span className="tool-field-label">{t.color}</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
              <label className="t3-color"><span className="tool-field-label">{t.bg}</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
            </div>
            <div className="tool-field"><span className="tool-field-label">{t.shape}</span>
              <div className="segmented">
                <button type="button" className={!square ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSquare(false)}>{t.dot}</button>
                <button type="button" className={square ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSquare(true)}>{t.sq}</button>
              </div>
            </div>
            <label className="rec-opt"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> {t.invert}</label>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Halftone;
