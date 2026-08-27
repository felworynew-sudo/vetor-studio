import { useCallback, useEffect, useRef, useState } from 'react';

// Дуотон: перекрашивает фото в два цвета — тёмный тон в цвет теней, светлый в
// цвет светов, по яркости пикселя. Трендовый эфф", для обложек и постеров.
// Живой предпросмотр, экспорт PNG. Локально.

const TEXT = {
  ru: { drop: 'Перетащите фото или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально', shadow: 'Тени', light: 'Света', contrast: 'Контраст', invert: 'Инверсия', change: 'Другое', save: 'Скачать PNG', note: 'Дуотон считается по яркости пикселей. Всё локально, файлы не уходят на сервер.' },
  en: { drop: 'Drop a photo or click', hint: 'PNG, JPG, WebP — processed locally', shadow: 'Shadows', light: 'Highlights', contrast: 'Contrast', invert: 'Invert', change: 'Another', save: 'Download PNG', note: 'Duotone maps pixel luminance. All local, nothing is uploaded.' },
};

const hexRGB = (h) => { const s = h.replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };

function Duotone({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [src, setSrc] = useState('');
  const [shadow, setShadow] = useState('#181450');
  const [light, setLight] = useState('#ff8bd0');
  const [contrast, setContrast] = useState(0);
  const [invert, setInvert] = useState(false);

  const render = useCallback(() => {
    const img = imgRef.current; const canvas = canvasRef.current;
    if (!img || !canvas) return;
    let w = img.naturalWidth; let h = img.naturalHeight;
    const cap = 1600; const s = Math.min(1, cap / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h); const d = id.data;
    const [sr, sg, sb] = hexRGB(shadow); const [lr, lg, lb] = hexRGB(light);
    const con = 1 + contrast / 100;
    for (let i = 0; i < d.length; i += 4) {
      let lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      lum = Math.max(0, Math.min(1, (lum - 0.5) * con + 0.5));
      if (invert) lum = 1 - lum;
      d[i] = sr + (lr - sr) * lum; d[i + 1] = sg + (lg - sg) * lum; d[i + 2] = sb + (lb - sb) * lum;
    }
    ctx.putImageData(id, 0, 0);
  }, [shadow, light, contrast, invert]);

  useEffect(() => { if (src) render(); }, [src, render]);

  function loadFile(file) { if (!file || !file.type.startsWith('image/')) return; const url = URL.createObjectURL(file); setSrc(url); const img = new Image(); img.onload = () => { imgRef.current = img; render(); }; img.src = url; }
  function save() { canvasRef.current?.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'duotone.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png'); }

  return (
    <div className="tool-panel duotone">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="iso-layout">
          <div className="iso-stage" style={{ padding: 12 }}><canvas ref={canvasRef} className="grade-canvas" /></div>
          <div className="iso-controls">
            <div className="t3-row">
              <label className="t3-color"><span className="tool-field-label">{t.shadow}</span><input type="color" value={shadow} onChange={(e) => setShadow(e.target.value)} /></label>
              <label className="t3-color"><span className="tool-field-label">{t.light}</span><input type="color" value={light} onChange={(e) => setLight(e.target.value)} /></label>
            </div>
            <label className="tool-field"><span className="tool-field-label">{t.contrast}: {contrast > 0 ? `+${contrast}` : contrast}</span><input type="range" min="-60" max="80" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
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

export default Duotone;
