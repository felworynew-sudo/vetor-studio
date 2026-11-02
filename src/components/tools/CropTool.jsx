import { useCallback, useEffect, useRef, useState } from 'react';

// Обрезка изображения рамкой: перетаскивание и ресайз за уголки/грани, пресеты
// пропорций (свободно, 1:1, 4:3, 16:9 и др.), затемнение вне кадра и сетка
// третей. Поворот на 90°, отражение, наклон на любой угол (пустые углы срезаются)
// и выравнивание горизонта по линии; точный размер рамки в пикселях.
// Всё локально: пиксели режутся из оригинала в полном разрешении.

const RATIOS = [
  { id: 'free', label: '⤢', ru: 'Свободно', en: 'Free', r: null },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:3', label: '4:3', r: 4 / 3 },
  { id: '3:4', label: '3:4', r: 3 / 4 },
  { id: '3:2', label: '3:2', r: 3 / 2 },
  { id: '2:3', label: '2:3', r: 2 / 3 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
  { id: '9:16', label: '9:16', r: 9 / 16 },
  { id: '5:4', label: '5:4', r: 5 / 4 },
];

const TEXT = {
  ru: {
    drop: 'Перетащите изображение или нажмите', hint: 'PNG, JPG, WebP, GIF, BMP — обрабатывается локально',
    ratio: 'Пропорции', reset: 'Сбросить рамку', change: 'Другое', download: 'Скачать',
    format: 'Формат', size: 'Размер кадра', apply: 'Обрезать и скачать',
    rotL: 'Повернуть влево', rotR: 'Повернуть вправо', flipH: 'Отразить по горизонтали', flipV: 'Отразить по вертикали',
    angle: 'Наклон', trim: 'Срезать пустые углы', horizon: 'Выровнять по горизонту', horizonCancel: 'Отмена',
    horizonHint: 'Проведите линию вдоль горизонта или любой линии, которая должна стать ровной.',
    width: 'Ширина', height: 'Высота', px: 'px',
    note: 'Перетаскивайте рамку и тяните за уголки. Обрезка в исходном качестве, без загрузки на сервер.',
  },
  en: {
    drop: 'Drop an image or click', hint: 'PNG, JPG, WebP, GIF, BMP — processed locally',
    ratio: 'Aspect', reset: 'Reset frame', change: 'Another', download: 'Download',
    format: 'Format', size: 'Crop size', apply: 'Crop & download',
    rotL: 'Rotate left', rotR: 'Rotate right', flipH: 'Flip horizontally', flipV: 'Flip vertically',
    angle: 'Tilt', trim: 'Trim empty corners', horizon: 'Straighten by horizon', horizonCancel: 'Cancel',
    horizonHint: 'Draw a line along the horizon or any line that should become level.',
    width: 'Width', height: 'Height', px: 'px',
    note: 'Drag the frame and pull the corners. Cropped at full quality, nothing is uploaded.',
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const NO_XF = { rot: 0, flipH: false, flipV: false, angle: 0, trim: true };
const isIdentity = (x) => !x.rot && !x.flipH && !x.flipV && !x.angle;

// Самый большой прямоугольник без пустых углов внутри повёрнутого кадра w×h.
function innerRect(w, h, rad) {
  const s = Math.abs(Math.sin(rad)); const c = Math.abs(Math.cos(rad));
  if (s < 1e-9) return [w, h];
  const long = Math.max(w, h); const short = Math.min(w, h);
  if (short <= 2 * s * c * long || Math.abs(s - c) < 1e-10) {
    const x = short / 2;
    return w >= h ? [x / s, x / c] : [x / c, x / s];
  }
  const c2 = c * c - s * s;
  return [(w * c - h * s) / c2, (h * c - w * s) / c2];
}

// Рабочий холст: поворот на 90°, отражения и наклон применяются к оригиналу один раз.
function transformImage(img, x) {
  const W = img.naturalWidth; const H = img.naturalHeight;
  const quarter = x.rot % 180 !== 0;
  const bw = quarter ? H : W; const bh = quarter ? W : H; // после поворота на 90°
  const rad = (x.angle * Math.PI) / 180;
  let cw = bw; let ch = bh;
  if (rad) {
    if (x.trim) [cw, ch] = innerRect(bw, bh, rad);
    else { cw = bw * Math.abs(Math.cos(rad)) + bh * Math.abs(Math.sin(rad)); ch = bw * Math.abs(Math.sin(rad)) + bh * Math.abs(Math.cos(rad)); }
  }
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.floor(cw)); c.height = Math.max(1, Math.floor(ch));
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(rad + (x.rot * Math.PI) / 180);
  ctx.scale(x.flipH ? -1 : 1, x.flipV ? -1 : 1);
  ctx.drawImage(img, -W / 2, -H / 2);
  return c;
}

function CropTool({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const wrapRef = useRef(null);
  const drag = useRef(null);

  const [src, setSrc] = useState('');
  const [orig, setOrig] = useState(null); // { img, url } — исходник
  const [xf, setXf] = useState(NO_XF);
  const workRef = useRef(null); // холст или <img>, из которого режем
  const [horizon, setHorizon] = useState(null); // null | { a, b } — линия в display px
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 }); // размер отображаемой картинки (display px)
  const [ratioId, setRatioId] = useState('free');
  const [crop, setCrop] = useState(null); // {left,top,right,bottom} в display px
  const [fmt, setFmt] = useState('image/png');

  const ratio = RATIOS.find((r) => r.id === ratioId)?.r || null;

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setOrig((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { img, url }; }); setXf(NO_XF); };
    img.src = url;
    setCrop(null);
  }

  // Пересобираем рабочую картинку при каждом повороте/отражении/наклоне.
  useEffect(() => {
    if (!orig) return undefined;
    if (isIdentity(xf)) { workRef.current = orig.img; setSrc(orig.url); return undefined; }
    let alive = true; let url = '';
    const id = setTimeout(() => {
      const c = transformImage(orig.img, xf); workRef.current = c;
      c.toBlob((b) => { if (!alive || !b) return; url = URL.createObjectURL(b); setSrc(url); }, 'image/webp', 0.9);
    }, 60);
    return () => { alive = false; clearTimeout(id); if (url) setTimeout(() => URL.revokeObjectURL(url), 2000); };
  }, [orig, xf]);

  const setX = (patch) => { setHorizon(null); setXf((p) => ({ ...p, ...patch })); };
  const rotate = (d) => setX({ rot: (xf.rot + d + 360) % 360 });

  // Когда картинка отрисовалась — считаем её отображаемый размер и ставим рамку.
  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const b = { w: img.clientWidth, h: img.clientHeight };
    setNat({ w: img.naturalWidth, h: img.naturalHeight });
    setBox(b);
    setCrop(fitRatio({ left: 0, top: 0, right: b.w, bottom: b.h }, ratio, b, true));
  }, [ratio]);

  // Вписать/поправить рамку под пропорцию (centered), в пределах картинки.
  function fitRatio(c, r, b, initial) {
    if (!r) {
      if (initial) { const m = Math.min(b.w, b.h) * 0.12; return { left: m, top: m, right: b.w - m, bottom: b.h - m }; }
      return c;
    }
    const cx = (c.left + c.right) / 2; const cy = (c.top + c.bottom) / 2;
    let w = c.right - c.left; let h = c.bottom - c.top;
    if (initial) { w = b.w; h = b.h; }
    if (w / h > r) w = h * r; else h = w / r;
    // ужать под границы
    if (w > b.w) { w = b.w; h = w / r; }
    if (h > b.h) { h = b.h; w = h * r; }
    let left = clamp(cx - w / 2, 0, b.w - w);
    let top = clamp(cy - h / 2, 0, b.h - h);
    return { left, top, right: left + w, bottom: top + h };
  }

  function selectRatio(id) {
    setRatioId(id);
    const r = RATIOS.find((x) => x.id === id)?.r || null;
    if (crop) setCrop(fitRatio(crop, r, box, false));
  }

  function resetFrame() {
    setCrop(fitRatio({ left: 0, top: 0, right: box.w, bottom: box.h }, ratio, box, true));
  }

  // --- Drag / resize ---
  // Выравнивание горизонта: пользователь проводит линию, она становится ровной.
  const lineRef = useRef(null); // { a, b } — линия, пока её тянут (ref: события идут быстрее рендера)
  function onHorizonDown(e) {
    e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = pointer(e); lineRef.current = { a: p, b: p }; setHorizon({ a: p, b: p, drawing: true });
  }
  function onHorizonMove(e) {
    if (!lineRef.current) return;
    lineRef.current = { ...lineRef.current, b: pointer(e) }; setHorizon({ ...lineRef.current, drawing: true });
  }
  function onHorizonUp(e) {
    const line = lineRef.current; if (!line) return;
    lineRef.current = null;
    const b = pointer(e); const dx = b.x - line.a.x; const dy = b.y - line.a.y;
    if (Math.hypot(dx, dy) < 12) { setHorizon({ a: line.a, b: line.a, drawing: false }); return; }
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg > 90) deg -= 180; if (deg < -90) deg += 180;
    if (Math.abs(deg) > 45) deg -= Math.sign(deg) * 90; // почти вертикальная линия — выравниваем по вертикали
    setHorizon(null);
    setXf((x) => ({ ...x, angle: clamp(Math.round((x.angle - deg) * 10) / 10, -45, 45) }));
  }

  // Точный размер рамки: в пикселях исходника, центр рамки остаётся на месте.
  function setExact(dim, value) {
    const v = Number(value); if (!crop || !v || v < 1) return;
    const sx = nat.w / box.w; const sy = nat.h / box.h;
    let w = crop.right - crop.left; let h = crop.bottom - crop.top;
    if (dim === 'w') { w = Math.min(box.w, v / sx); if (ratio) h = w / ratio; } else { h = Math.min(box.h, v / sy); if (ratio) w = h * ratio; }
    if (w > box.w) { w = box.w; if (ratio) h = w / ratio; }
    if (h > box.h) { h = box.h; if (ratio) w = h * ratio; }
    const cx = (crop.left + crop.right) / 2; const cy = (crop.top + crop.bottom) / 2;
    const left = clamp(cx - w / 2, 0, box.w - w); const top = clamp(cy - h / 2, 0, box.h - h);
    setCrop({ left, top, right: left + w, bottom: top + h });
  }

  function pointer(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    return { x: clamp(e.clientX - rect.left, 0, box.w), y: clamp(e.clientY - rect.top, 0, box.h) };
  }
  function onDown(mode) {
    return (e) => {
      e.stopPropagation(); e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { mode, start: pointer(e), crop };
    };
  }
  function onMove(e) {
    if (!drag.current) return;
    const p = pointer(e);
    const { mode, start, crop: c0 } = drag.current;
    const dx = p.x - start.x; const dy = p.y - start.y;
    const min = 24;
    if (mode === 'move') {
      const w = c0.right - c0.left; const h = c0.bottom - c0.top;
      const left = clamp(c0.left + dx, 0, box.w - w);
      const top = clamp(c0.top + dy, 0, box.h - h);
      setCrop({ left, top, right: left + w, bottom: top + h });
      return;
    }
    let { left, top, right, bottom } = c0;
    if (mode.includes('e')) right = clamp(p.x, left + min, box.w);
    if (mode.includes('w')) left = clamp(p.x, 0, right - min);
    if (mode.includes('s')) bottom = clamp(p.y, top + min, box.h);
    if (mode.includes('n')) top = clamp(p.y, 0, bottom - min);
    if (ratio) {
      let w = right - left; let h = bottom - top;
      const horiz = mode.includes('e') || mode.includes('w');
      const vert = mode.includes('n') || mode.includes('s');
      if (horiz && !vert) h = w / ratio;
      else if (vert && !horiz) w = h * ratio;
      else if (w / ratio > h) h = w / ratio; else w = h * ratio;
      // фиксируем «якорную» сторону, двигаем противоположную
      if (mode.includes('w')) left = right - w; else right = left + w;
      if (mode.includes('n')) top = bottom - h; else bottom = top + h;
      // если вышли за границы — подвинуть внутрь, сохраняя размер
      if (left < 0) { right -= left; left = 0; }
      if (top < 0) { bottom -= top; top = 0; }
      if (right > box.w) { left -= right - box.w; right = box.w; }
      if (bottom > box.h) { top -= bottom - box.h; bottom = box.h; }
    }
    setCrop({ left, top, right, bottom });
  }
  function onUp() { drag.current = null; }

  function doCrop(download) {
    if (!crop || !nat.w) return null;
    const sx = nat.w / box.w; const sy = nat.h / box.h;
    const w = Math.round((crop.right - crop.left) * sx);
    const h = Math.round((crop.bottom - crop.top) * sy);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (fmt === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(workRef.current || imgRef.current, crop.left * sx, crop.top * sy, w, h, 0, 0, w, h);
    if (!download) return cv;
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `crop-${w}x${h}.${{ 'image/jpeg': 'jpg', 'image/webp': 'webp' }[fmt] || 'png'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, fmt, 0.92);
    return cv;
  }

  const cw = crop ? Math.round((crop.right - crop.left) * (nat.w / box.w)) : 0;
  const ch = crop ? Math.round((crop.bottom - crop.top) * (nat.h / box.h)) : 0;

  return (
    <div className="tool-panel crop-tool">
      {!src ? (
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
          <div className="crop-ratios">
            <span className="tool-field-label">{t.ratio}</span>
            <div className="crop-ratio-btns">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={ratioId === r.id ? 'crop-ratio is-active' : 'crop-ratio'}
                  onClick={() => selectRatio(r.id)}
                  title={r.ru && (r[language] || r.ru)}
                >
                  {r.id === 'free' ? `${r.label} ${r[language] || r.ru}` : r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="crop-xf">
            <button type="button" className="tool-btn small" title={t.rotL} aria-label={t.rotL} onClick={() => rotate(-90)}>⟲ 90°</button>
            <button type="button" className="tool-btn small" title={t.rotR} aria-label={t.rotR} onClick={() => rotate(90)}>⟳ 90°</button>
            <button type="button" className={xf.flipH ? 'tool-btn small is-active' : 'tool-btn small'} title={t.flipH} aria-label={t.flipH} onClick={() => setX({ flipH: !xf.flipH })}>⇋</button>
            <button type="button" className={xf.flipV ? 'tool-btn small is-active' : 'tool-btn small'} title={t.flipV} aria-label={t.flipV} onClick={() => setX({ flipV: !xf.flipV })}>⥮</button>
            <label className="tool-field crop-angle">
              <span className="tool-field-label">{t.angle}: {xf.angle.toFixed(1)}°</span>
              <input type="range" min="-45" max="45" step="0.1" value={xf.angle} onChange={(e) => setX({ angle: Number(e.target.value) })} onDoubleClick={() => setX({ angle: 0 })} />
            </label>
            <label className="wm-check"><input type="checkbox" checked={xf.trim} onChange={(e) => setX({ trim: e.target.checked })} />{t.trim}</label>
            {horizon
              ? <button type="button" className="tool-btn small ghost" onClick={() => setHorizon(null)}>{t.horizonCancel}</button>
              : <button type="button" className="tool-btn small" onClick={() => setHorizon({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, drawing: false })}>📐 {t.horizon}</button>}
          </div>
          {horizon && <p className="tool-local-note">{t.horizonHint}</p>}

          <div className="crop-stage">
            <div className="crop-wrap" ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
              <img ref={imgRef} src={src} alt="" className="crop-img" onLoad={onImgLoad} draggable="false" />
              {horizon && (
                <svg className="crop-horizon" width={box.w} height={box.h} onPointerDown={onHorizonDown} onPointerMove={onHorizonMove} onPointerUp={onHorizonUp}>
                  <line x1={horizon.a.x} y1={horizon.a.y} x2={horizon.b.x} y2={horizon.b.y} />
                </svg>
              )}
              {crop && !horizon && (
                <>
                  {/* затемнение вне рамки — 4 полосы */}
                  <div className="crop-shade" style={{ left: 0, top: 0, width: box.w, height: crop.top }} />
                  <div className="crop-shade" style={{ left: 0, top: crop.bottom, width: box.w, height: box.h - crop.bottom }} />
                  <div className="crop-shade" style={{ left: 0, top: crop.top, width: crop.left, height: crop.bottom - crop.top }} />
                  <div className="crop-shade" style={{ left: crop.right, top: crop.top, width: box.w - crop.right, height: crop.bottom - crop.top }} />
                  <div
                    className="crop-frame"
                    style={{ left: crop.left, top: crop.top, width: crop.right - crop.left, height: crop.bottom - crop.top }}
                    onPointerDown={onDown('move')}
                  >
                    <span className="crop-grid" aria-hidden="true" />
                    <span className="crop-dim">{cw}×{ch}</span>
                    {HANDLES.map((hd) => (
                      <span key={hd} className={`crop-handle h-${hd}`} onPointerDown={onDown(hd)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="crop-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.format}</span>
              <div className="segmented">
                <button type="button" className={fmt === 'image/png' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt('image/png')}>PNG</button>
                <button type="button" className={fmt === 'image/jpeg' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt('image/jpeg')}>JPG</button>
                <button type="button" className={fmt === 'image/webp' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt('image/webp')}>WebP</button>
              </div>
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.size}, {t.px}</span>
              <div className="crop-exact">
                <input type="number" min="1" max={nat.w} value={cw || ''} aria-label={t.width} onChange={(e) => setExact('w', e.target.value)} />
                <span>×</span>
                <input type="number" min="1" max={nat.h} value={ch || ''} aria-label={t.height} onChange={(e) => setExact('h', e.target.value)} />
              </div>
            </div>
            <button type="button" className="tool-btn ghost" onClick={resetFrame}>{t.reset}</button>
          </div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => doCrop(true)}>✂️ {t.apply}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default CropTool;
