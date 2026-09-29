import { useCallback, useEffect, useRef, useState } from 'react';
import { applyRamp, buildRamp, perceptualLuma } from '../../utils/gradientMap';
import { buildLut, downloadText, writeCube } from '../../utils/lut';

// Дуотон / тритон: перекрашивает фото в два-три цвета по яркости — тени, (средние)
// и света. Яркость перцептивная (из линейной светимости), цвета смешиваются в OKLab,
// поэтому переходы чистые, без серой «грязи» посередине. Экспорт PNG и LUT .cube.

const TEXT = {
  ru: { drop: 'Перетащите фото или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально', shadow: 'Тени', mid: 'Средние', light: 'Света', tritone: 'Тритон (третий цвет)', contrast: 'Контраст', mix: 'Сила', invert: 'Инверсия', presets: 'Пресеты', change: 'Другое', save: 'Скачать PNG', cube: 'LUT .cube', note: 'Яркость считается перцептивно, цвета смешиваются в OKLab. Всё локально, файлы не уходят на сервер.' },
  en: { drop: 'Drop a photo or click', hint: 'PNG, JPG, WebP — processed locally', shadow: 'Shadows', mid: 'Midtones', light: 'Highlights', tritone: 'Tritone (third color)', contrast: 'Contrast', mix: 'Strength', invert: 'Invert', presets: 'Presets', change: 'Another', save: 'Download PNG', cube: 'LUT .cube', note: 'Luminance is perceptual, colors blend in OKLab. All local, nothing is uploaded.' },
};

const PRESETS = [
  ['#181450', '#ff8bd0'], ['#1e1bd6', '#ff4d8d'], ['#0f3d2e', '#c8f560'], ['#2b0f54', '#ffb347'],
  ['#101820', '#f2aa4c'], ['#00203f', '#adefd1'], ['#3a0ca3', '#4cc9f0'], ['#232323', '#e8d5b7'],
];

function Duotone({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [src, setSrc] = useState('');
  const [shadow, setShadow] = useState('#181450');
  const [mid, setMid] = useState('#b0306a');
  const [light, setLight] = useState('#ff8bd0');
  const [tritone, setTritone] = useState(false);
  const [contrast, setContrast] = useState(0);
  const [mix, setMix] = useState(1);
  const [invert, setInvert] = useState(false);

  const stops = () => (tritone
    ? [{ pos: 0, color: shadow }, { pos: 0.5, color: mid }, { pos: 1, color: light }]
    : [{ pos: 0, color: shadow }, { pos: 1, color: light }]);

  const render = useCallback(() => {
    const img = imgRef.current; const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * s); canvas.height = Math.round(img.naturalHeight * s);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.putImageData(applyRamp(ctx.getImageData(0, 0, canvas.width, canvas.height), buildRamp(stops()), { contrast, invert, mix }), 0, 0);
  }, [shadow, mid, light, tritone, contrast, invert, mix]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (src) render(); }, [src, render]);

  function loadFile(file) { if (!file || !file.type.startsWith('image/')) return; const url = URL.createObjectURL(file); setSrc(url); const img = new Image(); img.onload = () => { imgRef.current = img; render(); }; img.src = url; }
  function save() {
    // Экспорт в полном разрешении, а не размер превью.
    const img = imgRef.current;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    ctx.putImageData(applyRamp(ctx.getImageData(0, 0, c.width, c.height), buildRamp(stops()), { contrast, invert, mix }), 0, 0);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'duotone.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png');
  }
  function exportCube() {
    const ramp = buildRamp(stops()); const k = 1 + contrast / 100;
    const lut = buildLut(([r, g, b]) => {
      let v = perceptualLuma(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
      v = Math.max(0, Math.min(1, (v - 0.5) * k + 0.5)); if (invert) v = 1 - v;
      const j = Math.round(v * 255) * 3;
      return [r + (ramp[j] / 255 - r) * mix, g + (ramp[j + 1] / 255 - g) * mix, b + (ramp[j + 2] / 255 - b) * mix];
    });
    downloadText(writeCube(lut, 'Vetor Duotone'), tritone ? 'tritone.cube' : 'duotone.cube');
  }

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
            <div className="tool-field">
              <span className="tool-field-label">{t.presets}</span>
              <div className="gm-presets">
                {PRESETS.map(([a, b]) => (
                  <button key={a + b} type="button" className="gm-preset" onClick={() => { setShadow(a); setLight(b); }}>
                    <span style={{ background: `linear-gradient(90deg, ${a}, ${b})` }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="t3-row">
              <label className="t3-color"><span className="tool-field-label">{t.shadow}</span><input type="color" value={shadow} onChange={(e) => setShadow(e.target.value)} /></label>
              {tritone && <label className="t3-color"><span className="tool-field-label">{t.mid}</span><input type="color" value={mid} onChange={(e) => setMid(e.target.value)} /></label>}
              <label className="t3-color"><span className="tool-field-label">{t.light}</span><input type="color" value={light} onChange={(e) => setLight(e.target.value)} /></label>
            </div>
            <label className="tool-check"><input type="checkbox" checked={tritone} onChange={(e) => setTritone(e.target.checked)} /> {t.tritone}</label>
            <label className="tool-field"><span className="tool-field-label">{t.contrast}: {contrast > 0 ? `+${contrast}` : contrast}</span><input type="range" min="-60" max="80" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.mix}: {Math.round(mix * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix} onChange={(e) => setMix(Number(e.target.value))} /></label>
            <label className="tool-check"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> {t.invert}</label>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
              <button type="button" className="tool-btn" onClick={exportCube}>{t.cube}</button>
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
