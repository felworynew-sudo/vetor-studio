import { useMemo, useState } from 'react';

// Генератор SVG-блобов: органическая плавная форма из точек по окружности со
// случайным разбросом, сглаженная кривыми Безье. Заливка цветом или градиентом.
// Реролл, экспорт SVG и копирование кода. Локально.

const TEXT = {
  ru: { points: 'Точек', contrast: 'Неровность', reroll: 'Другая форма', fill: 'Заливка', solid: 'Цвет', grad: 'Градиент', c1: 'Цвет 1', c2: 'Цвет 2', copy: 'Копировать SVG', copied: 'Скопировано', save: 'Скачать SVG', note: 'Плавная органическая форма — для фонов, аватарок, украшений. Векторный SVG.' },
  en: { points: 'Points', contrast: 'Irregularity', reroll: 'Reroll', fill: 'Fill', solid: 'Color', grad: 'Gradient', c1: 'Color 1', c2: 'Color 2', copy: 'Copy SVG', copied: 'Copied', save: 'Download SVG', note: 'A smooth organic shape — for backgrounds, avatars, decoration. Vector SVG.' },
};

// Мулбери32 — детерминированный ГПСЧ по сиду.
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

function blobPath(points, contrast, seed, size) {
  const cx = size / 2; const cy = size / 2; const base = size * 0.36; const rand = rng(seed);
  const pts = [];
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const r = base * (1 + (rand() - 0.5) * 2 * contrast);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // сглаживание catmull-rom → cubic bezier, замкнуто
  const n = pts.length; let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} `;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n]; const p1 = pts[i]; const p2 = pts[(i + 1) % n]; const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6; const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6; const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  return `${d}Z`;
}

function BlobGen({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const SIZE = 400;
  const [points, setPoints] = useState(6);
  const [contrast, setContrast] = useState(0.3);
  const [seed, setSeed] = useState(12345);
  const [mode, setMode] = useState('gradient');
  const [c1, setC1] = useState('#6166ff');
  const [c2, setC2] = useState('#ff5c63');
  const [copied, setCopied] = useState(false);

  const path = useMemo(() => blobPath(points, contrast, seed, SIZE), [points, contrast, seed]);
  const fill = mode === 'gradient' ? 'url(#g)' : c1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${mode === 'gradient' ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` : ''}<path d="${path}" fill="${fill}"/></svg>`;

  function copy() { navigator.clipboard?.writeText(svg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }
  function save() { const b = new Blob([svg], { type: 'image/svg+xml' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'blob.svg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  function reroll() { setSeed(Math.floor(Math.random() * 1e9)); }

  return (
    <div className="tool-panel blobgen">
      <div className="iso-layout">
        <div className="iso-stage bl-stage">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="bl-svg" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="glive" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient></defs>
            <path d={path} fill={mode === 'gradient' ? 'url(#glive)' : c1} />
          </svg>
        </div>
        <div className="iso-controls">
          <label className="tool-field"><span className="tool-field-label">{t.points}: {points}</span><input type="range" min="3" max="12" value={points} onChange={(e) => setPoints(Number(e.target.value))} /></label>
          <label className="tool-field"><span className="tool-field-label">{t.contrast}: {Math.round(contrast * 100)}%</span><input type="range" min="5" max="70" value={Math.round(contrast * 100)} onChange={(e) => setContrast(Number(e.target.value) / 100)} /></label>
          <div className="tool-field">
            <span className="tool-field-label">{t.fill}</span>
            <div className="segmented">
              <button type="button" className={mode === 'solid' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('solid')}>{t.solid}</button>
              <button type="button" className={mode === 'gradient' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('gradient')}>{t.grad}</button>
            </div>
          </div>
          <div className="t3-row">
            <label className="t3-color"><span className="tool-field-label">{t.c1}</span><input type="color" value={c1} onChange={(e) => setC1(e.target.value)} /></label>
            {mode === 'gradient' && <label className="t3-color"><span className="tool-field-label">{t.c2}</span><input type="color" value={c2} onChange={(e) => setC2(e.target.value)} /></label>}
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={reroll}>🎲 {t.reroll}</button>
            <button type="button" className="tool-btn" onClick={save}>{t.save}</button>
            <button type="button" className="tool-btn" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
          </div>
        </div>
      </div>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default BlobGen;
