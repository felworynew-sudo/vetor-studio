import { useEffect, useRef, useState } from 'react';
import CompareSlider from './CompareSlider';
import { METHODS, PALETTES, adjustImage, buildPalette, ditherImage, paletteFromHex } from '../../../utils/dither';
import { rgbToHex } from '../../../utils/oklab';

// Общая студия квантизации/дизеринга для двух страниц:
//  • variant="quantize" — «Квантизатор / постеризатор»: упор на число цветов и палитру;
//  • variant="dither" — «Dithering Lab»: упор на алгоритмы, ретро-палитры и пиксель.

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    source: 'Палитра', fromImage: 'Из изображения', preset: 'Готовая', duo: 'Два цвета', colors: 'Цветов', algo: 'Алгоритм палитры',
    method: 'Дизеринг', strength: 'Сила', serpentine: 'Змейкой (меньше «червяков»)', pixel: 'Размер пикселя', work: 'Рабочий размер',
    brightness: 'Яркость', contrast: 'Контраст', gamma: 'Гамма', dark: 'Тёмный', light: 'Светлый',
    download: 'Скачать PNG', copyPal: 'Копировать палитру', gpl: 'Палитра .gpl', copied: 'Скопировано', change: 'Другое изображение',
    exportSize: 'Экспорт', exportOrig: 'в размере оригинала', exportPx: 'пиксель в пиксель', before: 'Оригинал', after: 'Результат',
    processing: 'Считаю…',
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally',
    source: 'Palette', fromImage: 'From image', preset: 'Preset', duo: 'Two colors', colors: 'Colors', algo: 'Palette algorithm',
    method: 'Dithering', strength: 'Strength', serpentine: 'Serpentine (fewer “worms”)', pixel: 'Pixel size', work: 'Working size',
    brightness: 'Brightness', contrast: 'Contrast', gamma: 'Gamma', dark: 'Dark', light: 'Light',
    download: 'Download PNG', copyPal: 'Copy palette', gpl: 'Palette .gpl', copied: 'Copied', change: 'Another image',
    exportSize: 'Export', exportOrig: 'at original size', exportPx: 'pixel to pixel', before: 'Original', after: 'Result',
    processing: 'Working…',
  },
};

const ALGOS = [
  { id: 'wuquant', label: 'Wu' },
  { id: 'neuquant', label: 'NeuQuant' },
  { id: 'rgbquant', label: 'RGBQuant' },
];

const DEFAULTS = {
  quantize: { source: 'image', colors: 16, method: 'none', strength: 1, pixel: 1 },
  dither: { source: 'preset', colors: 8, method: 'atkinson', strength: 1, pixel: 2, preset: 'bw' },
};

export default function DitherStudio({ language = 'ru', variant = 'quantize', intro }) {
  const t = TEXT[language] || TEXT.ru;
  const d0 = DEFAULTS[variant];
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [source, setSource] = useState(d0.source);
  const [colors, setColors] = useState(d0.colors);
  const [algo, setAlgo] = useState('wuquant');
  const [preset, setPreset] = useState(d0.preset || 'pico8');
  const [duo, setDuo] = useState(['#1b1b3a', '#f2e9dc']);
  const [method, setMethod] = useState(d0.method);
  const [strength, setStrength] = useState(d0.strength);
  const [serpentine, setSerpentine] = useState(true);
  const [pixel, setPixel] = useState(d0.pixel);
  const [workSide, setWorkSide] = useState(1200);
  const [adj, setAdj] = useState({ brightness: 0, contrast: 0, gamma: 1 });
  const [exportMode, setExportMode] = useState('orig');
  const [result, setResult] = useState(null); // { url, canvas, palette, w, h }
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const runRef = useRef(0);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setSrcUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; }); };
    img.src = url;
  }

  useEffect(() => {
    const img = imgRef.current; if (!img || !srcUrl) return undefined;
    const run = ++runRef.current; // eslint-disable-line no-plusplus
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const k = Math.min(1, workSide / Math.max(img.naturalWidth, img.naturalHeight)) / pixel;
        const w = Math.max(1, Math.round(img.naturalWidth * k)); const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const data = adjustImage(ctx.getImageData(0, 0, w, h), adj);
        let palette;
        if (source === 'image') palette = await buildPalette(data, colors, algo);
        else if (source === 'duo') palette = paletteFromHex(duo);
        else palette = paletteFromHex(PALETTES[preset].c);
        if (run !== runRef.current) return;
        const outData = ditherImage(data, palette, { method, strength, serpentine });
        ctx.putImageData(outData, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        if (run !== runRef.current) return;
        setResult((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(blob), canvas: c, palette, w, h }; });
      } catch (e) { console.error(e); } finally { if (run === runRef.current) setBusy(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [srcUrl, source, colors, algo, preset, duo, method, strength, serpentine, pixel, workSide, adj]);

  function download() {
    if (!result) return;
    const img = imgRef.current;
    let c = result.canvas;
    if (exportMode === 'orig') {
      // Увеличиваем «ближайшим соседом», чтобы пиксели и узор дизеринга остались резкими.
      const W = img.naturalWidth; const H = img.naturalHeight;
      c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(result.canvas, 0, 0, W, H);
    }
    c.toBlob((b) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${variant}-${method}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/png');
  }
  const hexes = () => (result ? result.palette.map((p) => rgbToHex(...p)) : []);
  function copyPalette() { navigator.clipboard?.writeText(hexes().join(' ')).then(() => { setCopied('pal'); setTimeout(() => setCopied(''), 1200); }).catch(() => {}); }
  function downloadGpl() {
    const body = `GIMP Palette\nName: Vetor ${variant}\nColumns: 8\n#\n${result.palette.map((p, i) => `${String(p[0]).padStart(3)} ${String(p[1]).padStart(3)} ${String(p[2]).padStart(3)}\t${rgbToHex(...p)} ${i + 1}`).join('\n')}\n`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' })); a.download = 'palette.gpl';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const seg = (value, set, items) => (
    <div className="segmented">
      {items.map(([id, label]) => <button key={id} type="button" className={value === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(id)}>{label}</button>)}
    </div>
  );
  const range = (label, value, set, min, max, step = 1, fmt = (v) => v) => (
    <label className="tool-field"><span className="tool-field-label">{label}: {fmt(value)}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} /></label>
  );

  return (
    <div className="tool-panel dither-studio">
      {intro && <p className="tool-local-note">{intro}</p>}
      {!srcUrl ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            {result ? <CompareSlider before={srcUrl} after={result.url} language={language} beforeLabel={t.before} afterLabel={`${t.after} · ${result.w}×${result.h}`} pixelated /> : <img src={srcUrl} alt="" className="bgr-img" />}
            <div className="vz-status">{busy && <span>⏳ {t.processing}</span>}</div>
            {result && (
              <div className="ds-palette">
                {result.palette.map((p, i) => <span key={i} style={{ background: rgbToHex(...p) }} title={rgbToHex(...p)} />)}
              </div>
            )}
            <div className="tool-field">
              <span className="tool-field-label">{t.exportSize}</span>
              {seg(exportMode, setExportMode, [['orig', t.exportOrig], ['px', t.exportPx]])}
            </div>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={download} disabled={!result}>{t.download}</button>
              <button type="button" className="tool-btn" onClick={copyPalette} disabled={!result}>{copied === 'pal' ? `✓ ${t.copied}` : t.copyPal}</button>
              <button type="button" className="tool-btn" onClick={downloadGpl} disabled={!result}>{t.gpl}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>

          <div className="vz-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.source}</span>
              {seg(source, setSource, [['image', t.fromImage], ['preset', t.preset], ['duo', t.duo]])}
            </div>
            {source === 'image' && (
              <>
                {range(t.colors, colors, setColors, 2, 64)}
                <div className="tool-field"><span className="tool-field-label">{t.algo}</span>{seg(algo, setAlgo, ALGOS.map((a) => [a.id, a.label]))}</div>
              </>
            )}
            {source === 'preset' && (
              <div className="ds-presets">
                {Object.entries(PALETTES).map(([id, p]) => (
                  <button key={id} type="button" className={preset === id ? 'ds-preset is-active' : 'ds-preset'} onClick={() => setPreset(id)}>
                    <span className="ds-preset-sw">{p.c.slice(0, 16).map((c) => <i key={c} style={{ background: c }} />)}</span>
                    {p[language] || p.ru}
                  </button>
                ))}
              </div>
            )}
            {source === 'duo' && (
              <div className="mg-row">
                <label className="tool-field"><span className="tool-field-label">{t.dark}</span><input type="color" value={duo[0]} onChange={(e) => setDuo([e.target.value, duo[1]])} /></label>
                <label className="tool-field"><span className="tool-field-label">{t.light}</span><input type="color" value={duo[1]} onChange={(e) => setDuo([duo[0], e.target.value])} /></label>
              </div>
            )}
            <label className="tool-field"><span className="tool-field-label">{t.method}</span>
              <select className="cb-select" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m.id} value={m.id}>{m[language] || m.ru}</option>)}
              </select>
            </label>
            {method !== 'none' && range(t.strength, strength, setStrength, 0.1, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`)}
            {method !== 'none' && !method.startsWith('bayer') && method !== 'blue' && method !== 'white' && (
              <label className="tool-check"><input type="checkbox" checked={serpentine} onChange={(e) => setSerpentine(e.target.checked)} /> {t.serpentine}</label>
            )}
            {range(t.pixel, pixel, setPixel, 1, 16, 1, (v) => `${v}px`)}
            <div className="tool-field"><span className="tool-field-label">{t.work}</span>{seg(workSide, setWorkSide, [[600, '600'], [1200, '1200'], [2000, '2000']])}</div>
            {range(t.brightness, adj.brightness, (v) => setAdj((a) => ({ ...a, brightness: v })), -50, 50)}
            {range(t.contrast, adj.contrast, (v) => setAdj((a) => ({ ...a, contrast: v })), -50, 100)}
            {range(t.gamma, adj.gamma, (v) => setAdj((a) => ({ ...a, gamma: v })), 0.4, 2.5, 0.05)}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}
