import { useEffect, useRef, useState } from 'react';

// Композиционные сетки поверх изображения: трети, фи-сетка, диагонали,
// золотые треугольники и настоящая золотая спираль Фибоначчи — строится
// в прямоугольнике с отношением φ (вписан в кадр или растянут на него),
// 4 ориентации. Сетка рисуется в пикселях картинки, без искажений пропорций.
// Экспорт кадра с наложенной сеткой в PNG. Всё локально.

const PHI = (1 + Math.sqrt(5)) / 2;

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    change: 'Другое', thirds: 'Трети', golden: 'Фи-сетка', diagonals: 'Диагонали', triangles: 'Золотые треугольники', spiral: 'Золотая спираль',
    grid: 'Сетка', orient: 'Ориентация', fit: 'Прямоугольник φ', fitIn: 'Вписать (точно)', stretch: 'Растянуть на кадр', squares: 'Квадраты',
    color: 'Цвет', width: 'Толщина', opacity: 'Непрозрачность', save: 'Скачать PNG с сеткой',
    note: 'Ключевые объекты лучше размещать на линиях, их пересечениях и в «глазе» спирали.',
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally',
    change: 'Another', thirds: 'Thirds', golden: 'Phi grid', diagonals: 'Diagonals', triangles: 'Golden triangles', spiral: 'Golden spiral',
    grid: 'Grid', orient: 'Orientation', fit: 'φ rectangle', fitIn: 'Fit (exact)', stretch: 'Stretch to frame', squares: 'Squares',
    color: 'Color', width: 'Width', opacity: 'Opacity', save: 'Download PNG with grid',
    note: 'Place key subjects on the lines, their intersections and in the eye of the spiral.',
  },
};

const GRIDS = ['thirds', 'golden', 'diagonals', 'triangles', 'spiral'];
const ORIENTS = [['↘', false, false], ['↙', true, false], ['↗', false, true], ['↖', true, true]];

// Спираль в единичном горизонтальном прямоугольнике φ×1: отрезаем квадраты
// (слева, сверху, справа, снизу) и в каждом рисуем четверть окружности.
function spiralUnit(turns = 12) {
  let x = 0; let y = 0; let w = PHI; let h = 1;
  const pts = []; const squares = [];
  for (let i = 0; i < turns; i += 1) {
    const dir = i % 4; let cx; let cy; let s; let a0;
    if (dir === 0) { s = h; cx = x + s; cy = y + s; a0 = Math.PI; squares.push([x + s, y, x + s, y + h]); x += s; w -= s; }
    else if (dir === 1) { s = w; cx = x; cy = y + s; a0 = Math.PI * 1.5; squares.push([x, y + s, x + w, y + s]); y += s; h -= s; }
    else if (dir === 2) { s = h; cx = x + w - s; cy = y; a0 = 0; squares.push([x + w - s, y, x + w - s, y + h]); w -= s; }
    else { s = w; cx = x + s; cy = y + h - s; a0 = Math.PI / 2; squares.push([x, y + h - s, x + w, y + h - s]); h -= s; }
    for (let k = i === 0 ? 0 : 1; k <= 24; k += 1) { const a = a0 + (k / 24) * (Math.PI / 2); pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]); }
  }
  return { pts, squares };
}
const SPIRAL = spiralUnit();

// Все элементы сетки как список отрезков/полилиний в пикселях картинки.
function buildGrid(type, W, H, { flipX, flipY, fit }) {
  const lines = []; const points = [];
  const fx = (x) => (flipX ? W - x : x); const fy = (y) => (flipY ? H - y : y);
  const seg = (x1, y1, x2, y2) => lines.push([[fx(x1), fy(y1)], [fx(x2), fy(y2)]]);
  if (type === 'thirds' || type === 'golden') {
    const r = type === 'thirds' ? [1 / 3, 2 / 3] : [1 - 1 / PHI, 1 / PHI];
    r.forEach((k) => { seg(W * k, 0, W * k, H); seg(0, H * k, W, H * k); });
    r.forEach((a) => r.forEach((b) => points.push([W * a, H * b])));
  } else if (type === 'diagonals') {
    // диагонали + «рычаги» из углов (барочная/зловещая диагональ)
    seg(0, 0, W, H); seg(W, 0, 0, H);
    const m = Math.min(W, H); seg(0, 0, m, m); seg(W, 0, W - m, m); seg(0, H, m, H - m); seg(W, H, W - m, H - m);
  } else if (type === 'triangles') {
    // диагональ + перпендикуляры к ней из двух других углов
    seg(0, H, W, 0);
    const foot = (px, py) => { const dx = W; const dy = -H; const tt = ((px - 0) * dx + (py - H) * dy) / (dx * dx + dy * dy); return [tt * dx, H + tt * dy]; };
    const a = foot(0, 0); const b = foot(W, H); seg(0, 0, a[0], a[1]); seg(W, H, b[0], b[1]);
    points.push([fx(a[0]), fy(a[1])], [fx(b[0]), fy(b[1])]);
    return { lines, points };
  } else if (type === 'spiral') {
    const portrait = H > W;
    // размеры прямоугольника φ в пикселях: вписанный (точные пропорции) или растянутый
    let rw = W; let rh = H;
    if (fit) { const long = portrait ? H : W; const short = portrait ? W : H; const L = Math.min(long, short * PHI); const S = L / PHI; rw = portrait ? S : L; rh = portrait ? L : S; }
    const ox = (W - rw) / 2; const oy = (H - rh) / 2;
    // единичные координаты (u ∈ [0,φ], v ∈ [0,1]) → пиксели; для портрета меняем оси
    const map = ([u, v]) => { const a = u / PHI; const px = portrait ? ox + v * rw : ox + a * rw; const py = portrait ? oy + a * rh : oy + v * rh; return [fx(px), fy(py)]; };
    lines.push(SPIRAL.pts.map(map));
    const squares = SPIRAL.squares.slice(0, 8).map(([x1, y1, x2, y2]) => [map([x1, y1]), map([x2, y2])]);
    const frame = [[0, 0], [PHI, 0], [PHI, 1], [0, 1], [0, 0]].map(map);
    return { lines, points, squares, frame };
  }
  return { lines, points };
}

function RuleOfThirds({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [img, setImg] = useState(null);
  const [grid, setGrid] = useState('thirds');
  const [orient, setOrient] = useState(0);
  const [fit, setFit] = useState(true);
  const [showSquares, setShowSquares] = useState(true);
  const [color, setColor] = useState('#ffffff');
  const [width, setWidth] = useState(2);
  const [opacity, setOpacity] = useState(0.85);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const i = new Image(); i.onload = () => setImg(i); i.src = URL.createObjectURL(file);
  }

  useEffect(() => {
    const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) loadFile(f); };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  }, []);

  const W = img?.naturalWidth || 1; const H = img?.naturalHeight || 1;
  const [, flipX, flipY] = ORIENTS[orient];
  const g = buildGrid(grid, W, H, { flipX, flipY, fit });
  const sw = (width * Math.max(W, H)) / 900; // толщина в пикселях картинки ≈ одинакова на экране
  const poly = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  const svg = (
    <svg className="rot-grid" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} fill="none" stroke={color} strokeWidth={sw} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round">
      {g.frame && fit && <polyline points={poly(g.frame)} strokeDasharray={`${sw * 4} ${sw * 3}`} strokeWidth={sw * 0.7} />}
      {g.squares && showSquares && g.squares.map((s, i) => <polyline key={`s${i}`} points={poly(s)} strokeWidth={sw * 0.6} strokeOpacity={opacity * 0.7} />)}
      {g.lines.map((l, i) => <polyline key={`l${i}`} points={poly(l)} />)}
      {g.points.map((p, i) => <circle key={`p${i}`} cx={p[0]} cy={p[1]} r={sw * 2.2} fill={color} fillOpacity={opacity} stroke="none" />)}
    </svg>
  );

  const svgRef = useRef(null);
  function save() {
    const node = svgRef.current?.querySelector('svg'); if (!node || !img) return;
    const xml = new XMLSerializer().serializeToString(node).replace('class="rot-grid"', `width="${W}" height="${H}"`);
    const over = new Image();
    over.onload = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      x.drawImage(img, 0, 0); x.drawImage(over, 0, 0, W, H);
      c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `composition-${grid}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png');
    };
    over.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }

  const orientable = grid === 'spiral' || grid === 'triangles';

  return (
    <div className="tool-panel rot-tool">
      {!img ? (
        <button
          type="button"
          className="tool-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
        >
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="tool-field">
            <span className="tool-field-label">{t.grid}</span>
            <div className="segmented">
              {GRIDS.map((k) => (
                <button key={k} type="button" className={k === grid ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setGrid(k)}>{t[k]}</button>
              ))}
            </div>
          </div>

          {orientable && (
            <div className="tool-actions">
              <div className="tool-field"><span className="tool-field-label">{t.orient}</span>
                <div className="segmented">
                  {ORIENTS.map(([label], i) => <button key={label} type="button" className={i === orient ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setOrient(i)}>{label}</button>)}
                </div>
              </div>
              {grid === 'spiral' && (
                <>
                  <div className="tool-field"><span className="tool-field-label">{t.fit}</span>
                    <div className="segmented">
                      <button type="button" className={fit ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFit(true)}>{t.fitIn}</button>
                      <button type="button" className={!fit ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFit(false)}>{t.stretch}</button>
                    </div>
                  </div>
                  <label className="tool-check"><input type="checkbox" checked={showSquares} onChange={(e) => setShowSquares(e.target.checked)} /> {t.squares}</label>
                </>
              )}
            </div>
          )}

          <div className="tool-actions">
            <label className="t3-color"><span className="tool-field-label">{t.color}</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.width}: {width}</span><input type="range" min="0.5" max="6" step="0.5" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.opacity}: {Math.round(opacity * 100)}%</span><input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
          </div>

          <div
            className="rot-canvas"
            ref={svgRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
          >
            <img src={img.src} alt="" className="rot-img" />
            {svg}
          </div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
            <button type="button" className="tool-btn" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">📐 {t.note}</p>
    </div>
  );
}

export default RuleOfThirds;
