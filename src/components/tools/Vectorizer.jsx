import { useEffect, useRef, useState } from 'react';
import CompareSlider from './shared/CompareSlider';

// Векторизатор PNG/JPG → SVG на VTracer (visioncortex, MIT/Apache-2.0) — аналог
// Image Trace из Illustrator: цветная трассировка с кластеризацией, сплайны или
// полигоны, пиксель-арт, Ч/Б. Трассировка в Web Worker, опционально — SVGO.

const PRESETS = {
  logo: { clustering: 'color-cluster', hierarchical: 'stacked', mode: 'spline', maxColors: 8, filterSpeckle: 6, colorPrecision: 6, layerDifference: 24, cornerThreshold: 60, simplify: 1.2 },
  poster: { preset: 'poster' },
  photo: { preset: 'photo' },
  bw: { preset: 'bw' },
  pixel: { clustering: 'color-cluster', hierarchical: 'stacked', mode: 'pixel', filterSpeckle: 0, colorPrecision: 8, layerDifference: 0 },
};
const PRESET_DEFAULTS = {
  logo: { mode: 'spline', maxColors: 8, filterSpeckle: 6, colorPrecision: 6, layerDifference: 24, cornerThreshold: 60, simplify: 1.2 },
  poster: { mode: 'spline', maxColors: 16, filterSpeckle: 4, colorPrecision: 8, layerDifference: 16, cornerThreshold: 60, simplify: 0.5 },
  photo: { mode: 'spline', maxColors: 0, filterSpeckle: 10, colorPrecision: 8, layerDifference: 48, cornerThreshold: 180, simplify: 0 },
  bw: { mode: 'spline', maxColors: 2, filterSpeckle: 4, colorPrecision: 6, layerDifference: 16, cornerThreshold: 60, simplify: 1 },
  pixel: { mode: 'pixel', maxColors: 0, filterSpeckle: 0, colorPrecision: 8, layerDifference: 0, cornerThreshold: 60, simplify: 0 },
};
const MAX_SIDES = [600, 1000, 1600, 2400];

const TEXT = {
  ru: {
    drop: 'Загрузите PNG или JPG для векторизации', hint: 'Логотипы, иконки, иллюстрации, фото — всё локально',
    preset: 'Пресет', p: { logo: 'Логотип', poster: 'Постер', photo: 'Фото', bw: 'Ч/Б', pixel: 'Пиксель-арт' },
    mode: 'Кривые', m: { spline: 'Сплайны', polygon: 'Полигоны', pixel: 'Пиксели' },
    colors: 'Цветов', auto: 'авто', speckle: 'Убрать пятна меньше', precision: 'Точность цвета', gradient: 'Шаг градиента',
    corner: 'Порог углов', simplify: 'Упрощение кривых', layering: 'Слои', stacked: 'Стопкой', cutout: 'Мозаикой (без перекрытий)',
    maxSide: 'Рабочий размер', svgo: 'Оптимизировать SVGO', download: 'Скачать SVG', copy: 'Копировать SVG', copied: 'Скопировано',
    change: 'Другое изображение', tracing: 'Трассировка…', stats: (n, kb, ms) => `${n} контуров · ${kb} КБ · ${ms} мс`,
    original: 'Растр', vector: 'Вектор',
    note: 'Для логотипов и иконок берите пресет «Логотип» и 2–8 цветов. Большие фото дают тяжёлый SVG — уменьшите рабочий размер.',
  },
  en: {
    drop: 'Upload a PNG or JPG to vectorize', hint: 'Logos, icons, illustrations, photos — all local',
    preset: 'Preset', p: { logo: 'Logo', poster: 'Poster', photo: 'Photo', bw: 'B/W', pixel: 'Pixel art' },
    mode: 'Curves', m: { spline: 'Splines', polygon: 'Polygons', pixel: 'Pixels' },
    colors: 'Colors', auto: 'auto', speckle: 'Remove specks under', precision: 'Color precision', gradient: 'Gradient step',
    corner: 'Corner threshold', simplify: 'Curve simplification', layering: 'Layers', stacked: 'Stacked', cutout: 'Cutout (no overlaps)',
    maxSide: 'Working size', svgo: 'Optimize with SVGO', download: 'Download SVG', copy: 'Copy SVG', copied: 'Copied',
    change: 'Another image', tracing: 'Tracing…', stats: (n, kb, ms) => `${n} paths · ${kb} KB · ${ms} ms`,
    original: 'Raster', vector: 'Vector',
    note: 'For logos and icons use the “Logo” preset with 2–8 colors. Large photos make heavy SVGs — reduce the working size.',
  },
};

let worker = null; let seq = 0; const pending = new Map();
function trace(rgba, width, height, options) {
  if (!worker) {
    worker = new Worker(new URL('../../workers/vtracerWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data); };
  }
  seq += 1; const id = seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, rgba, width, height, options }, [rgba]); });
}

function Vectorizer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [preset, setPreset] = useState('logo');
  const [o, setO] = useState({ ...PRESET_DEFAULTS.logo, hierarchical: 'stacked' });
  const [maxSide, setMaxSide] = useState(1000);
  const [useSvgo, setUseSvgo] = useState(true);
  const [svg, setSvg] = useState('');
  const [svgUrl, setSvgUrl] = useState('');
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const runRef = useRef(0);

  const set = (k, v) => setO((prev) => ({ ...prev, [k]: v }));

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; if (srcUrl) URL.revokeObjectURL(srcUrl); setSrcUrl(url); };
    img.src = url;
  }

  function choosePreset(k) {
    setPreset(k);
    setO((prev) => ({ ...prev, ...PRESET_DEFAULTS[k] }));
  }

  // Перетрассировка с дебаунсом при изменении параметров.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !srcUrl) return undefined;
    const run = ++runRef.current; // eslint-disable-line no-plusplus
    const timer = setTimeout(async () => {
      setBusy(true); setError('');
      try {
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)); const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = o.mode !== 'pixel';
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data.buffer;
        const opts = {
          ...(PRESETS[preset].preset ? { preset: PRESETS[preset].preset } : {}),
          clustering: preset === 'bw' ? 'bw' : 'color-cluster',
          hierarchical: o.hierarchical, mode: o.mode,
          filterSpeckle: o.filterSpeckle, colorPrecision: o.colorPrecision, layerDifference: o.layerDifference,
          cornerThreshold: o.cornerThreshold, simplify: o.simplify,
          ...(o.maxColors ? { maxColors: o.maxColors } : {}),
        };
        const res = await trace(rgba, w, h, opts);
        if (run !== runRef.current) return;
        let out = res.svg;
        if (useSvgo) {
          try {
            const { optimize } = await import('svgo/browser');
            out = optimize(out, { multipass: true, plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }] }).data;
          } catch { /* оставляем как есть */ }
        }
        // Масштабируем обратно к исходному размеру через viewBox — картинку удобно сравнивать.
        if (!/viewBox=/.test(out)) out = out.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
        if (run !== runRef.current) return;
        setSvg(out);
        setSvgUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(new Blob([out], { type: 'image/svg+xml' })); });
        setStats({ paths: (out.match(/<path/g) || []).length, kb: (out.length / 1024).toFixed(1), ms: Math.round(res.ms) });
      } catch (e) {
        console.error(e); if (run === runRef.current) setError(String(e.message || e));
      } finally {
        if (run === runRef.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [srcUrl, preset, o, maxSide, useSvgo]);

  function download() {
    const a = document.createElement('a'); a.href = svgUrl; a.download = 'vectorized.svg';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function copy() { navigator.clipboard?.writeText(svg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1300); }).catch(() => {}); }

  // Обычная функция, а не компонент: иначе ползунок пересоздаётся на каждый рендер и «срывается» при перетаскивании.
  const range = ({ k, label, min, max, step = 1, fmt = (v) => v }) => (
    <label className="tool-field"><span className="tool-field-label">{label}: {fmt(o[k])}</span>
      <input type="range" min={min} max={max} step={step} value={o[k]} onChange={(e) => set(k, Number(e.target.value))} /></label>
  );

  return (
    <div className="tool-panel vectorizer">
      <div className="tool-field">
        <span className="tool-field-label">{t.preset}</span>
        <div className="segmented">
          {Object.keys(PRESETS).map((k) => <button key={k} type="button" className={preset === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => choosePreset(k)}>{t.p[k]}</button>)}
        </div>
      </div>

      {!srcUrl ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            {svgUrl ? <CompareSlider before={srcUrl} after={svgUrl} language={language} beforeLabel={t.original} afterLabel={t.vector} /> : <img src={srcUrl} alt="" className="bgr-img" />}
            <div className="vz-status">
              {busy ? <span>⏳ {t.tracing}</span> : stats && <span>{t.stats(stats.paths, stats.kb, stats.ms)}</span>}
              {error && <span className="color-invalid">{error}</span>}
            </div>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={download} disabled={!svgUrl}>{t.download}</button>
              <button type="button" className="tool-btn" onClick={copy} disabled={!svg}>{copied ? `✓ ${t.copied}` : t.copy}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.mode}</span>
              <div className="segmented">
                {['spline', 'polygon', 'pixel'].map((m) => <button key={m} type="button" className={o.mode === m ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set('mode', m)}>{t.m[m]}</button>)}
              </div>
            </div>
            {preset !== 'bw' && range({ k: 'maxColors', label: t.colors, min: 0, max: 64, fmt: (v) => (v || t.auto) })}
            {range({ k: 'filterSpeckle', label: t.speckle, min: 0, max: 128, fmt: (v) => `${v}px` })}
            {preset !== 'bw' && range({ k: 'colorPrecision', label: t.precision, min: 1, max: 8 })}
            {preset !== 'bw' && range({ k: 'layerDifference', label: t.gradient, min: 0, max: 128 })}
            {o.mode === 'spline' && range({ k: 'cornerThreshold', label: t.corner, min: 0, max: 180, fmt: (v) => `${v}°` })}
            {o.mode !== 'pixel' && range({ k: 'simplify', label: t.simplify, min: 0, max: 3, step: 0.1 })}
            <div className="tool-field">
              <span className="tool-field-label">{t.layering}</span>
              <div className="segmented">
                <button type="button" className={o.hierarchical === 'stacked' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set('hierarchical', 'stacked')}>{t.stacked}</button>
                <button type="button" className={o.hierarchical === 'cutout' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set('hierarchical', 'cutout')}>{t.cutout}</button>
              </div>
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.maxSide}</span>
              <div className="segmented">
                {MAX_SIDES.map((m) => <button key={m} type="button" className={maxSide === m ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMaxSide(m)}>{m}px</button>)}
              </div>
            </div>
            <label className="tool-check"><input type="checkbox" checked={useSvgo} onChange={(e) => setUseSvgo(e.target.checked)} /> {t.svgo}</label>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">💡 {t.note}</p>
      <p className="tool-local-note">🔒 VTracer (visioncortex) · MIT / Apache-2.0</p>
    </div>
  );
}

export default Vectorizer;
