import { useRef, useState } from 'react';

// Векторный редактор V1 (SVG, локальный). Фигуры (прямоугольник/эллипс/линия/
// звезда/текст) + свободное перо, выделение/перемещение/масштаб ручкой, заливка/
// обводка/толщина, порядок слоёв, дублирование, экспорт SVG и PNG. Полноценный
// иллюстратор — отдельный проект; здесь рабочее ядро. Всё в браузере.

const TOOLS = [
  ['select', '⬚', 'Выделение'], ['rect', '▭', 'Прямоугольник'], ['ellipse', '◯', 'Эллипс'],
  ['line', '╱', 'Линия'], ['star', '★', 'Звезда'], ['text', 'T', 'Текст'], ['pen', '✎', 'Перо'],
];
const T = {
  ru: { fill: 'Заливка', stroke: 'Обводка', width: 'Толщина', noFill: 'Без заливки', front: 'Вперёд', back: 'Назад',
    dup: 'Дублировать', del: 'Удалить', svg: 'Экспорт SVG', png: 'Экспорт PNG', points: 'Лучи', textVal: 'Текст', size: 'Кегль',
    empty: 'Выберите инструмент и рисуйте на холсте. Клик по фигуре — выделить.', note: 'Всё локально в браузере.', textPrompt: 'Текст:' },
  en: { fill: 'Fill', stroke: 'Stroke', width: 'Width', noFill: 'No fill', front: 'Forward', back: 'Back',
    dup: 'Duplicate', del: 'Delete', svg: 'Export SVG', png: 'Export PNG', points: 'Points', textVal: 'Text', size: 'Size',
    empty: 'Pick a tool and draw on the canvas. Click a shape to select.', note: 'All local in the browser.', textPrompt: 'Text:' },
};
const W = 1000; const H = 640;
let sid = 0;

function starPath(cx, cy, r, points) {
  const inner = r * 0.42; let d = '';
  for (let i = 0; i < points * 2; i += 1) {
    const ang = (Math.PI / points) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(ang) * rad).toFixed(1)} ${(cy + Math.sin(ang) * rad).toFixed(1)} `;
  }
  return `${d}Z`;
}

function shapeSvg(s) {
  const stroke = s.sw > 0 ? ` stroke="${s.stroke}" stroke-width="${s.sw}"` : '';
  const fill = ` fill="${s.fill || 'none'}"`;
  if (s.type === 'rect') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${fill}${stroke}/>`;
  if (s.type === 'ellipse') return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${fill}${stroke}/>`;
  if (s.type === 'line') return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round"/>`;
  if (s.type === 'star') return `<path d="${starPath(s.cx, s.cy, s.r, s.points)}"${fill}${stroke} stroke-linejoin="round"/>`;
  if (s.type === 'text') return `<text x="${s.x}" y="${s.y}" font-size="${s.size}" font-family="system-ui, sans-serif" fill="${s.fill}">${(s.text || '').replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]))}</text>`;
  if (s.type === 'path') return `<path d="${s.d}"${fill}${stroke} stroke-linecap="round" stroke-linejoin="round"/>`;
  return '';
}

function VectorEditor({ language = 'ru' }) {
  const t = T[language] || T.ru;
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  const [shapes, setShapes] = useState([]);
  const [selId, setSelId] = useState(null);
  const [tool, setTool] = useState('rect');
  const [fill, setFill] = useState('#6166ff');
  const [stroke, setStroke] = useState('#0d0d11');
  const [sw, setSw] = useState(2);
  const [zoom, setZoom] = useState(1);

  const sel = shapes.find((s) => s.id === selId) || null;
  const patch = (id, upd) => setShapes((p) => p.map((s) => (s.id === id ? { ...s, ...(typeof upd === 'function' ? upd(s) : upd) } : s)));

  function pt(e) {
    const svg = svgRef.current; const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }

  function onDown(e) {
    const { x, y } = pt(e);
    const handleEl = e.target.closest && e.target.closest('[data-handle]');
    if (handleEl && sel) { dragRef.current = { mode: 'resize', id: sel.id, sx: x, sy: y, orig: { ...sel } }; arm(); return; }
    const hitEl = e.target.closest && e.target.closest('[data-id]');
    const hitId = hitEl && hitEl.getAttribute('data-id');
    if (tool === 'select') {
      if (hitId) { const id = Number(hitId); setSelId(id); const s = shapes.find((sh) => sh.id === id); dragRef.current = { mode: 'move', id, sx: x, sy: y, orig: { ...s } }; arm(); }
      else setSelId(null);
      return;
    }
    if (tool === 'text') {
      const str = window.prompt(t.textPrompt); if (!str) return;
      sid += 1; const s = { id: sid, type: 'text', x, y: y + 18, text: str, size: 32, fill };
      setShapes((p) => [...p, s]); setSelId(sid); return;
    }
    if (tool === 'pen') { sid += 1; dragRef.current = { mode: 'pen', id: sid, d: `M${x.toFixed(1)} ${y.toFixed(1)}` }; setShapes((p) => [...p, { id: sid, type: 'path', d: `M${x.toFixed(1)} ${y.toFixed(1)}`, fill: 'none', stroke, sw: Math.max(1, sw) }]); setSelId(sid); arm(); return; }
    // фигуры перетаскиванием
    sid += 1; let s;
    if (tool === 'rect') s = { id: sid, type: 'rect', x, y, w: 1, h: 1, fill, stroke, sw };
    else if (tool === 'ellipse') s = { id: sid, type: 'ellipse', cx: x, cy: y, rx: 1, ry: 1, fill, stroke, sw };
    else if (tool === 'line') s = { id: sid, type: 'line', x1: x, y1: y, x2: x, y2: y, stroke, sw: Math.max(1, sw) };
    else if (tool === 'star') s = { id: sid, type: 'star', cx: x, cy: y, r: 1, points: 5, fill, stroke, sw };
    setShapes((p) => [...p, s]); setSelId(sid);
    dragRef.current = { mode: 'create', id: sid, type: tool, sx: x, sy: y };
    arm();
  }
  function onMove(e) {
    const d = dragRef.current; if (!d) return;
    const { x, y } = pt(e);
    if (d.mode === 'pen') { const nd = `${d.d} L${x.toFixed(1)} ${y.toFixed(1)}`; d.d = nd; patch(d.id, { d: nd }); return; }
    if (d.mode === 'move') {
      const dx = x - d.sx; const dy = y - d.sy; const o = d.orig;
      if (o.type === 'rect' || o.type === 'text') patch(d.id, { x: o.x + dx, y: o.y + dy });
      else if (o.type === 'ellipse' || o.type === 'star') patch(d.id, { cx: o.cx + dx, cy: o.cy + dy });
      else if (o.type === 'line') patch(d.id, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
      else if (o.type === 'path') patch(d.id, { d: translatePath(o.d, dx, dy) });
      return;
    }
    if (d.mode === 'resize') {
      const o = d.orig;
      if (o.type === 'rect') patch(d.id, { w: Math.max(2, x - o.x), h: Math.max(2, y - o.y) });
      else if (o.type === 'ellipse') patch(d.id, { rx: Math.max(2, Math.abs(x - o.cx)), ry: Math.max(2, Math.abs(y - o.cy)) });
      else if (o.type === 'star') patch(d.id, { r: Math.max(4, Math.hypot(x - o.cx, y - o.cy)) });
      else if (o.type === 'line') patch(d.id, { x2: x, y2: y });
      else if (o.type === 'text') patch(d.id, { size: Math.max(8, Math.round(y - o.y + o.size)) });
      return;
    }
    // create
    if (d.type === 'rect') patch(d.id, { x: Math.min(d.sx, x), y: Math.min(d.sy, y), w: Math.abs(x - d.sx), h: Math.abs(y - d.sy) });
    else if (d.type === 'ellipse') patch(d.id, { cx: (d.sx + x) / 2, cy: (d.sy + y) / 2, rx: Math.abs(x - d.sx) / 2, ry: Math.abs(y - d.sy) / 2 });
    else if (d.type === 'line') patch(d.id, { x2: x, y2: y });
    else if (d.type === 'star') patch(d.id, { r: Math.max(4, Math.hypot(x - d.sx, y - d.sy)) });
  }
  function onUp() {
    const d = dragRef.current;
    if (d && (d.mode === 'create')) { setShapes((p) => p.filter((s) => !(s.id === d.id && ((s.type === 'rect' && s.w < 2) || (s.type === 'ellipse' && s.rx < 2) || (s.type === 'star' && s.r < 4))))); }
    dragRef.current = null; disarm();
  }
  function arm() { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }
  function disarm() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }

  function zOrder(dir) { setShapes((p) => { const i = p.findIndex((s) => s.id === selId); const j = i + dir; if (i < 0 || j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; }); }
  function dupSel() { if (!sel) return; sid += 1; const c = { ...sel, id: sid }; if (c.x != null) { c.x += 16; } if (c.y != null) c.y += 16; if (c.cx != null) { c.cx += 16; c.cy += 16; } if (c.type === 'line') { c.x1 += 16; c.y1 += 16; c.x2 += 16; c.y2 += 16; } if (c.type === 'path') c.d = translatePath(c.d, 16, 16); setShapes((p) => [...p, c]); setSelId(sid); }
  function delSel() { if (!sel) return; setShapes((p) => p.filter((s) => s.id !== selId)); setSelId(null); }

  function svgString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${shapes.map(shapeSvg).join('')}</svg>`;
  }
  function exportSvg() {
    const blob = new Blob([svgString()], { type: 'image/svg+xml' });
    trigger(URL.createObjectURL(blob), 'vector.svg');
  }
  function exportPng() {
    const svg = svgString(); const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0); c.toBlob((b) => trigger(URL.createObjectURL(b), 'vector.png'), 'image/png'); };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  function trigger(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

  const bbox = sel ? selBBox(sel) : null;

  return (
    <div className="tool-panel vector-editor">
      <div className="re-toolbar">
        <div className="re-tools">
          {TOOLS.map(([id, icon, label]) => (
            <button key={id} type="button" title={label} className={tool === id ? 're-tool is-active' : 're-tool'} onClick={() => setTool(id)}>{icon}</button>
          ))}
        </div>
        <label className="re-swatch" title={t.fill}><input type="color" value={fill} onChange={(e) => { setFill(e.target.value); if (sel && sel.type !== 'line') patch(sel.id, { fill: e.target.value }); }} /><span style={{ background: fill }} /></label>
        <label className="re-swatch" title={t.stroke}><input type="color" value={stroke} onChange={(e) => { setStroke(e.target.value); if (sel) patch(sel.id, { stroke: e.target.value }); }} /><span style={{ background: stroke }} /></label>
        <label className="re-num">{t.width}<input type="range" min="0" max="40" value={sw} onChange={(e) => { const v = Number(e.target.value); setSw(v); if (sel) patch(sel.id, { sw: v }); }} /><b>{sw}</b></label>
        <div className="re-toolbar-spacer" />
        <button type="button" className="tool-btn small" onClick={() => zOrder(1)} disabled={!sel} title={t.front}>⤒</button>
        <button type="button" className="tool-btn small" onClick={() => zOrder(-1)} disabled={!sel} title={t.back}>⤓</button>
        <button type="button" className="tool-btn small" onClick={dupSel} disabled={!sel}>⧉</button>
        <button type="button" className="tool-btn small" onClick={delSel} disabled={!sel}>✕</button>
        <label className="re-num">{Math.round(zoom * 100)}%<input type="range" min="0.3" max="2" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <button type="button" className="tool-btn small" onClick={exportSvg}>{t.svg}</button>
        <button type="button" className="tool-btn primary small" onClick={exportPng}>{t.png}</button>
      </div>

      <div className="ve-stage-wrap">
        <svg ref={svgRef} className="ve-stage" width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} onPointerDown={onDown} style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}>
          <rect x="0" y="0" width={W} height={H} fill="#ffffff" data-bg="1" />
          {shapes.map((s) => (
            <g key={s.id} data-id={s.id} dangerouslySetInnerHTML={{ __html: shapeSvg(s) }} />
          ))}
          {bbox && (
            <g pointerEvents="none">
              <rect x={bbox.x} y={bbox.y} width={bbox.w} height={bbox.h} fill="none" stroke="#6166ff" strokeWidth={1.5 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
              <rect data-handle="br" x={bbox.x + bbox.w - 5 / zoom} y={bbox.y + bbox.h - 5 / zoom} width={10 / zoom} height={10 / zoom} fill="#6166ff" pointerEvents="all" style={{ cursor: 'nwse-resize' }} />
            </g>
          )}
        </svg>
      </div>

      <p className="tool-local-note">🔒 {sel ? `${sel.type}` : t.empty} · {t.note}</p>
    </div>
  );
}

// смещение всех координат в d пути
function translatePath(d, dx, dy) {
  return d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (m, a, b) => `${(parseFloat(a) + dx).toFixed(1)} ${(parseFloat(b) + dy).toFixed(1)}`);
}

function selBBox(s) {
  if (s.type === 'rect') return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.type === 'ellipse') return { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
  if (s.type === 'star') return { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
  if (s.type === 'line') return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1) || 2, h: Math.abs(s.y2 - s.y1) || 2 };
  if (s.type === 'text') return { x: s.x, y: s.y - s.size, w: (s.text || '').length * s.size * 0.55, h: s.size * 1.2 };
  if (s.type === 'path') { const nums = (s.d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); let minx = 1e9; let miny = 1e9; let maxx = -1e9; let maxy = -1e9; for (let i = 0; i < nums.length; i += 2) { minx = Math.min(minx, nums[i]); maxx = Math.max(maxx, nums[i]); miny = Math.min(miny, nums[i + 1]); maxy = Math.max(maxy, nums[i + 1]); } return { x: minx, y: miny, w: maxx - minx || 2, h: maxy - miny || 2 }; }
  return null;
}

export default VectorEditor;
