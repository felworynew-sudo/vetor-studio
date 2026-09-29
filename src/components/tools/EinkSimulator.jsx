import { useEffect, useRef, useState } from 'react';
import { METHODS, PALETTES, adjustImage, ditherImage, paletteFromHex } from '../../utils/dither';

// Симулятор «электронных чернил» (E-Ink): как интерфейс выглядит на экране ридера.
// Дисплеи: 16 серых (Kindle/Kobo), 4 серых (старые ридеры), 1-бит, цветной e-ink
// (Spectra/Kaleido — 7 красок). Любой из 13 методов дизеринга общего движка,
// оттенок бумаги и контраст. Локально.

const DISPLAYS = [
  { id: 'g16', ru: '16 серых (Kindle)', en: '16 grays (Kindle)', pal: PALETTES.eink.c },
  { id: 'g4', ru: '4 серых', en: '4 grays', pal: PALETTES.gray4.c },
  { id: 'bw', ru: '1-бит', en: '1-bit', pal: PALETTES.bw.c },
  { id: 'color', ru: 'Цветной e-ink', en: 'Color e-ink', pal: PALETTES.eink7.c },
];

const TEXT = {
  ru: {
    drop: 'Загрузите скриншот интерфейса', hint: 'PNG, JPG, WebP — обрабатывается локально', display: 'Экран', method: 'Дизеринг',
    paper: 'Цвет бумаги (не чисто белый)', contrast: 'Контраст', brightness: 'Яркость', change: 'Другое', download: 'Скачать PNG',
    note: 'Проверьте, что важные элементы читаются без цвета и на грубой шкале серого.',
  },
  en: {
    drop: 'Upload a UI screenshot', hint: 'PNG, JPG, WebP — processed locally', display: 'Display', method: 'Dithering',
    paper: 'Paper tint (not pure white)', contrast: 'Contrast', brightness: 'Brightness', change: 'Another', download: 'Download PNG',
    note: 'Check that key elements read without color and on a coarse gray scale.',
  },
};

// Бумага e-ink не белая и не чёрная: слегка тёплый светлый и графитовый тёмный.
function paperTint(imageData) {
  const d = imageData.data;
  const lo = [38, 38, 36]; const hi = [226, 223, 214];
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c += 1) d[i + c] = lo[c] + (d[i + c] / 255) * (hi[c] - lo[c]);
  }
  return imageData;
}

function EinkSimulator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [display, setDisplay] = useState('g16');
  const [method, setMethod] = useState('floyd');
  const [paper, setPaper] = useState(true);
  const [contrast, setContrast] = useState(0);
  const [brightness, setBrightness] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current; const img = imgRef.current;
    if (!ready || !canvas || !img) return;
    const scale = Math.min(1, 1000 / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const disp = DISPLAYS.find((d) => d.id === display);
    let data = adjustImage(ctx.getImageData(0, 0, canvas.width, canvas.height), { contrast, brightness });
    if (display !== 'color') {
      // Монохромный экран: сначала в серое по яркости Rec. 709.
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) { const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; d[i] = g; d[i + 1] = g; d[i + 2] = g; }
    }
    data = ditherImage(data, paletteFromHex(disp.pal), { method });
    if (paper) data = paperTint(data);
    ctx.putImageData(data, 0, 0);
  }, [ready, display, method, paper, contrast, brightness]);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setReady(false); setTimeout(() => setReady(true)); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function download() {
    canvasRef.current?.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `eink-${display}-${method}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  return (
    <div className="tool-panel eink-sim">
      {!imgRef.current ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="tool-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.display}</span>
              <div className="segmented">
                {DISPLAYS.map((d) => <button key={d.id} type="button" className={d.id === display ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setDisplay(d.id)}>{d[language] || d.ru}</button>)}
              </div>
            </div>
            <label className="tool-field"><span className="tool-field-label">{t.method}</span>
              <select className="cb-select" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m[language] || m.ru}</option>)}
              </select>
            </label>
            <label className="tool-field"><span className="tool-field-label">{t.contrast}: {contrast}</span><input type="range" min="-50" max="100" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.brightness}: {brightness}</span><input type="range" min="-50" max="50" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} /></label>
            <label className="tool-check"><input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} /> {t.paper}</label>
          </div>
          <div className="cb-canvas-wrap"><canvas ref={canvasRef} className="cb-canvas eink-canvas" /></div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🖨️ {t.note}</p>
    </div>
  );
}

export default EinkSimulator;
