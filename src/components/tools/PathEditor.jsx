import { useEffect, useMemo, useRef, useState } from 'react';
import SvgPath from 'svgpath';

// Редактор SVG-путей: вставьте path (или весь SVG) — узлы и управляющие точки
// кривых можно тянуть мышью, сетка с привязкой, добавление/удаление точек,
// прямая ↔ кривая, отмена, живой код d. Дуги и сокращённые команды
// нормализуются в M/L/C/Q/Z (svgpath, MIT).

const TEXT = {
  ru: {
    input: 'Path d или SVG', apply: 'Загрузить', grid: 'Сетка', snap: 'Привязка к сетке', precision: 'Точность', undo: 'Отменить', del: 'Удалить узел', toCurve: 'Сделать кривой', toLine: 'Сделать прямой',
    close: 'Замкнуть / разомкнуть', copy: 'Копировать d', copied: 'Скопировано', download: 'Скачать SVG', fill: 'Заливка', stroke: 'Контур', nodes: 'Узлов',
    hint: 'Тяните узлы (квадраты) и рычаги (круги). Двойной клик по холсту — новая точка после выбранной. Shift — без привязки. Delete — удалить узел, Ctrl+Z — отмена.',
  },
  en: {
    input: 'Path d or SVG', apply: 'Load', grid: 'Grid', snap: 'Snap to grid', precision: 'Precision', undo: 'Undo', del: 'Delete node', toCurve: 'Make curve', toLine: 'Make straight',
    close: 'Close / open', copy: 'Copy d', copied: 'Copied', download: 'Download SVG', fill: 'Fill', stroke: 'Stroke', nodes: 'Nodes',
    hint: 'Drag nodes (squares) and handles (circles). Double-click the canvas to add a point after the selected one. Shift disables snapping. Delete removes a node, Ctrl+Z undoes.',
  },
};

const SAMPLE = 'M40 160 C40 80 120 40 160 80 S240 200 280 120 L300 60 Q340 40 360 90 L360 180 Z';

// Разбор в массив сегментов { c: 'M'|'L'|'C'|'Q'|'Z', p: [[x,y]...] } с абсолютными координатами.
function parse(input) {
  const m = input.match(/\sd="([^"]+)"/);
  const d = m ? m[1] : input.trim();
  const segs = []; let cx = 0; let cy = 0; let sx = 0; let sy = 0;
  SvgPath(d).abs().unarc().unshort().iterate((s) => {
    const c = s[0];
    if (c === 'M') { segs.push({ c: 'M', p: [[s[1], s[2]]] }); cx = s[1]; cy = s[2]; sx = cx; sy = cy; }
    else if (c === 'L') { segs.push({ c: 'L', p: [[s[1], s[2]]] }); cx = s[1]; cy = s[2]; }
    else if (c === 'H') { segs.push({ c: 'L', p: [[s[1], cy]] }); cx = s[1]; }
    else if (c === 'V') { segs.push({ c: 'L', p: [[cx, s[1]]] }); cy = s[1]; }
    else if (c === 'C') { segs.push({ c: 'C', p: [[s[1], s[2]], [s[3], s[4]], [s[5], s[6]]] }); cx = s[5]; cy = s[6]; }
    else if (c === 'Q') { segs.push({ c: 'Q', p: [[s[1], s[2]], [s[3], s[4]]] }); cx = s[3]; cy = s[4]; }
    else if (c === 'Z' || c === 'z') { segs.push({ c: 'Z', p: [] }); cx = sx; cy = sy; }
  });
  return segs;
}

const fmt = (v, p) => Number(v.toFixed(p)).toString();
const build = (segs, p) => segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c}${s.p.map((q) => `${fmt(q[0], p)} ${fmt(q[1], p)}`).join(' ')}`)).join(' ');
const endOf = (segs, i) => { for (let k = i; k >= 0; k -= 1) if (segs[k].p.length) return segs[k].p[segs[k].p.length - 1]; return [0, 0]; };

function PathEditor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const svgRef = useRef(null);
  const [text, setText] = useState(SAMPLE);
  const [segs, setSegs] = useState(() => parse(SAMPLE));
  const [history, setHistory] = useState([]);
  const [sel, setSel] = useState(-1);
  const [grid, setGrid] = useState(10);
  const [snap, setSnap] = useState(true);
  const [precision, setPrecision] = useState(1);
  const [fill, setFill] = useState('#6166ff');
  const [stroke, setStroke] = useState('#111111');
  const [copied, setCopied] = useState(false);

  const d = build(segs, precision);
  const pts = segs.flatMap((s) => s.p);
  const box = useMemo(() => {
    const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs, 0); const y0 = Math.min(...ys, 0); const x1 = Math.max(...xs, 100); const y1 = Math.max(...ys, 100);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
    return [Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 - x0 + pad * 2), Math.ceil(y1 - y0 + pad * 2)];
  }, [history.length, text]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = box[2] / 500;

  const commit = (next) => { setHistory((h) => [...h.slice(-49), segs]); setSegs(next); };
  const undo = () => setHistory((h) => { if (!h.length) return h; setSegs(h[h.length - 1]); return h.slice(0, -1); });

  function toSvg(e) {
    const ctm = svgRef.current.getScreenCTM().inverse(); const p = svgRef.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(ctm);
    return (snap && !e.shiftKey) ? [Math.round(q.x / grid) * grid, Math.round(q.y / grid) * grid] : [q.x, q.y];
  }
  function drag(e, si, pi) {
    e.preventDefault(); e.stopPropagation(); setSel(si);
    const start = segs; let moved = false;
    const move = (ev) => {
      const q = toSvg(ev); moved = true;
      setSegs((cur) => cur.map((s, k) => {
        if (k !== si) return s;
        const p = s.p.map((x) => [...x]);
        const isAnchor = pi === p.length - 1;
        if (isAnchor) {
          const [ox, oy] = p[pi]; const dx = q[0] - ox; const dy = q[1] - oy;
          p[pi] = q;
          if (s.c === 'C') p[1] = [p[1][0] + dx, p[1][1] + dy]; // входящий рычаг едет с узлом
          return { ...s, p };
        }
        p[pi] = q; return { ...s, p };
      }).map((s, k, arr) => {
        // исходящий рычаг следующей кривой тоже едет с узлом
        if (k === si + 1 && s.c === 'C' && pi === start[si].p.length - 1) {
          const [ox, oy] = start[si].p[pi]; const [nx, ny] = arr[si].p[pi]; const p = s.p.map((x) => [...x]);
          p[0] = [start[si + 1].p[0][0] + nx - ox, start[si + 1].p[0][1] + ny - oy]; return { ...s, p };
        }
        return s;
      }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) setHistory((h) => [...h.slice(-49), start]); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  function addPoint(e) {
    const q = toSvg(e); const at = sel >= 0 ? sel + 1 : segs.length - (segs[segs.length - 1]?.c === 'Z' ? 1 : 0);
    const next = [...segs]; next.splice(at, 0, { c: 'L', p: [q] }); commit(next); setSel(at);
  }
  function delNode() {
    if (sel < 0 || segs[sel].c === 'M' || segs[sel].c === 'Z') return;
    commit(segs.filter((_, k) => k !== sel)); setSel(-1);
  }
  function convert(to) {
    if (sel < 0) return; const s = segs[sel]; const a = endOf(segs, sel - 1); const b = s.p[s.p.length - 1];
    if (to === 'C' && s.c === 'L') commit(segs.map((x, k) => (k === sel ? { c: 'C', p: [[a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3 - 20 * unit], [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3 - 20 * unit], b] } : x)));
    if (to === 'L' && (s.c === 'C' || s.c === 'Q')) commit(segs.map((x, k) => (k === sel ? { c: 'L', p: [b] } : x)));
  }
  const toggleClose = () => commit(segs[segs.length - 1]?.c === 'Z' ? segs.slice(0, -1) : [...segs, { c: 'Z', p: [] }]);

  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement; if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delNode(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const svgOut = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}"><path d="${d}" fill="${fill}" stroke="${stroke}"/></svg>`;
  const selSeg = segs[sel];

  return (
    <div className="tool-panel path-editor">
      <div className="pe2-stage">
        <svg ref={svgRef} viewBox={box.join(' ')} className="pe2-svg" onDoubleClick={addPoint}>
          <defs><pattern id="pe2grid" width={grid} height={grid} patternUnits="userSpaceOnUse"><path d={`M${grid} 0L0 0 0 ${grid}`} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={unit} /></pattern></defs>
          <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="url(#pe2grid)" />
          <path d={d} fill={fill} fillOpacity="0.55" stroke={stroke} strokeWidth={unit * 1.5} />
          {segs.map((s, si) => {
            const a = endOf(segs, si - 1);
            const handles = s.c === 'C' ? [[a, s.p[0], 0], [s.p[2], s.p[1], 1]] : s.c === 'Q' ? [[a, s.p[0], 0], [s.p[1], s.p[0], null]] : [];
            return (
              <g key={si}>
                {handles.map(([from, to, pi], k) => (
                  <g key={k}>
                    <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#ff5c63" strokeWidth={unit} />
                    {pi !== null && <circle cx={to[0]} cy={to[1]} r={unit * 5} fill="#fff" stroke="#ff5c63" strokeWidth={unit * 1.5} className="pe2-h" onPointerDown={(e) => drag(e, si, pi)} />}
                  </g>
                ))}
                {s.p.length > 0 && (() => { const q = s.p[s.p.length - 1]; const r = unit * 5.5; return <rect x={q[0] - r} y={q[1] - r} width={r * 2} height={r * 2} fill={sel === si ? '#6166ff' : '#fff'} stroke="#6166ff" strokeWidth={unit * 1.5} className="pe2-h" onPointerDown={(e) => drag(e, si, s.p.length - 1)} />; })()}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="tool-local-note">🖱 {t.hint}</p>
      <div className="tool-actions">
        <button type="button" className="tool-btn" onClick={undo} disabled={!history.length}>{t.undo}</button>
        <button type="button" className="tool-btn" onClick={delNode} disabled={!selSeg || selSeg.c === 'M'}>{t.del}</button>
        <button type="button" className="tool-btn" onClick={() => convert('C')} disabled={!selSeg || selSeg.c !== 'L'}>{t.toCurve}</button>
        <button type="button" className="tool-btn" onClick={() => convert('L')} disabled={!selSeg || (selSeg.c !== 'C' && selSeg.c !== 'Q')}>{t.toLine}</button>
        <button type="button" className="tool-btn" onClick={toggleClose}>{t.close}</button>
      </div>
      <div className="tool-controls">
        <div className="tool-field"><span className="tool-field-label">{t.grid}</span>
          <div className="segmented">{[1, 5, 10, 20].map((g) => <button key={g} type="button" className={grid === g ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setGrid(g)}>{g}</button>)}</div>
        </div>
        <label className="tool-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> {t.snap}</label>
        <label className="tool-field"><span className="tool-field-label">{t.precision}: {precision}</span><input type="range" min="0" max="3" value={precision} onChange={(e) => setPrecision(Number(e.target.value))} /></label>
        <label className="tool-field"><span className="tool-field-label">{t.fill}</span><input type="color" value={fill} onChange={(e) => setFill(e.target.value)} /></label>
        <label className="tool-field"><span className="tool-field-label">{t.stroke}</span><input type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} /></label>
      </div>
      <div className="tool-field">
        <span className="tool-field-label">d · {t.nodes}: {segs.filter((s) => s.p.length).length}</span>
        <textarea className="pf-input sj-code" rows={3} value={d} readOnly />
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={() => navigator.clipboard?.writeText(d).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>{copied ? `✓ ${t.copied}` : t.copy}</button>
          <button type="button" className="tool-btn" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svgOut], { type: 'image/svg+xml' })); a.download = 'path.svg'; document.body.appendChild(a); a.click(); a.remove(); }}>{t.download}</button>
        </div>
      </div>
      <div className="tool-field">
        <span className="tool-field-label">{t.input}</span>
        <textarea className="pf-input sj-code" rows={3} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <button type="button" className="tool-btn small" onClick={() => { try { commit(parse(text)); setSel(-1); } catch { /* */ } }}>{t.apply}</button>
      </div>
    </div>
  );
}

export default PathEditor;
