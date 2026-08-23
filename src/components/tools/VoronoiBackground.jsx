import { useCallback, useEffect, useRef, useState } from 'react';
import { Delaunay } from 'd3-delaunay';

// Генератор геометрических фонов Вороного/Делоне. Точки + диаграмма, заливка
// палитрой. Экспорт SVG/PNG. Локально.

const W = 1600;
const H = 900;

const PALETTES = [
  ['#6166ff', '#8a5cff', '#ff5c63'],
  ['#0d0d11', '#1a1a2e', '#6166ff'],
  ['#2a9d8f', '#264653', '#e9c46a'],
  ['#f72585', '#7209b7', '#4cc9f0'],
  ['#ff9e00', '#ff5400', '#03071e'],
  ['#3ec98a', '#0d0d11', '#7ce0a8'],
];

const TEXT = {
  ru: {
    points: 'Точек', palette: 'Палитра', style: 'Стиль', cells: 'Ячейки', mesh: 'Сетка',
    regen: 'Обновить', dlSvg: 'Скачать SVG', dlPng: 'Скачать PNG',
    hint: 'Готовый фон для баннеров, обложек и презентаций.',
  },
  en: {
    points: 'Points', palette: 'Palette', style: 'Style', cells: 'Cells', mesh: 'Mesh',
    regen: 'Regenerate', dlSvg: 'Download SVG', dlPng: 'Download PNG',
    hint: 'A ready background for banners, covers and slides.',
  },
};

function mix(a, b, tt) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * tt));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function paletteAt(pal, tt) {
  const seg = tt * (pal.length - 1);
  const i = Math.min(pal.length - 2, Math.floor(seg));
  return mix(pal[i], pal[i + 1], seg - i);
}

function VoronoiBackground({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [count, setCount] = useState(60);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [style, setStyle] = useState('cells');
  const [seed, setSeed] = useState(1);
  const [svg, setSvg] = useState('');
  const wrapRef = useRef(null);

  const build = useCallback(() => {
    const pal = PALETTES[paletteIdx];
    const pts = [];
    for (let i = 0; i < count; i += 1) pts.push([Math.random() * W, Math.random() * H]);
    const delaunay = Delaunay.from(pts);
    let body = '';
    if (style === 'cells') {
      const voronoi = delaunay.voronoi([0, 0, W, H]);
      for (let i = 0; i < pts.length; i += 1) {
        const cell = voronoi.cellPolygon(i);
        if (!cell) continue;
        const tt = (pts[i][0] / W + pts[i][1] / H) / 2;
        const fill = paletteAt(pal, Math.min(1, Math.max(0, tt)));
        const d = `${cell.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}Z`;
        body += `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="1"/>`;
      }
    } else {
      const bg = pal[pal.length - 1];
      body += `<rect width="${W}" height="${H}" fill="${bg}"/>`;
      const { points, triangles } = delaunay;
      for (let i = 0; i < triangles.length; i += 3) {
        const p = [triangles[i], triangles[i + 1], triangles[i + 2]].map((idx) => [points[idx * 2], points[idx * 2 + 1]]);
        const d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}L${p[1][0].toFixed(1)} ${p[1][1].toFixed(1)}L${p[2][0].toFixed(1)} ${p[2][1].toFixed(1)}Z`;
        body += `<path d="${d}" fill="none" stroke="${pal[0]}" stroke-width="1.2" stroke-opacity="0.6"/>`;
      }
    }
    setSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>`);
  }, [count, paletteIdx, style, seed]);

  useEffect(() => { build(); }, [build]);

  function downloadSvg() {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'voronoi.svg';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }
  function downloadPng() {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'voronoi.png';
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  }

  return (
    <div className="tool-panel voronoi-tool">
      <div ref={wrapRef} className="voronoi-preview" dangerouslySetInnerHTML={{ __html: svg }} />

      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.points}: {count}</span>
          <input type="range" min="10" max="200" value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.style}</span>
          <div className="segmented">
            <button type="button" className={style === 'cells' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setStyle('cells')}>{t.cells}</button>
            <button type="button" className={style === 'mesh' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setStyle('mesh')}>{t.mesh}</button>
          </div>
        </div>
      </div>

      <div className="voronoi-palettes">
        {PALETTES.map((p, i) => (
          <button
            key={i}
            type="button"
            className={i === paletteIdx ? 'voronoi-pal is-active' : 'voronoi-pal'}
            onClick={() => setPaletteIdx(i)}
            style={{ background: `linear-gradient(90deg, ${p.join(', ')})` }}
            aria-label={`palette ${i + 1}`}
          />
        ))}
      </div>

      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={() => setSeed((s) => s + 1)}>🎲 {t.regen}</button>
        <button type="button" className="tool-btn" onClick={downloadSvg}>{t.dlSvg}</button>
        <button type="button" className="tool-btn" onClick={downloadPng}>{t.dlPng}</button>
      </div>

      <p className="tool-local-note">✨ {t.hint}</p>
    </div>
  );
}

export default VoronoiBackground;
