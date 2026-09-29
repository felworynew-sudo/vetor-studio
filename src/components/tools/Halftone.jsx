import { useEffect, useMemo, useRef, useState } from 'react';

// Halftone (полутон): картинка превращается в растр — чем темнее, тем крупнее
// элемент. Монохром или CMYK-разделение с классическими углами растра
// (C 15° · M 75° · Y 0° · K 45° → розетка), формы: точка, квадрат, ромб, линии.
// Площадь элемента пропорциональна плотности краски (как в печати). Геометрия
// строится один раз и уходит и в предпросмотр (Path2D), и в векторный SVG.

const TEXT = {
  ru: { drop: 'Перетащите картинку или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально', mode: 'Режим', mono: 'Монохром', cmyk: 'CMYK', gap: 'Шаг растра', angle: 'Угол', angleCmyk: 'Поворот розетки', color: 'Краска', bg: 'Бумага', invert: 'Инверсия', shape: 'Форма', dot: 'Точка', sq: 'Квадрат', diamond: 'Ромб', line: 'Линии', gcr: 'Замена серого (K)', gain: 'Контраст', layers: 'Слои', change: 'Другое', png: 'Скачать PNG', svg: 'Скачать SVG', heavy: 'Мелкий шаг даёт тяжёлый SVG', note: 'Растр считается локально; SVG — чистый вектор, по слою на краску. Файлы не уходят на сервер.' },
  en: { drop: 'Drop an image or click', hint: 'PNG, JPG, WebP — processed locally', mode: 'Mode', mono: 'Mono', cmyk: 'CMYK', gap: 'Screen step', angle: 'Angle', angleCmyk: 'Rosette rotation', color: 'Ink', bg: 'Paper', invert: 'Invert', shape: 'Shape', dot: 'Dot', sq: 'Square', diamond: 'Diamond', line: 'Lines', gcr: 'Gray replacement (K)', gain: 'Contrast', layers: 'Layers', change: 'Another', png: 'Download PNG', svg: 'Download SVG', heavy: 'A small step makes a heavy SVG', note: 'Screening runs locally; the SVG is pure vector with one layer per ink. Nothing is uploaded.' },
};

// Типографские триадные краски и классические углы растра.
const INKS = [
  { id: 'c', name: 'Cyan', color: '#00a0e3', angle: 15 },
  { id: 'm', name: 'Magenta', color: '#e5007e', angle: 75 },
  { id: 'y', name: 'Yellow', color: '#ffed00', angle: 0 },
  { id: 'k', name: 'Black', color: '#1d1d1b', angle: 45 },
];

const f = (v) => Math.round(v * 100) / 100;

// Строит SVG-path одного слоя: поворачиваем сетку, в узлах берём плотность.
function screenLayer(sample, w, h, gap, angleDeg, shape) {
  const rad = (angleDeg * Math.PI) / 180; const cos = Math.cos(rad); const sin = Math.sin(rad);
  const cx = w / 2; const cy = h / 2; const n = Math.ceil(Math.hypot(w, h) / gap / 2) + 1;
  const parts = [];
  for (let j = -n; j <= n; j += 1) {
    for (let i = -n; i <= n; i += 1) {
      const u = i * gap; const v = j * gap;
      const px = cx + u * cos - v * sin; const py = cy + u * sin + v * cos;
      if (px < -gap || py < -gap || px > w + gap || py > h + gap) continue;
      const ink = sample(px, py); if (ink < 0.02) continue;
      if (shape === 'line') {
        // отрезок линии: ширина = шаг, толщина = плотность × шаг
        const hu = gap / 2 + 0.3; const hv = (ink * gap) / 2;
        const pts = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]].map(([a, b]) => [px + a * cos - b * sin, py + a * sin + b * cos]);
        parts.push(`M${f(pts[0][0])} ${f(pts[0][1])}L${f(pts[1][0])} ${f(pts[1][1])}L${f(pts[2][0])} ${f(pts[2][1])}L${f(pts[3][0])} ${f(pts[3][1])}Z`);
      } else if (shape === 'dot') {
        const r = Math.sqrt(ink / Math.PI) * gap * 1.02; if (r < 0.25) continue;
        parts.push(`M${f(px - r)} ${f(py)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`);
      } else {
        const hs = (Math.sqrt(ink) * gap) / 2; if (hs < 0.2) continue;
        const a0 = shape === 'diamond' ? rad + Math.PI / 4 : rad; const c0 = Math.cos(a0); const s0 = Math.sin(a0);
        const pts = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]].map(([a, b]) => [px + a * c0 - b * s0, py + a * s0 + b * c0]);
        parts.push(`M${f(pts[0][0])} ${f(pts[0][1])}L${f(pts[1][0])} ${f(pts[1][1])}L${f(pts[2][0])} ${f(pts[2][1])}L${f(pts[3][0])} ${f(pts[3][1])}Z`);
      }
    }
  }
  return { d: parts.join(''), count: parts.length };
}

function Halftone({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [mode, setMode] = useState('mono');
  const [gap, setGap] = useState(8);
  const [angle, setAngle] = useState(45);
  const [color, setColor] = useState('#0d0d11');
  const [bg, setBg] = useState('#ffffff');
  const [invert, setInvert] = useState(false);
  const [shape, setShape] = useState('dot');
  const [gcr, setGcr] = useState(0.7);
  const [gain, setGain] = useState(1);
  const [on, setOn] = useState({ c: true, m: true, y: true, k: true });

  // Размер холста и усреднённая по ячейке картинка (уменьшенная копия).
  const base = useMemo(() => {
    if (!img) return null;
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k); const h = Math.round(img.naturalHeight * k);
    const cell = Math.max(1, gap / 2); const sw = Math.max(1, Math.round(w / cell)); const sh = Math.max(1, Math.round(h / cell));
    const c = document.createElement('canvas'); c.width = sw; c.height = sh; const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high'; x.fillStyle = '#fff'; x.fillRect(0, 0, sw, sh); x.drawImage(img, 0, 0, sw, sh);
    return { w, h, sw, sh, data: x.getImageData(0, 0, sw, sh).data };
  }, [img, gap]);

  const layers = useMemo(() => {
    if (!base) return [];
    const { w, h, sw, sh, data } = base;
    const tone = (v) => Math.min(1, Math.max(0, (v - 0.5) * gain + 0.5));
    const rgbAt = (px, py) => {
      const ix = Math.min(sw - 1, Math.max(0, Math.floor((px / w) * sw))); const iy = Math.min(sh - 1, Math.max(0, Math.floor((py / h) * sh)));
      const o = (iy * sw + ix) * 4; return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
    };
    if (mode === 'mono') {
      const sample = (px, py) => { const [r, g, b] = rgbAt(px, py); const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; const ink = 1 - tone(l); return invert ? 1 - ink : ink; };
      return [{ id: 'mono', color, ...screenLayer(sample, w, h, gap, angle, shape) }];
    }
    // CMYK с заменой серого: K забирает общую часть, остаток уходит в CMY.
    const sep = (px, py) => {
      const [r, g, b] = rgbAt(px, py).map(tone); const c = 1 - r; const m = 1 - g; const y = 1 - b;
      const k = Math.min(c, m, y) * gcr; const d = 1 - k || 1;
      return { c: (c - k) / d, m: (m - k) / d, y: (y - k) / d, k };
    };
    const off = angle - 45;
    return INKS.filter((ink) => on[ink.id]).map((ink) => ({ id: ink.id, color: ink.color, ...screenLayer((px, py) => sep(px, py)[ink.id], w, h, gap, ink.angle + off, shape) }));
  }, [base, mode, gap, angle, color, invert, shape, gcr, gain, on]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !base) return;
    canvas.width = base.w; canvas.height = base.h; const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, base.w, base.h);
    ctx.globalCompositeOperation = mode === 'cmyk' ? 'multiply' : 'source-over';
    layers.forEach((l) => { ctx.fillStyle = l.color; ctx.fill(new Path2D(l.d)); });
    ctx.globalCompositeOperation = 'source-over';
  }, [layers, base, bg, mode]);

  const total = layers.reduce((s, l) => s + l.count, 0);

  function load(file) { if (!file || !file.type.startsWith('image/')) return; const i = new Image(); i.onload = () => setImg(i); i.src = URL.createObjectURL(file); }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  function savePng() { canvasRef.current?.toBlob((b) => download(b, 'halftone.png'), 'image/png'); }
  function saveSvg() {
    const blend = mode === 'cmyk' ? ' style="mix-blend-mode:multiply"' : '';
    const body = layers.map((l) => `<path id="${l.id === 'mono' ? 'ink' : INKS.find((x) => x.id === l.id).name}" fill="${l.color}"${blend} d="${l.d}"/>`).join('\n');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${base.w} ${base.h}" width="${base.w}" height="${base.h}">\n<rect width="100%" height="100%" fill="${bg}"/>\n<g style="isolation:isolate">\n${body}\n</g>\n</svg>\n`;
    download(new Blob([svg], { type: 'image/svg+xml' }), 'halftone.svg');
  }

  const seg = (value, set, opts) => (
    <div className="segmented">
      {opts.map(([v, label]) => <button key={v} type="button" className={value === v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(v)}>{label}</button>)}
    </div>
  );

  return (
    <div className="tool-panel halftone">
      {!img ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="iso-layout">
          <div className="iso-stage" style={{ padding: 12, background: 'var(--surface-strong)' }}><canvas ref={canvasRef} className="grade-canvas" /></div>
          <div className="iso-controls">
            <div className="tool-field"><span className="tool-field-label">{t.mode}</span>{seg(mode, setMode, [['mono', t.mono], ['cmyk', t.cmyk]])}</div>
            <div className="tool-field"><span className="tool-field-label">{t.shape}</span>{seg(shape, setShape, [['dot', t.dot], ['sq', t.sq], ['diamond', t.diamond], ['line', t.line]])}</div>
            <label className="tool-field"><span className="tool-field-label">{t.gap}: {gap}px</span><input type="range" min="3" max="32" value={gap} onChange={(e) => setGap(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{mode === 'cmyk' ? t.angleCmyk : t.angle}: {angle}°</span><input type="range" min="0" max="90" value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.gain}: {gain.toFixed(2)}</span><input type="range" min="0.5" max="2" step="0.05" value={gain} onChange={(e) => setGain(Number(e.target.value))} /></label>
            {mode === 'cmyk' ? (
              <>
                <label className="tool-field"><span className="tool-field-label">{t.gcr}: {Math.round(gcr * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={gcr} onChange={(e) => setGcr(Number(e.target.value))} /></label>
                <div className="tool-field"><span className="tool-field-label">{t.layers}</span>
                  <div className="tool-actions">
                    {INKS.map((ink) => (
                      <label key={ink.id} className="tool-check"><input type="checkbox" checked={on[ink.id]} onChange={(e) => setOn((s) => ({ ...s, [ink.id]: e.target.checked }))} /> <span style={{ color: ink.color === '#ffed00' ? '#c9b400' : ink.color, fontWeight: 600 }}>{ink.id.toUpperCase()}</span> {ink.angle + angle - 45}°</label>
                    ))}
                  </div>
                </div>
                <label className="t3-color"><span className="tool-field-label">{t.bg}</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
              </>
            ) : (
              <>
                <div className="t3-row">
                  <label className="t3-color"><span className="tool-field-label">{t.color}</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
                  <label className="t3-color"><span className="tool-field-label">{t.bg}</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
                </div>
                <label className="rec-opt"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> {t.invert}</label>
              </>
            )}
            {total > 150000 && <p className="tool-field-label">⚠ {t.heavy} ({Math.round(total / 1000)}k)</p>}
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={savePng}>{t.png}</button>
              <button type="button" className="tool-btn" onClick={saveSvg}>{t.svg}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Halftone;
