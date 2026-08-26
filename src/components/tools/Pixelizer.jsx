import { useCallback, useEffect, useRef, useState } from 'react';

// Пикселизатор: превращает картинку в пиксель-арт даунскейлом ПО СОСЕДНИМ
// пикселям (nearest-neighbor, без бикубического размытия) + опциональная
// квантизация палитры (median-cut). Экспорт в PNG (растровый пиксель) и в SVG
// (вектор: каждый пиксель = квадрат того же цвета). Тем же тулом векторизуем
// готовый пиксель-арт: ставим ширину = исходной, палитра «как есть».

const TEXT = {
  ru: {
    drop: 'Перетащите картинку или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально',
    width: 'Ширина в пикселях', colors: 'Цветов в палитре', colorsOff: 'как есть',
    scale: 'Масштаб превью', change: 'Другое', pngPixel: 'PNG (пиксель)', pngBig: 'PNG ×',
    svg: 'SVG (вектор)', rects: 'квадратов', note: 'Даунскейл по соседним пикселям (без размытия). Всё локально, файлы не уходят на сервер.',
    heavy: 'Много квадратов — SVG будет тяжёлым. Уменьшите ширину или число цветов.',
  },
  en: {
    drop: 'Drop an image or click', hint: 'PNG, JPG, WebP — processed locally',
    width: 'Width in pixels', colors: 'Palette colors', colorsOff: 'as is',
    scale: 'Preview scale', change: 'Another', pngPixel: 'PNG (pixel)', pngBig: 'PNG ×',
    svg: 'SVG (vector)', rects: 'rects', note: 'Nearest-neighbor downscale (no blur). All local, nothing is uploaded.',
    heavy: 'Many rects — the SVG will be heavy. Lower the width or color count.',
  },
};

// --- median-cut квантизация ---
function medianCut(pixels, count) {
  if (count >= 2 && pixels.length) {
    let boxes = [pixels];
    const range = (box, a) => { let lo = 255; let hi = 0; for (const p of box) { if (p[a] < lo) lo = p[a]; if (p[a] > hi) hi = p[a]; } return hi - lo; };
    while (boxes.length < count) {
      let bi = -1; let best = -1;
      boxes.forEach((b, i) => { if (b.length < 2) return; const v = Math.max(range(b, 0), range(b, 1), range(b, 2)); if (v > best) { best = v; bi = i; } });
      if (bi < 0) break;
      const box = boxes[bi];
      const axis = [0, 1, 2].reduce((m, a) => (range(box, a) > range(box, m) ? a : m), 0);
      box.sort((p, q) => p[axis] - q[axis]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map((b) => {
      const n = b.length || 1; let r = 0; let g = 0; let bl = 0;
      for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; }
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });
  }
  return null;
}
function nearest(pal, r, g, b) {
  let bi = 0; let bd = Infinity;
  for (let i = 0; i < pal.length; i += 1) { const dr = pal[i][0] - r; const dg = pal[i][1] - g; const db = pal[i][2] - b; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; bi = i; } }
  return pal[bi];
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function Pixelizer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const previewRef = useRef(null);
  const smallRef = useRef(null); // офскрин с пиксельным результатом (натуральный размер)
  const imgRef = useRef(null);

  const [src, setSrc] = useState('');
  const [pxW, setPxW] = useState(64);
  const [colors, setColors] = useState(0); // 0 = как есть
  const [scale, setScale] = useState(6);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [rectCount, setRectCount] = useState(0);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setPxW(Math.min(96, img.naturalWidth)); };
    img.src = url;
  }

  const render = useCallback(() => {
    const img = imgRef.current; if (!img) return;
    const w = Math.max(2, Math.min(400, pxW));
    const h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
    // 1) даунскейл по соседним пикселям
    const small = smallRef.current;
    small.width = w; small.height = h;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(img, 0, 0, w, h);
    // 2) квантизация палитры (median-cut) при colors>0
    if (colors >= 2) {
      const id = sctx.getImageData(0, 0, w, h);
      const d = id.data; const pts = [];
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) pts.push([d[i], d[i + 1], d[i + 2]]);
      const pal = medianCut(pts, colors);
      if (pal) {
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] <= 8) continue;
          const c = nearest(pal, d[i], d[i + 1], d[i + 2]);
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
        }
        sctx.putImageData(id, 0, 0);
      }
    }
    setDims({ w, h });
    // 3) превью — апскейл с чёткими пикселями
    const pv = previewRef.current;
    pv.width = w * scale; pv.height = h * scale;
    const pctx = pv.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.drawImage(small, 0, 0, pv.width, pv.height);
  }, [pxW, colors, scale]);

  useEffect(() => { if (src) render(); }, [src, render]);

  function buildSVG() {
    const small = smallRef.current; const w = small.width; const h = small.height;
    const d = small.getContext('2d').getImageData(0, 0, w, h).data;
    const rects = [];
    for (let y = 0; y < h; y += 1) {
      let x = 0;
      while (x < w) {
        const i = (y * w + x) * 4; const a = d[i + 3];
        if (a < 8) { x += 1; continue; }
        const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
        let run = 1;
        while (x + run < w) { const j = (y * w + x + run) * 4; if (d[j + 3] < 8 || d[j] !== r || d[j + 1] !== g || d[j + 2] !== b || d[j + 3] !== a) break; run += 1; }
        const op = a === 255 ? '' : ` fill-opacity="${(a / 255).toFixed(3)}"`;
        rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${hex(r, g, b)}"${op}/>`);
        x += run;
      }
    }
    setRectCount(rects.length);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects.join('')}</svg>\n`;
  }

  function download(kind) {
    const small = smallRef.current;
    if (kind === 'svg') {
      const svg = buildSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      trigger(URL.createObjectURL(blob), `pixel-${small.width}x${small.height}.svg`);
      return;
    }
    const mult = kind === 'big' ? Math.max(1, scale) : 1;
    const c = document.createElement('canvas'); c.width = small.width * mult; c.height = small.height * mult;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, c.width, c.height);
    c.toBlob((blob) => trigger(URL.createObjectURL(blob), `pixel-${c.width}x${c.height}.png`), 'image/png');
  }
  function trigger(url, name) {
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // оценка тяжести svg (грубо: пиксели с альфой)
  const heavy = dims.w * dims.h > 20000;

  return (
    <div className="tool-panel pixelizer">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="pix-layout">
          <div className="pix-preview">
            <canvas ref={previewRef} className="pix-canvas px-icon" />
            <span className="pix-dims">{dims.w}×{dims.h}px</span>
          </div>
          <div className="pix-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.width}: {pxW}px</span>
              <input type="range" min="8" max="256" value={pxW} onChange={(e) => setPxW(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.colors}: {colors === 0 ? t.colorsOff : colors}</span>
              <input type="range" min="0" max="64" value={colors} onChange={(e) => setColors(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.scale}: ×{scale}</span>
              <input type="range" min="1" max="16" value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            </div>
            <div className="tool-actions pix-actions">
              <button type="button" className="tool-btn primary" onClick={() => download('pixel')}>{t.pngPixel}</button>
              <button type="button" className="tool-btn" onClick={() => download('big')}>{t.pngBig}{scale}</button>
              <button type="button" className="tool-btn" onClick={() => download('svg')}>{t.svg}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
            {rectCount > 0 && <p className="tool-local-note">SVG: {rectCount} {t.rects}</p>}
            {heavy && <p className="color-invalid">{t.heavy}</p>}
          </div>
        </div>
      )}
      <canvas ref={smallRef} hidden />
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Pixelizer;
