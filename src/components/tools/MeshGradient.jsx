import { useEffect, useRef, useState } from 'react';
import { hexToRgb, oklchToRgbClamped, rgbToHex, rgbToOklab } from '../../utils/oklab';

// Mesh Gradient 2.0: настоящий меш-градиент на WebGL. Цветовые точки смешиваются
// в перцептивном OKLab (без «грязных» середин, как при смешивании в RGB), поле
// искажается шумом (domain warp), поверх — плёночное зерно. Точки тянутся мышью,
// двойной клик добавляет новую. Палитры-гармонии в OKLCH, экспорт PNG/JPG/WebP
// любого размера, CSS и SVG, анимация. Всё локально.

const MAX_PTS = 10;

const TEXT = {
  ru: {
    harmony: 'Гармония', reroll: 'Новая палитра', shuffle: 'Перемешать точки', points: 'Точек', add: '+ точка', remove: 'Удалить точку',
    softness: 'Мягкость', warp: 'Искажение', grain: 'Зерно', animate: 'Анимация', speed: 'Скорость', seed: 'Шум',
    size: 'Размер экспорта', format: 'Формат', download: 'Скачать', copyCss: 'CSS', copySvg: 'SVG', copied: 'Скопировано',
    favSave: '☆ В избранное', favs: 'Избранное', color: 'Цвет точки',
    hint: 'Тяните точки мышью, двойной клик по холсту — новая точка, клик по точке — выбрать и перекрасить.',
    note: 'Цвета смешиваются в OKLab, поэтому переходы чистые. CSS и SVG — упрощённые приближения; точная картинка — PNG/JPG/WebP.',
    h: { analogous: 'Аналоговая', complementary: 'Контраст', triadic: 'Триада', pastel: 'Пастель', dark: 'Тёмная', vivid: 'Сочная', mono: 'Монохром' },
  },
  en: {
    harmony: 'Harmony', reroll: 'New palette', shuffle: 'Shuffle points', points: 'Points', add: '+ point', remove: 'Remove point',
    softness: 'Softness', warp: 'Warp', grain: 'Grain', animate: 'Animate', speed: 'Speed', seed: 'Noise',
    size: 'Export size', format: 'Format', download: 'Download', copyCss: 'CSS', copySvg: 'SVG', copied: 'Copied',
    favSave: '☆ Save favorite', favs: 'Favorites', color: 'Point color',
    hint: 'Drag points with the mouse, double-click the canvas to add a point, click a point to select and recolor it.',
    note: 'Colors blend in OKLab, so transitions stay clean. CSS and SVG are simplified approximations; the exact image is PNG/JPG/WebP.',
    h: { analogous: 'Analogous', complementary: 'Contrast', triadic: 'Triadic', pastel: 'Pastel', dark: 'Dark', vivid: 'Vivid', mono: 'Mono' },
  },
};

const SIZES = [
  { id: 'fhd', label: '1920×1080', w: 1920, h: 1080 },
  { id: 'qhd', label: '2560×1440', w: 2560, h: 1440 },
  { id: '4k', label: '3840×2160', w: 3840, h: 2160 },
  { id: 'sq', label: '1080×1080', w: 1080, h: 1080 },
  { id: 'story', label: '1080×1920', w: 1080, h: 1920 },
  { id: 'phone', label: '1290×2796', w: 1290, h: 2796 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const lch = (L, C, h) => rgbToHex(...oklchToRgbClamped(L, C, ((h % 360) + 360) % 360));

function makePalette(kind, n) {
  const h0 = Math.random() * 360;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const f = i / n;
    switch (kind) {
      case 'complementary': out.push(lch(rand(0.55, 0.8), rand(0.12, 0.2), h0 + (i % 2 ? 180 : 0) + rand(-20, 20))); break;
      case 'triadic': out.push(lch(rand(0.6, 0.82), rand(0.12, 0.19), h0 + (i % 3) * 120 + rand(-15, 15))); break;
      case 'pastel': out.push(lch(rand(0.84, 0.94), rand(0.04, 0.09), h0 + f * 300)); break;
      case 'dark': out.push(lch(rand(0.2, 0.45), rand(0.06, 0.16), h0 + f * 140 + rand(-15, 15))); break;
      case 'vivid': out.push(lch(rand(0.62, 0.78), rand(0.2, 0.3), h0 + f * 360)); break;
      case 'mono': out.push(lch(0.3 + f * 0.6, rand(0.05, 0.14), h0 + rand(-8, 8))); break;
      default: out.push(lch(rand(0.6, 0.85), rand(0.1, 0.18), h0 + f * 90 + rand(-10, 10)));
    }
  }
  return out;
}
const makePoints = (colors) => colors.map((c) => ({ x: rand(0.08, 0.92), y: rand(0.08, 0.92), c, ph: rand(0, Math.PI * 2) }));

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform vec2 uRes; uniform int uN; uniform vec2 uPos[${MAX_PTS}]; uniform vec3 uCol[${MAX_PTS}];
uniform float uSoft; uniform float uWarp; uniform float uGrain; uniform float uTime; uniform float uSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
vec3 oklabToSrgb(vec3 c){
  float l = pow(c.x + 0.3963377774*c.y + 0.2158037573*c.z, 3.0);
  float m = pow(c.x - 0.1055613458*c.y - 0.0638541728*c.z, 3.0);
  float s = pow(c.x - 0.0894841775*c.y - 1.2914855480*c.z, 3.0);
  vec3 lin = vec3(4.0767416621*l - 3.3077115913*m + 0.2309699292*s, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s, -0.0041960863*l - 0.7034186147*m + 1.7076147010*s);
  lin = clamp(lin, 0.0, 1.0);
  return mix(12.92*lin, 1.055*pow(lin, vec3(1.0/2.4)) - 0.055, step(0.0031308, lin));
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; uv.y = 1.0 - uv.y;
  float asp = uRes.x / uRes.y;
  vec2 q = vec2(fbm(uv*2.5 + uTime*0.05), fbm(uv*2.5 + vec2(5.2, 1.3) - uTime*0.04));
  vec2 w = uv + (q - 0.5) * uWarp;
  vec3 acc = vec3(0.0); float tot = 0.0;
  for (int i = 0; i < ${MAX_PTS}; i++) {
    if (i >= uN) break;
    vec2 d = (w - uPos[i]) * vec2(asp, 1.0);
    float wt = 1.0 / pow(dot(d, d) + 0.0004, uSoft);
    acc += uCol[i] * wt; tot += wt;
  }
  vec3 col = oklabToSrgb(acc / tot);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  const U = { res: u('uRes'), n: u('uN'), pos: u('uPos'), col: u('uCol'), soft: u('uSoft'), warp: u('uWarp'), grain: u('uGrain'), time: u('uTime'), seed: u('uSeed') };
  return {
    render(pts, o, time = 0) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1i(U.n, pts.length);
      const pos = new Float32Array(MAX_PTS * 2); const col = new Float32Array(MAX_PTS * 3);
      pts.forEach((p, i) => {
        const dx = o.animate ? Math.sin(time * 0.6 * o.speed + p.ph) * 0.06 : 0;
        const dy = o.animate ? Math.cos(time * 0.5 * o.speed + p.ph * 1.3) * 0.06 : 0;
        pos[i * 2] = p.x + dx; pos[i * 2 + 1] = p.y + dy;
        const lab = rgbToOklab(...hexToRgb(p.c)); col.set(lab, i * 3);
      });
      gl.uniform2fv(U.pos, pos); gl.uniform3fv(U.col, col);
      gl.uniform1f(U.soft, o.softPow); gl.uniform1f(U.warp, o.warp); gl.uniform1f(U.grain, o.grain);
      gl.uniform1f(U.time, time * o.speed); gl.uniform1f(U.seed, o.seed);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

const FAV_KEY = 'vetor-mesh-favs';
function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }

function MeshGradient({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const stageRef = useRef(null);
  const [harmony, setHarmony] = useState('analogous');
  const [pts, setPts] = useState(() => makePoints(makePalette('analogous', 5)));
  const [sel, setSel] = useState(0);
  const [soft, setSoft] = useState(55);
  const [warp, setWarp] = useState(35);
  const [grain, setGrain] = useState(6);
  const [seed, setSeed] = useState(() => Math.round(rand(1, 999)));
  const [animate, setAnimate] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [sizeId, setSizeId] = useState('fhd');
  const [fmt, setFmt] = useState('png');
  const [copied, setCopied] = useState('');
  const [favs, setFavs] = useState(loadFavs);
  const [noGl, setNoGl] = useState(false);
  const size = SIZES.find((s) => s.id === sizeId);

  // Мягкость: больше — шире переходы (меньше степень затухания веса точки).
  const opts = { softPow: 3.2 - (soft / 100) * 2.5, warp: (warp / 100) * 0.45, grain: (grain / 100) * 0.18, animate, speed, seed };

  useEffect(() => {
    try { rendererRef.current = createRenderer(canvasRef.current); } catch (e) { console.error(e); rendererRef.current = null; }
    if (!rendererRef.current) setNoGl(true);
  }, []);

  // Превью: размер холста по пропорции экспорта, отрисовка (и цикл анимации).
  useEffect(() => {
    const c = canvasRef.current; const r = rendererRef.current; if (!c || !r) return undefined;
    const pw = 960; c.width = pw; c.height = Math.round(pw * (size.h / size.w));
    let raf = 0; const t0 = performance.now();
    const frame = () => { r.render(pts, opts, (performance.now() - t0) / 1000); if (animate) raf = requestAnimationFrame(frame); };
    frame();
    return () => cancelAnimationFrame(raf);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function reroll(kind = harmony) { const cols = makePalette(kind, pts.length); setPts((prev) => prev.map((p, i) => ({ ...p, c: cols[i] }))); }
  function shuffle() { setPts((prev) => prev.map((p) => ({ ...p, x: rand(0.08, 0.92), y: rand(0.08, 0.92) }))); setSeed(Math.round(rand(1, 999))); }
  function setCount(n) {
    setPts((prev) => {
      if (n < prev.length) return prev.slice(0, n);
      const extra = makePoints(makePalette(harmony, n - prev.length));
      return [...prev, ...extra];
    });
    setSel(0);
  }

  function stagePoint(e) {
    const r = stageRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  }
  function startPointDrag(e, i) {
    e.preventDefault(); e.stopPropagation(); setSel(i);
    const move = (ev) => { const p = stagePoint(ev); setPts((prev) => prev.map((q, k) => (k === i ? { ...q, ...p } : q))); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  function addPointAt(e) {
    if (pts.length >= MAX_PTS) return;
    const p = stagePoint(e);
    setPts((prev) => [...prev, { ...p, c: makePalette(harmony, 1)[0], ph: rand(0, 6.28) }]);
    setSel(pts.length);
  }

  async function download() {
    const c = document.createElement('canvas'); c.width = size.w; c.height = size.h;
    const r = createRenderer(c); if (!r) return;
    r.render(pts, { ...opts, animate: false }, 0);
    const mime = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`;
    c.toBlob((b) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `mesh-gradient-${size.w}x${size.h}.${fmt}`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      c.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
    }, mime, 0.93);
  }

  const cssText = () => {
    const bg = pts[0].c;
    const layers = pts.map((p) => `radial-gradient(at ${Math.round(p.x * 100)}% ${Math.round(p.y * 100)}%, ${p.c} 0px, transparent ${Math.round(40 + soft * 0.3)}%)`);
    return `background-color: ${bg};\nbackground-image:\n  ${layers.join(',\n  ')};`;
  };
  const svgText = () => {
    const W = size.w; const H = size.h; const R = Math.round(Math.max(W, H) * (0.35 + soft / 250));
    const defs = pts.map((p, i) => `<radialGradient id="g${i}" cx="${Math.round(p.x * W)}" cy="${Math.round(p.y * H)}" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.c}"/><stop offset="1" stop-color="${p.c}" stop-opacity="0"/></radialGradient>`).join('');
    const rects = pts.map((_, i) => `<rect width="${W}" height="${H}" fill="url(#g${i})"/>`).join('');
    const grainF = grain > 0 ? `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 ${(grain / 100 * 0.5).toFixed(2)} 0"/></filter>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}<filter id="b"><feGaussianBlur stdDeviation="${Math.round(R / 5)}"/></filter>${grainF}</defs><rect width="${W}" height="${H}" fill="${pts[0].c}"/><g filter="url(#b)">${rects}</g>${grain > 0 ? `<rect width="${W}" height="${H}" filter="url(#n)"/>` : ''}</svg>`;
  };
  function copy(kind) {
    navigator.clipboard?.writeText(kind === 'css' ? cssText() : svgText()).then(() => { setCopied(kind); setTimeout(() => setCopied(''), 1400); }).catch(() => {});
  }

  function saveFav() {
    const next = [{ pts, soft, warp, grain, seed }, ...favs].slice(0, 12);
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
  }
  function applyFav(f) { setPts(f.pts); setSoft(f.soft); setWarp(f.warp); setGrain(f.grain); setSeed(f.seed); setSel(0); }

  const selPt = pts[sel];

  return (
    <div className="tool-panel meshgrad">
      <div className="mg-layout">
        <div className="mg-stage" ref={stageRef} onDoubleClick={addPointAt} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
          <canvas ref={canvasRef} className="mg-canvas" />
          {noGl && <div className="mg-nogl">WebGL недоступен</div>}
          {pts.map((p, i) => (
            <button
              key={i} type="button" aria-label={`${t.color} ${i + 1}`}
              className={i === sel ? 'mg-pt is-sel' : 'mg-pt'}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: p.c }}
              onPointerDown={(e) => startPointDrag(e, i)}
            />
          ))}
        </div>

        <div className="mg-controls">
          <div className="tool-field">
            <span className="tool-field-label">{t.harmony}</span>
            <div className="mg-chips">
              {Object.keys(t.h).map((k) => (
                <button key={k} type="button" className={harmony === k ? 'mg-chip is-active' : 'mg-chip'} onClick={() => { setHarmony(k); reroll(k); }}>{t.h[k]}</button>
              ))}
            </div>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => reroll()}>🎲 {t.reroll}</button>
            <button type="button" className="tool-btn" onClick={shuffle}>⤨ {t.shuffle}</button>
          </div>

          <div className="mg-row">
            <label className="tool-field"><span className="tool-field-label">{t.points}: {pts.length}</span><input type="range" min="2" max={MAX_PTS} value={pts.length} onChange={(e) => setCount(Number(e.target.value))} /></label>
            {selPt && (
              <label className="tool-field"><span className="tool-field-label">{t.color} {sel + 1}</span>
                <span className="mg-color-row">
                  <input type="color" value={selPt.c} onChange={(e) => setPts((prev) => prev.map((q, k) => (k === sel ? { ...q, c: e.target.value } : q)))} />
                  {pts.length > 2 && <button type="button" className="tool-btn small ghost" onClick={() => { setPts((prev) => prev.filter((_, k) => k !== sel)); setSel(0); }}>{t.remove}</button>}
                </span>
              </label>
            )}
          </div>

          <label className="tool-field"><span className="tool-field-label">{t.softness}: {soft}</span><input type="range" min="0" max="100" value={soft} onChange={(e) => setSoft(Number(e.target.value))} /></label>
          <label className="tool-field"><span className="tool-field-label">{t.warp}: {warp}</span><input type="range" min="0" max="100" value={warp} onChange={(e) => setWarp(Number(e.target.value))} /></label>
          <label className="tool-field"><span className="tool-field-label">{t.grain}: {grain}</span><input type="range" min="0" max="100" value={grain} onChange={(e) => setGrain(Number(e.target.value))} /></label>
          <label className="tool-field"><span className="tool-field-label">{t.seed}: {seed}</span><input type="range" min="1" max="999" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></label>
          <div className="mg-row">
            <label className="tool-check"><input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> {t.animate}</label>
            {animate && <label className="tool-field"><span className="tool-field-label">{t.speed}: ×{speed}</span><input type="range" min="0.2" max="4" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>}
          </div>
        </div>
      </div>

      <div className="mg-export">
        <div className="tool-field">
          <span className="tool-field-label">{t.size}</span>
          <div className="segmented mg-sizes">
            {SIZES.map((s) => <button key={s.id} type="button" className={sizeId === s.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSizeId(s.id)}>{s.label}</button>)}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          <div className="segmented">
            {['png', 'jpg', 'webp'].map((f) => <button key={f} type="button" className={fmt === f ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}
          </div>
        </div>
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={download}>↓ {t.download} {size.label}</button>
          <button type="button" className="tool-btn" onClick={() => copy('css')}>{copied === 'css' ? `✓ ${t.copied}` : t.copyCss}</button>
          <button type="button" className="tool-btn" onClick={() => copy('svg')}>{copied === 'svg' ? `✓ ${t.copied}` : t.copySvg}</button>
          <button type="button" className="tool-btn ghost" onClick={saveFav}>{t.favSave}</button>
        </div>
      </div>

      {favs.length > 0 && (
        <div className="tool-field">
          <span className="tool-field-label">{t.favs}</span>
          <div className="mg-favs">
            {favs.map((f, i) => (
              <button
                key={i} type="button" className="mg-fav" onClick={() => applyFav(f)}
                style={{ backgroundColor: f.pts[0].c, backgroundImage: f.pts.map((p) => `radial-gradient(at ${Math.round(p.x * 100)}% ${Math.round(p.y * 100)}%, ${p.c} 0, transparent 60%)`).join(',') }}
              />
            ))}
          </div>
        </div>
      )}

      <p className="tool-local-note">🖱 {t.hint}</p>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default MeshGradient;
