import { useMemo, useRef, useState } from 'react';
import CodeExport from './shared/CodeExport';
import { hexToRgb, oklabToOklch, oklabToRgb, oklchToRgbClamped, rgbToHex, rgbToOklab } from '../../utils/oklab';

// Генератор градиентов: линейный, радиальный, конический; до 10 цветов, точки
// тянутся мышью по полосе (клик по полосе — новая точка). Смешивание в sRGB, OKLab
// или OKLCH: в CSS идёт `in oklch` плюс sRGB-запасной вариант из промежуточных
// точек, посчитанных так же, — старые браузеры видят почти тот же градиент.
// Экспорт: CSS, Tailwind, SVG и PNG. Всё локально.

const MAX_STOPS = 10;
const TEXT = {
  ru: {
    type: 'Тип', linear: 'Линейный', radial: 'Радиальный', conic: 'Конический',
    angle: 'Угол', shape: 'Форма', circle: 'Круг', ellipse: 'Эллипс', center: 'Центр',
    mix: 'Смешивание', stops: 'Цвета', add: '+ Цвет', remove: 'Убрать цвет',
    random: 'Случайный', reverse: 'Развернуть', svg: 'Скачать SVG', png: 'Скачать PNG',
    barHint: 'Тяните точки по полосе, клик по пустому месту — новый цвет.',
    mixHint: 'OKLCH и OKLab дают ровные переходы без «грязной» середины.',
    svgConic: 'SVG не умеет конические градиенты — для них есть PNG.',
  },
  en: {
    type: 'Type', linear: 'Linear', radial: 'Radial', conic: 'Conic',
    angle: 'Angle', shape: 'Shape', circle: 'Circle', ellipse: 'Ellipse', center: 'Center',
    mix: 'Interpolation', stops: 'Colors', add: '+ Color', remove: 'Remove color',
    random: 'Random', reverse: 'Reverse', svg: 'Download SVG', png: 'Download PNG',
    barHint: 'Drag the handles along the bar; click an empty spot to add a color.',
    mixHint: 'OKLCH and OKLab give even transitions without a muddy middle.',
    svgConic: 'SVG has no conic gradients — use PNG for those.',
  },
};

let uid = 0;
const stop = (color, pos) => ({ id: (uid += 1), color, pos });

const lab = (hex) => rgbToOklab(...hexToRgb(hex));

// Цвет между двумя точками в выбранном пространстве (t = 0..1).
function mixColor(a, b, t, space) {
  if (space === 'srgb') {
    const p = hexToRgb(a); const q = hexToRgb(b);
    return rgbToHex(...p.map((v, i) => v + (q[i] - v) * t));
  }
  const A = lab(a); const B = lab(b);
  if (space === 'oklab') return rgbToHex(...oklabToRgb(...A.map((v, i) => v + (B[i] - v) * t)));
  const [l1, c1, h1] = oklabToOklch(...A); const [l2, c2, h2] = oklabToOklch(...B);
  // серый не имеет оттенка — берём оттенок соседа, как это делает CSS
  const ha = c1 < 0.002 ? h2 : h1; const hb = c2 < 0.002 ? h1 : h2;
  let dh = hb - ha; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
  return rgbToHex(...oklchToRgbClamped(l1 + (l2 - l1) * t, c1 + (c2 - c1) * t, ha + dh * t));
}

// sRGB-стопы, повторяющие градиент в OKLab/OKLCH: по 6 промежуточных точек на каждый отрезок.
function expandStops(stops, space) {
  const s = [...stops].sort((x, y) => x.pos - y.pos);
  if (space === 'srgb') return s.map((x) => ({ color: x.color, pos: x.pos }));
  const out = [];
  for (let i = 0; i < s.length - 1; i += 1) {
    const a = s[i]; const b = s[i + 1]; const n = b.pos > a.pos ? 6 : 1;
    for (let k = 0; k < n; k += 1) out.push({ color: mixColor(a.color, b.color, k / n, space), pos: a.pos + ((b.pos - a.pos) * k) / n });
  }
  out.push({ color: s[s.length - 1].color, pos: s[s.length - 1].pos });
  return out;
}

const fmtPos = (p) => `${Math.round(p * 10) / 10}%`;

function gradientCss(o, stops, space) {
  const list = stops.map((s) => `${s.color} ${fmtPos(s.pos)}`).join(', ');
  const inSpace = space === 'srgb' ? '' : ` in ${space}`;
  if (o.type === 'linear') return `linear-gradient(${o.angle}deg${inSpace}, ${list})`;
  if (o.type === 'radial') return `radial-gradient(${o.shape} at ${o.cx}% ${o.cy}%${inSpace}, ${list})`;
  return `conic-gradient(from ${o.angle}deg at ${o.cx}% ${o.cy}%${inSpace}, ${list})`;
}

function randomStops() {
  const n = 2 + Math.floor(Math.random() * 3);
  const h0 = Math.random() * 360; const step = (40 + Math.random() * 100) * (Math.random() < 0.5 ? -1 : 1);
  return Array.from({ length: n }, (_, i) => {
    const L = 0.45 + Math.random() * 0.4; const C = 0.08 + Math.random() * 0.14;
    return stop(rgbToHex(...oklchToRgbClamped(L, C, (h0 + step * i + 360) % 360)), Math.round((i / (n - 1)) * 100));
  });
}

function svgFor(o, stops, space) {
  const ex = expandStops(stops, space);
  const st = ex.map((s) => `<stop offset="${fmtPos(s.pos)}" stop-color="${s.color}"/>`).join('');
  let def;
  if (o.type === 'linear') {
    // CSS-угол: 0deg — вверх, по часовой; для SVG считаем концы линии в рамке 1×1
    const r = ((o.angle - 90) * Math.PI) / 180; const dx = Math.cos(r) / 2; const dy = Math.sin(r) / 2;
    def = `<linearGradient id="g" x1="${0.5 - dx}" y1="${0.5 - dy}" x2="${0.5 + dx}" y2="${0.5 + dy}">${st}</linearGradient>`;
  } else {
    def = `<radialGradient id="g" cx="${o.cx / 100}" cy="${o.cy / 100}" r="0.71">${st}</radialGradient>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" preserveAspectRatio="none"><defs>${def.replace('id="g"', 'id="g" gradientUnits="objectBoundingBox"')}</defs><rect width="1600" height="900" fill="url(#g)"/></svg>`;
}

function pngFor(o, stops, space, w = 1920, h = 1080) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  let g;
  if (o.type === 'linear') {
    const r = ((o.angle - 90) * Math.PI) / 180;
    const half = (Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))) / 2; // длина линии как в CSS
    g = x.createLinearGradient(w / 2 - Math.cos(r) * half, h / 2 - Math.sin(r) * half, w / 2 + Math.cos(r) * half, h / 2 + Math.sin(r) * half);
  } else if (o.type === 'radial') {
    const cx = (o.cx / 100) * w; const cy = (o.cy / 100) * h;
    const R = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
    g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
  } else {
    g = x.createConicGradient(((o.angle - 90) * Math.PI) / 180, (o.cx / 100) * w, (o.cy / 100) * h);
  }
  expandStops(stops, space).forEach((s) => g.addColorStop(Math.min(1, Math.max(0, s.pos / 100)), s.color));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  if (o.type === 'radial' && o.shape === 'ellipse') {
    // эллипс: растягиваем круговой градиент по пропорциям кадра
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const y = c2.getContext('2d');
    const cx = (o.cx / 100) * w; const cy = (o.cy / 100) * h; const R = Math.max(w, h);
    y.translate(cx, cy); y.scale(w / R, h / R);
    const g2 = y.createRadialGradient(0, 0, 0, 0, 0, R * Math.SQRT2 * Math.max(Math.max(cx, w - cx) / w, Math.max(cy, h - cy) / h));
    expandStops(stops, space).forEach((s) => g2.addColorStop(Math.min(1, Math.max(0, s.pos / 100)), s.color));
    y.fillStyle = g2; y.fillRect(-R * 2, -R * 2, R * 4, R * 4);
    return c2;
  }
  return c;
}

function save(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function GradientGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const barRef = useRef(null);
  const [type, setType] = useState('linear');
  const [angle, setAngle] = useState(135);
  const [shape, setShape] = useState('circle');
  const [cx, setCx] = useState(50);
  const [cy, setCy] = useState(50);
  const [space, setSpace] = useState('oklch');
  const [stops, setStops] = useState(() => [stop('#6166ff', 0), stop('#ff5c63', 100)]);
  const [active, setActive] = useState(null);

  const o = { type, angle, shape, cx, cy };
  const sorted = useMemo(() => [...stops].sort((a, b) => a.pos - b.pos), [stops]);
  const modern = gradientCss(o, sorted, space);
  const fallback = gradientCss(o, expandStops(sorted, space), 'srgb');
  const decls = space === 'srgb' ? [['background', modern]] : [['background', fallback], ['background', modern]];
  const barCss = `linear-gradient(90deg${space === 'srgb' ? '' : ` in ${space}`}, ${sorted.map((s) => `${s.color} ${fmtPos(s.pos)}`).join(', ')})`;

  const update = (id, patch) => setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id) => setStops((prev) => (prev.length > 2 ? prev.filter((s) => s.id !== id) : prev));

  function posFromEvent(e) {
    const r = barRef.current.getBoundingClientRect();
    return Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
  }

  function onBarDown(e) {
    if (e.target !== barRef.current || stops.length >= MAX_STOPS) return;
    const pos = posFromEvent(e);
    const before = [...sorted].reverse().find((s) => s.pos <= pos) || sorted[0];
    const after = sorted.find((s) => s.pos >= pos) || sorted[sorted.length - 1];
    const k = after.pos === before.pos ? 0 : (pos - before.pos) / (after.pos - before.pos);
    const s = stop(mixColor(before.color, after.color, k, space), Math.round(pos));
    setStops((prev) => [...prev, s]); setActive(s.id);
  }

  function onHandleDown(e, id) {
    e.preventDefault(); e.stopPropagation(); setActive(id);
    const el = e.currentTarget; el.setPointerCapture(e.pointerId);
    const move = (ev) => update(id, { pos: Math.round(posFromEvent(ev)) });
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  }

  function onHandleKey(e, s) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); update(s.id, { pos: Math.min(100, Math.max(0, s.pos + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1))) }); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(s.id); }
  }

  function addStop() {
    if (stops.length >= MAX_STOPS) return;
    const s = stop(mixColor(sorted[0].color, sorted[sorted.length - 1].color, 0.5, space), 50);
    setStops((prev) => [...prev, s]); setActive(s.id);
  }

  return (
    <div className="tool-panel gradient-generator">
      <div className="gg-preview" style={{ background: fallback, backgroundImage: modern }} />

      <div className="gg-bar-wrap">
        <div ref={barRef} className="gg-bar" style={{ background: barCss }} onPointerDown={onBarDown}>
          {stops.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === active ? 'gg-handle is-active' : 'gg-handle'}
              style={{ left: `${s.pos}%`, background: s.color }}
              aria-label={`${s.color} ${s.pos}%`}
              onPointerDown={(e) => onHandleDown(e, s.id)}
              onKeyDown={(e) => onHandleKey(e, s)}
              onDoubleClick={() => remove(s.id)}
            />
          ))}
        </div>
        <p className="tool-local-note">{t.barHint}</p>
      </div>

      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.type}</span>
          <div className="segmented">
            {['linear', 'radial', 'conic'].map((k) => (
              <button key={k} type="button" className={type === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setType(k)}>{t[k]}</button>
            ))}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.mix}</span>
          <div className="segmented">
            {[['oklch', 'OKLCH'], ['oklab', 'OKLab'], ['srgb', 'sRGB']].map(([k, l]) => (
              <button key={k} type="button" className={space === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSpace(k)}>{l}</button>
            ))}
          </div>
        </div>
        {type !== 'radial' && (
          <label className="tool-field">
            <span className="tool-field-label">{t.angle}: {angle}°</span>
            <input type="range" min="0" max="360" value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
          </label>
        )}
        {type === 'radial' && (
          <div className="tool-field">
            <span className="tool-field-label">{t.shape}</span>
            <div className="segmented">
              {['circle', 'ellipse'].map((k) => (
                <button key={k} type="button" className={shape === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setShape(k)}>{t[k]}</button>
              ))}
            </div>
          </div>
        )}
        {type !== 'linear' && (
          <>
            <label className="tool-field"><span className="tool-field-label">{t.center} X: {cx}%</span><input type="range" min="0" max="100" value={cx} onChange={(e) => setCx(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.center} Y: {cy}%</span><input type="range" min="0" max="100" value={cy} onChange={(e) => setCy(Number(e.target.value))} /></label>
          </>
        )}
      </div>

      <div className="gg-stops">
        <span className="tool-field-label">{t.stops} ({stops.length}/{MAX_STOPS})</span>
        {sorted.map((s) => (
          <div key={s.id} className={s.id === active ? 'gg-stop is-active' : 'gg-stop'} onFocus={() => setActive(s.id)}>
            <input type="color" value={s.color} onChange={(e) => update(s.id, { color: e.target.value })} />
            <input type="text" className="gg-stop-hex" value={s.color} spellCheck={false} onChange={(e) => update(s.id, { color: e.target.value })} />
            <input type="range" min="0" max="100" value={s.pos} onChange={(e) => update(s.id, { pos: Number(e.target.value) })} />
            <span className="gg-stop-pos">{s.pos}%</span>
            {stops.length > 2 && <button type="button" className="tool-btn small ghost" aria-label={t.remove} onClick={() => remove(s.id)}>✕</button>}
          </div>
        ))}
        <div className="tool-actions">
          {stops.length < MAX_STOPS && <button type="button" className="tool-btn small" onClick={addStop}>{t.add}</button>}
          <button type="button" className="tool-btn small" onClick={() => { setStops(randomStops()); setAngle(Math.round(Math.random() * 360)); }}>🎲 {t.random}</button>
          <button type="button" className="tool-btn small" onClick={() => setStops((prev) => prev.map((s) => ({ ...s, pos: 100 - s.pos })))}>⇄ {t.reverse}</button>
        </div>
      </div>

      <CodeExport language={language} decls={decls} />

      <div className="tool-actions">
        <button type="button" className="tool-btn" disabled={type === 'conic'} title={type === 'conic' ? t.svgConic : ''} onClick={() => save(new Blob([svgFor(o, sorted, space)], { type: 'image/svg+xml' }), 'gradient.svg')}>{t.svg}</button>
        <button type="button" className="tool-btn" onClick={() => pngFor(o, sorted, space).toBlob((b) => save(b, 'gradient.png'), 'image/png')}>{t.png}</button>
      </div>
      <p className="tool-local-note">✨ {t.mixHint}{type === 'conic' ? ` ${t.svgConic}` : ''}</p>
    </div>
  );
}

export default GradientGenerator;
