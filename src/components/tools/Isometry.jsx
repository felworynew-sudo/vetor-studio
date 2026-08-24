import { useCallback, useEffect, useRef, useState } from 'react';

// Изометрия: превращает плоскую картинку/SVG в изометрическую проекцию (2:1)
// и экспортирует PNG. Грани: верх / левая / правая. Фон — цвет или прозрачный.

// Матрицы 2:1 изометрии [a,b,c,d].
const FACES = {
  top: { ru: 'Верх', en: 'Top', m: [0.866, 0.5, -0.866, 0.5] },
  left: { ru: 'Левая грань', en: 'Left face', m: [0.866, 0.5, 0, 1] },
  right: { ru: 'Правая грань', en: 'Right face', m: [0.866, -0.5, 0, 1] },
};

const TEXT = {
  ru: {
    drop: 'Загрузите картинку или SVG', hint: 'PNG, JPG, WebP, SVG — обрабатывается локально',
    face: 'Грань', bg: 'Фон', transparent: 'Прозрачный', change: 'Другое', download: 'Скачать PNG',
    hint2: 'Плоская проекция «наклоняется» в изометрию. Удобно для иконок и мокапов.',
  },
  en: {
    drop: 'Upload an image or SVG', hint: 'PNG, JPG, WebP, SVG — processed locally',
    face: 'Face', bg: 'Background', transparent: 'Transparent', change: 'Another', download: 'Download PNG',
    hint2: 'A flat projection is tilted into isometric. Handy for icons and mockups.',
  },
};

function Isometry({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const [face, setFace] = useState('top');
  const [bg, setBg] = useState('#0d0d11');
  const [transparent, setTransparent] = useState(true);
  const [ready, setReady] = useState(false);

  const render = useCallback((faceKey, bgColor, isTransparent) => {
    const img = imgRef.current; const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const [a, b, c, d] = FACES[faceKey].m;
    const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
    const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => [a * x + c * y, b * x + d * y]);
    const xs = corners.map((p) => p[0]); const ys = corners.map((p) => p[1]);
    const minx = Math.min(...xs); const maxx = Math.max(...xs);
    const miny = Math.min(...ys); const maxy = Math.max(...ys);
    const pad = 20;
    canvas.width = Math.ceil(maxx - minx) + pad * 2;
    canvas.height = Math.ceil(maxy - miny) + pad * 2;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!isTransparent) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.setTransform(a, b, c, d, -minx + pad, -miny + pad);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, []);

  useEffect(() => { if (ready) render(face, bg, transparent); }, [face, bg, transparent, ready, render]);

  function loadFile(file) {
    if (!file) return;
    const isSvg = file.type.includes('svg') || /\.svg$/i.test(file.name);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Для SVG без явных размеров задаём базовый размер.
      if (isSvg && (!img.naturalWidth || !img.naturalHeight)) { img.width = 512; img.height = 512; }
      imgRef.current = img; setReady(true); render(face, bg, transparent);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function download() {
    canvasRef.current?.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'isometric.png';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  return (
    <div className="tool-panel isometry">
      {!ready ? (
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
              <span className="tool-field-label">{t.face}</span>
              <div className="segmented">
                {Object.entries(FACES).map(([k, v]) => (
                  <button key={k} type="button" className={k === face ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFace(k)}>{v[language] || v.ru}</button>
                ))}
              </div>
            </div>
            <label className="wm-check"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />{t.transparent}</label>
            {!transparent && (
              <div className="tool-field">
                <span className="tool-field-label">{t.bg}</span>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              </div>
            )}
          </div>

          <div className="iso-canvas-wrap"><canvas ref={canvasRef} className="iso-canvas" /></div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*,.svg" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">📐 {t.hint2}</p>
    </div>
  );
}

export default Isometry;
