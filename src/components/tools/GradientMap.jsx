import { useEffect, useRef, useState } from 'react';
import CompareSlider from './shared/CompareSlider';
import { GRADIENT_PRESETS, applyRamp, buildRamp, perceptualLuma, rampToCss, stopsFromList } from '../../utils/gradientMap';
import { buildLut, downloadText, writeCube } from '../../utils/lut';
import { extractPalette, imageToData } from '../../utils/paletteEngine';

// Gradient Map: перекрашивает фото по яркости через многоцветный градиент (как
// корректирующий слой Gradient Map в Photoshop). Градиент — пресеты, свой из
// точек или «из фото»: палитра второй картинки, упорядоченная по светлоте.
// Экспорт PNG, CSS-градиента и LUT .cube для видео/Lightroom/Resolve.

const TEXT = {
  ru: {
    drop: 'Загрузите фото', hint: 'PNG, JPG, WebP — обрабатывается локально', presets: 'Пресеты', stops: 'Точки градиента',
    add: '+ точка', fromPhoto: 'Градиент из другого фото', mix: 'Сила', contrast: 'Контраст', invert: 'Инвертировать',
    download: 'Скачать PNG', css: 'CSS-градиент', cube: 'LUT .cube', copied: 'Скопировано', change: 'Другое фото', before: 'Оригинал', after: 'Gradient map',
    note: 'Цвета смешиваются в OKLab, яркость — перцептивная. LUT повторит эффект в Premiere, DaVinci, Lightroom, Photoshop.',
  },
  en: {
    drop: 'Upload a photo', hint: 'PNG, JPG, WebP — processed locally', presets: 'Presets', stops: 'Gradient stops',
    add: '+ stop', fromPhoto: 'Gradient from another photo', mix: 'Strength', contrast: 'Contrast', invert: 'Invert',
    download: 'Download PNG', css: 'CSS gradient', cube: 'LUT .cube', copied: 'Copied', change: 'Another photo', before: 'Original', after: 'Gradient map',
    note: 'Colors blend in OKLab, luminance is perceptual. The LUT reproduces the effect in Premiere, DaVinci, Lightroom, Photoshop.',
  },
};

function GradientMap({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const refInputRef = useRef(null);
  const imgRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [outUrl, setOutUrl] = useState('');
  const [stops, setStops] = useState(() => stopsFromList(GRADIENT_PRESETS[0].stops));
  const [mix, setMix] = useState(1);
  const [contrast, setContrast] = useState(0);
  const [invert, setInvert] = useState(false);
  const [copied, setCopied] = useState(false);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setSrcUrl((p) => { if (p) URL.revokeObjectURL(p); return url; }); };
    img.src = url;
  }

  // Градиент из палитры второго фото: цвета по возрастанию светлоты.
  function loadReference(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const { colors } = extractPalette(imageToData(img, 200), 5);
      const sorted = [...colors].sort((a, b) => a.L - b.L).map((c) => c.hex);
      setStops(stopsFromList(sorted));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  useEffect(() => {
    const img = imgRef.current; if (!img || !srcUrl) return undefined;
    const timer = setTimeout(() => {
      const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.putImageData(applyRamp(ctx.getImageData(0, 0, c.width, c.height), buildRamp(stops), { contrast, invert, mix }), 0, 0);
      c.toBlob((b) => setOutUrl((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(b); }), 'image/png');
    }, 120);
    return () => clearTimeout(timer);
  }, [srcUrl, stops, mix, contrast, invert]);

  function download() {
    const img = imgRef.current;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    ctx.putImageData(applyRamp(ctx.getImageData(0, 0, c.width, c.height), buildRamp(stops), { contrast, invert, mix }), 0, 0);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'gradient-map.png'; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }
  function exportCube() {
    const ramp = buildRamp(stops); const k = 1 + contrast / 100;
    const lut = buildLut(([r, g, b]) => {
      let v = perceptualLuma(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
      v = Math.max(0, Math.min(1, (v - 0.5) * k + 0.5)); if (invert) v = 1 - v;
      const j = Math.round(v * 255) * 3;
      return [r + (ramp[j] / 255 - r) * mix, g + (ramp[j + 1] / 255 - g) * mix, b + (ramp[j + 2] / 255 - b) * mix];
    }, 33);
    downloadText(writeCube(lut, 'Vetor Gradient Map'), 'gradient-map.cube');
  }
  function copyCss() { navigator.clipboard?.writeText(`background: ${rampToCss(stops)};`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }

  const patchStop = (i, p) => setStops((prev) => prev.map((s, k) => (k === i ? { ...s, ...p } : s)));

  return (
    <div className="tool-panel gradient-map">
      {!srcUrl ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            {outUrl ? <CompareSlider before={srcUrl} after={outUrl} language={language} beforeLabel={t.before} afterLabel={t.after} /> : <img src={srcUrl} alt="" className="bgr-img" />}
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>
              <button type="button" className="tool-btn" onClick={exportCube}>{t.cube}</button>
              <button type="button" className="tool-btn" onClick={copyCss}>{copied ? `✓ ${t.copied}` : t.css}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="gm-bar" style={{ background: rampToCss(stops) }} />
            <div className="tool-field">
              <span className="tool-field-label">{t.presets}</span>
              <div className="gm-presets">
                {GRADIENT_PRESETS.map((p) => (
                  <button key={p.id} type="button" className="gm-preset" onClick={() => setStops(stopsFromList(p.stops))} title={p[language] || p.ru}>
                    <span style={{ background: `linear-gradient(90deg, ${p.stops.join(',')})` }} />
                    {p[language] || p.ru}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="tool-btn small" onClick={() => refInputRef.current?.click()}>🖼 {t.fromPhoto}</button>
            <div className="tool-field">
              <span className="tool-field-label">{t.stops}</span>
              {stops.map((s, i) => (
                <div key={i} className="gm-stop">
                  <input type="color" value={s.color} onChange={(e) => patchStop(i, { color: e.target.value })} />
                  <input type="range" min="0" max="1" step="0.01" value={s.pos} onChange={(e) => patchStop(i, { pos: Number(e.target.value) })} />
                  <span className="gm-pos">{Math.round(s.pos * 100)}%</span>
                  {stops.length > 2 && <button type="button" className="tool-btn small ghost" onClick={() => setStops((prev) => prev.filter((_, k) => k !== i))}>✕</button>}
                </div>
              ))}
              {stops.length < 8 && <button type="button" className="tool-btn small" onClick={() => setStops((prev) => [...prev, { pos: 0.5, color: '#888888' }])}>{t.add}</button>}
            </div>
            <label className="tool-field"><span className="tool-field-label">{t.mix}: {Math.round(mix * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix} onChange={(e) => setMix(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.contrast}: {contrast}</span><input type="range" min="-60" max="80" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /></label>
            <label className="tool-check"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> {t.invert}</label>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <input ref={refInputRef} type="file" accept="image/*" hidden onChange={(e) => { loadReference(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default GradientMap;
