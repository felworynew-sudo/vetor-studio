import { useRef } from 'react';

// Общие для Smart Crop и Social Crop Pack: превью кропа (CSS-фон без canvas) и
// редактор рамки поверх оригинала (перетаскивание, масштаб, найденные лица/объекты).

// Превью кропа без canvas: фон-картинка, масштабированная и сдвинутая под рамку.
export function CropThumb({ item, crop, circle, size = 160 }) {
  const W = item.img.naturalWidth; const H = item.img.naturalHeight;
  const tw = crop.w >= crop.h ? size : size * (crop.w / crop.h);
  const th = tw * (crop.h / crop.w);
  return (
    <span
      className={circle ? 'sc-thumb circle' : 'sc-thumb'}
      style={{
        width: tw, height: th,
        backgroundImage: `url(${item.url})`,
        backgroundSize: `${(W / crop.w) * tw}px ${(H / crop.h) * th}px`,
        backgroundPosition: `${-(crop.x / crop.w) * tw}px ${-(crop.y / crop.h) * th}px`,
      }}
    />
  );
}

export function CropEditor({ item, aspect, onChange, showBoxes }) {
  const boxRef = useRef(null);
  const W = item.img.naturalWidth; const H = item.img.naturalHeight;
  const { crop } = item;
  const ar = aspect.w / aspect.h;
  const maxW = W / H > ar ? H * ar : W;

  function startDrag(e) {
    e.preventDefault();
    const rect = boxRef.current.getBoundingClientRect();
    const k = W / rect.width;
    const sx = e.clientX; const sy = e.clientY; const start = { ...crop };
    const move = (ev) => {
      const x = Math.max(0, Math.min(W - start.w, start.x + (ev.clientX - sx) * k));
      const y = Math.max(0, Math.min(H - start.h, start.y + (ev.clientY - sy) * k));
      onChange({ ...start, x, y });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  function setZoom(v) {
    const w = maxW * v; const h = w / ar;
    const cx = crop.x + crop.w / 2; const cy = crop.y + crop.h / 2;
    onChange({
      w, h,
      x: Math.max(0, Math.min(W - w, cx - w / 2)),
      y: Math.max(0, Math.min(H - h, cy - h / 2)),
    });
  }

  const pct = (v, d) => `${(v / d) * 100}%`;
  return (
    <>
      <div className="sc-editor" ref={boxRef}>
        <img src={item.url} alt="" draggable="false" />
        {showBoxes && item.subjects?.faces.map((f, i) => (
          <span key={`f${i}`} className="sc-det is-face" style={{ left: pct(f.x, W), top: pct(f.y, H), width: pct(f.w, W), height: pct(f.h, H) }} />
        ))}
        {showBoxes && item.subjects?.objects.map((o, i) => (
          <span key={`o${i}`} className="sc-det" style={{ left: pct(o.x, W), top: pct(o.y, H), width: pct(o.w, W), height: pct(o.h, H) }}><em>{o.label}</em></span>
        ))}
        <span
          className={aspect.circle ? 'sc-frame circle' : 'sc-frame'}
          style={{ left: pct(crop.x, W), top: pct(crop.y, H), width: pct(crop.w, W), height: pct(crop.h, H) }}
          onPointerDown={startDrag}
        />
      </div>
      <input type="range" min="0.2" max="1" step="0.01" value={Math.min(1, crop.w / maxW)} onChange={(e) => setZoom(Number(e.target.value))} />
    </>
  );
}
