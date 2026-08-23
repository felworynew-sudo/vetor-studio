import { useCallback, useEffect, useRef, useState } from 'react';

// Симулятор «электронных чернил» (E-Ink): как интерфейс выглядит на монохромном
// экране ридера. Оттенки серого, 1-бит порог и дизеринг Флойда–Стейнберга.

const MODES = [
  { id: 'gray', ru: 'Оттенки серого', en: 'Grayscale' },
  { id: 'threshold', ru: '1-бит (порог)', en: '1-bit (threshold)' },
  { id: 'dither', ru: 'Дизеринг', en: 'Dithering' },
];

const TEXT = {
  ru: { drop: 'Загрузите скриншот интерфейса', hint: 'PNG, JPG, WebP — обрабатывается локально', mode: 'Режим', threshold: 'Порог', change: 'Другое', download: 'Скачать PNG', note: 'Проверьте, что важные элементы читаются без цвета.' },
  en: { drop: 'Upload a UI screenshot', hint: 'PNG, JPG, WebP — processed locally', mode: 'Mode', threshold: 'Threshold', change: 'Another', download: 'Download PNG', note: 'Check that key elements read without color.' },
};

function toGray(d) {
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g; d[i + 1] = g; d[i + 2] = g;
  }
}

function EinkSimulator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [mode, setMode] = useState('dither');
  const [threshold, setThreshold] = useState(128);
  const [ready, setReady] = useState(false);

  const render = useCallback((m, th) => {
    const canvas = canvasRef.current; const img = imgRef.current;
    if (!canvas || !img) return;
    const maxW = 900;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    toGray(d);
    const w = canvas.width; const h = canvas.height;
    if (m === 'threshold') {
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] >= th ? 255 : 0;
        d[i] = v; d[i + 1] = v; d[i + 2] = v;
      }
    } else if (m === 'dither') {
      // Флойд–Стейнберг по яркости
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const old = d[i];
          const nv = old < 128 ? 0 : 255;
          const err = old - nv;
          d[i] = d[i + 1] = d[i + 2] = nv;
          const spread = (xx, yy, f) => {
            if (xx < 0 || xx >= w || yy < 0 || yy >= h) return;
            const j = (yy * w + xx) * 4;
            const val = d[j] + err * f;
            d[j] = d[j + 1] = d[j + 2] = val;
          };
          spread(x + 1, y, 7 / 16);
          spread(x - 1, y + 1, 3 / 16);
          spread(x, y + 1, 5 / 16);
          spread(x + 1, y + 1, 1 / 16);
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  useEffect(() => { if (ready) render(mode, threshold); }, [mode, threshold, ready, render]);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setReady(true); render(mode, threshold); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function download() {
    canvasRef.current?.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'eink.png';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  return (
    <div className="tool-panel eink-sim">
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
              <span className="tool-field-label">{t.mode}</span>
              <div className="segmented">
                {MODES.map((m) => (
                  <button key={m.id} type="button" className={m.id === mode ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode(m.id)}>{m[language] || m.ru}</button>
                ))}
              </div>
            </div>
            {mode === 'threshold' && (
              <div className="tool-field">
                <span className="tool-field-label">{t.threshold}: {threshold}</span>
                <input type="range" min="0" max="255" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
              </div>
            )}
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
