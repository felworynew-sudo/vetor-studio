import { useRef, useState } from 'react';

// Редактор cubic-bezier: тяните две контрольные точки — получаете кривую
// плавности и живую анимацию по ней. Пресеты, готовый CSS в клик. Локально.

const PRESETS = {
  ease: [0.25, 0.1, 0.25, 1], linear: [0, 0, 1, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
  'back-out': [0.34, 1.56, 0.64, 1], snap: [0.16, 1, 0.3, 1],
};
const TEXT = {
  ru: { copy: 'Копировать CSS', copied: 'Скопировано', drag: 'Тяните точки', presets: 'Пресеты', note: 'Кривая плавности для transition/animation. Точки можно вытягивать за пределы — получится «отскок».' },
  en: { copy: 'Copy CSS', copied: 'Copied', drag: 'Drag the points', presets: 'Presets', note: 'An easing curve for transition/animation. Drag points beyond bounds for an overshoot.' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function CubicBezier({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const svgRef = useRef(null);
  const drag = useRef(null);
  const [b, setB] = useState(PRESETS.ease);
  const [copied, setCopied] = useState(false);
  const [k, setK] = useState(0); // для перезапуска анимации

  const SZ = 200; const PAD = 40; const span = SZ; // рабочая область
  // координаты в SVG: x∈[0,1]→[PAD, PAD+span]; y∈[-0.5..1.5]→снизу вверх
  const toX = (x) => PAD + x * span;
  const toY = (y) => PAD + span - y * span;
  const fromX = (px) => (px - PAD) / span;
  const fromY = (py) => (PAD + span - py) / span;

  const [x1, y1, x2, y2] = b;
  const path = `M ${toX(0)} ${toY(0)} C ${toX(x1)} ${toY(y1)}, ${toX(x2)} ${toY(y2)}, ${toX(1)} ${toY(1)}`;
  const css = `cubic-bezier(${b.map((v) => +v.toFixed(2)).join(', ')})`;

  function pointer(e) { const r = svgRef.current.getBoundingClientRect(); const sx = svgRef.current.viewBox.baseVal.width / r.width; return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sx }; }
  function down(which) { return (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = which; }; }
  function move(e) {
    if (!drag.current) return;
    const p = pointer(e); const nx = clamp(fromX(p.x), 0, 1); const ny = clamp(fromY(p.y), -0.5, 1.5);
    setB((cur) => (drag.current === 1 ? [nx, ny, cur[2], cur[3]] : [cur[0], cur[1], nx, ny]));
  }
  function up() { drag.current = null; }

  function apply(preset) { setB(PRESETS[preset]); setK((v) => v + 1); }
  function copy() { navigator.clipboard?.writeText(css).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }

  return (
    <div className="tool-panel cubicbez">
      <div className="iso-layout">
        <div className="iso-stage cb-stage">
          <svg ref={svgRef} viewBox={`0 0 ${SZ + PAD * 2} ${SZ + PAD * 2}`} className="cb-svg" onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
            <rect x={PAD} y={PAD} width={span} height={span} fill="none" stroke="var(--stroke)" />
            <line x1={toX(0)} y1={toY(0)} x2={toX(x1)} y2={toY(y1)} stroke="#ff5c63" strokeWidth="1.5" />
            <line x1={toX(1)} y1={toY(1)} x2={toX(x2)} y2={toY(y2)} stroke="#ff5c63" strokeWidth="1.5" />
            <path d={path} fill="none" stroke="var(--t-accent)" strokeWidth="3" />
            <circle cx={toX(0)} cy={toY(0)} r="4" fill="var(--text-muted)" />
            <circle cx={toX(1)} cy={toY(1)} r="4" fill="var(--text-muted)" />
            <circle className="cb-handle" cx={toX(x1)} cy={toY(y1)} r="8" fill="#ff5c63" onPointerDown={down(1)} />
            <circle className="cb-handle" cx={toX(x2)} cy={toY(y2)} r="8" fill="#ff5c63" onPointerDown={down(2)} />
          </svg>
        </div>
        <div className="iso-controls">
          <div className="cb-demo"><span key={k} className="cb-ball" style={{ animationTimingFunction: css }} /></div>
          <div className="tool-field">
            <span className="tool-field-label">{t.presets}</span>
            <div className="gm-sets">{Object.keys(PRESETS).map((p) => <button key={p} type="button" className="crop-ratio" onClick={() => apply(p)}>{p}</button>)}</div>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
          </div>
        </div>
      </div>
      <pre className="bs-code"><code>transition-timing-function: {css};</code></pre>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default CubicBezier;
