import { useCallback, useRef, useState } from 'react';

// Обрезка изображения рамкой: перетаскивание и ресайз за уголки/грани, пресеты
// пропорций (свободно, 1:1, 4:3, 16:9 и др.), затемнение вне кадра и сетка
// третей. Всё локально: пиксели режутся из оригинала в полном разрешении.

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
    note: 'Перетаскивайте рамку и тяните за уголки. Обрезка в исходном качестве, без загрузки на сервер.',
  },
  en: {
    drop: 'Drop an image or click', hint: 'PNG, JPG, WebP, GIF, BMP — processed locally',
    ratio: 'Aspect', reset: 'Reset frame', change: 'Another', download: 'Download',
    format: 'Format', size: 'Crop size', apply: 'Crop & download',
    note: 'Drag the frame and pull the corners. Cropped at full quality, nothing is uploaded.',
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function CropTool({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const wrapRef = useRef(null);
  const drag = useRef(null);

  const [src, setSrc] = useState('');
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 }); // размер отображаемой картинки (display px)
  const [ratioId, setRatioId] = useState('free');
  const [crop, setCrop] = useState(null); // {left,top,right,bottom} в display px
  const [fmt, setFmt] = useState('image/png');

  const ratio = RATIOS.find((r) => r.id === ratioId)?.r || null;

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setSrc(URL.createObjectURL(file));
    setCrop(null);
  }

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
    ctx.drawImage(imgRef.current, crop.left * sx, crop.top * sy, w, h, 0, 0, w, h);
    if (!download) return cv;
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `crop-${w}x${h}.${fmt === 'image/jpeg' ? 'jpg' : 'png'}`;
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

          <div className="crop-stage">
            <div className="crop-wrap" ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
              <img ref={imgRef} src={src} alt="" className="crop-img" onLoad={onImgLoad} draggable="false" />
              {crop && (
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
