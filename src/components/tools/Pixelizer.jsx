import { useCallback, useEffect, useRef, useState } from 'react';

// Пикселизатор: превращает картинку в пиксель-арт даунскейлом ПО СОСЕДНИМ
// пикселям (nearest-neighbor, без бикубического размытия) + опциональная
// квантизация палитры (median-cut). Экспорт в PNG (растровый пиксель) и в SVG
// (вектор: каждый пиксель = квадрат того же цвета). Тем же тулом векторизуем
// готовый пиксель-арт: ставим ширину = исходной, палитра «как есть».

const TEXT = {
  ru: {
    drop: 'Перетащите картинку или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально',
    width: 'Ширина в пикселях', merge: 'Слияние оттенков', mergeOff: 'как есть',
    scale: 'Масштаб превью', change: 'Другое', pngPixel: 'PNG (пиксель)', pngBig: 'PNG ×',
    svg: 'SVG (вектор)', rects: 'квадратов', note: 'Умный даунскейл + чёткие края дают ровный пиксель-арт. Всё локально, файлы не уходят на сервер.',
    heavy: 'Много квадратов — SVG будет тяжёлым. Уменьшите ширину или число цветов.',
    crisp: 'Чёткие края', smooth: 'Усреднять цвета',
    crispHint: 'Без полупрозрачной бахромы по контуру', smoothHint: 'Ровный цвет вместо шума (выкл. — для готового пиксель-арта)',
  },
  en: {
    drop: 'Drop an image or click', hint: 'PNG, JPG, WebP — processed locally',
    width: 'Width in pixels', merge: 'Merge shades', mergeOff: 'as is',
    scale: 'Preview scale', change: 'Another', pngPixel: 'PNG (pixel)', pngBig: 'PNG ×',
    svg: 'SVG (vector)', rects: 'rects', note: 'Smart downscale + crisp edges give clean pixel-art. All local, nothing is uploaded.',
    heavy: 'Many rects — the SVG will be heavy. Lower the width or color count.',
    crisp: 'Crisp edges', smooth: 'Average colors',
    crispHint: 'No semi-transparent fringe on the outline', smoothHint: 'Clean color instead of noise (off — for ready pixel-art)',
  },
};

// Перцептивное расстояние между цветами (redmean, аппроксимация compuphase) —
// в отличие от простого RGB учитывает, что глаз по-разному чувствителен к
// каналам у тёмных/светлых. Возвращает КВАДРАТ расстояния. Так «оттенки, которые
// на глаз не отличить» получают малое расстояние и корректно сливаются.
function redmean2(r1, g1, b1, r2, g2, b2) {
  const rm = (r1 + r2) * 0.5;
  const dr = r1 - r2; const dg = g1 - g2; const db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

// Слияние оттенков по перцептивному порогу. Проблема: даунскейл сглаженной
// картинки плодит десятки почти одинаковых оттенков одного цвета → тяжёлый SVG и
// «грязь». Решение (как просил юзер): выделить базовые самые различающиеся цвета,
// а все подоттенки слить к ближайшему базовому. Алгоритм — жадная кластеризация,
// засеянная по частоте (самые массовые цвета становятся базой), расстояние redmean.
// tol — порог в «редмин-единицах» (~0..80); мутирует RGBA-данные на месте.
function quantizeByTolerance(d, tol) {
  if (tol <= 0) return;
  const tol2 = tol * tol;
  // уникальные цвета + частоты (только видимые пиксели)
  const map = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] <= 8) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const e = map.get(key);
    if (e) e.c += 1; else map.set(key, { r: d[i], g: d[i + 1], b: d[i + 2], c: 1 });
  }
  const uniq = [...map.values()].sort((a, b) => b.c - a.c);
  // базовые цвета: новый цвет становится базой, только если далеко от всех баз
  const bases = [];
  for (const u of uniq) {
    let near = false;
    for (const b of bases) { if (redmean2(b.r, b.g, b.b, u.r, u.g, u.b) <= tol2) { near = true; break; } }
    if (!near) bases.push({ r: u.r, g: u.g, b: u.b });
  }
  // каждый пиксель → ближайшая база (redmean), с кэшем по исходному цвету
  const cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] <= 8) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let c = cache.get(key);
    if (!c) {
      let bd = Infinity; c = bases[0];
      for (const b of bases) { const dd = redmean2(b.r, b.g, b.b, d[i], d[i + 1], d[i + 2]); if (dd < bd) { bd = dd; c = b; } }
      cache.set(key, c);
    }
    d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b;
  }
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
  const [tol, setTol] = useState(24); // порог слияния оттенков (redmean), 0 = как есть
  const [scale, setScale] = useState(6);
  const [smooth, setSmooth] = useState(true); // усреднять блоки при уменьшении (чистый цвет vs шум nearest)
  const [crisp, setCrisp] = useState(true); // порог альфы: чёткий силуэт без полупрозрачной бахромы
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
    // 1) даунскейл. smooth=усреднение блока (ровный цвет, без шума nearest на
    // сглаженных исходниках вроде логотипов); off=по соседним (для готового пикс-арта)
    const small = smallRef.current;
    small.width = w; small.height = h;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = smooth;
    if (smooth) sctx.imageSmoothingQuality = 'high';
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(img, 0, 0, w, h);
    // 2) один проход: порог альфы (чёткий силуэт, гарантированно без полупрозрачных)
    // + слияние близких оттенков к базовым цветам (redmean-кластеризация)
    if (crisp || tol > 0) {
      const id = sctx.getImageData(0, 0, w, h);
      const d = id.data;
      if (crisp) { for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i + 3] >= 128 ? 255 : 0; }
      quantizeByTolerance(d, tol);
      sctx.putImageData(id, 0, 0);
    }
    setDims({ w, h });
    // 3) превью — апскейл с чёткими пикселями
    const pv = previewRef.current;
    pv.width = w * scale; pv.height = h * scale;
    const pctx = pv.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.drawImage(small, 0, 0, pv.width, pv.height);
  }, [pxW, tol, scale, smooth, crisp]);

  useEffect(() => { if (src) render(); }, [src, render]);

  function buildSVG() {
    const small = smallRef.current; const w = small.width; const h = small.height;
    const d = small.getContext('2d').getImageData(0, 0, w, h).data;
    // сетка ключей цвет+альфа (-1 = прозрачный). Жадное покрытие МАКСИМАЛЬНЫМИ
    // прямоугольниками — сливаем и по горизонтали, И по вертикали (раньше был
    // только горизонтальный прогон высотой 1 → лишние фигуры и тяжёлый файл).
    const N = w * h;
    const key = new Int32Array(N);
    const al = new Uint8Array(N);
    for (let p = 0; p < N; p += 1) {
      const a = d[p * 4 + 3];
      if (a < 8) { key[p] = -1; } else { key[p] = (d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2]; al[p] = a; }
    }
    const used = new Uint8Array(N);
    const rects = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        if (used[p] || key[p] < 0) continue;
        const k = key[p]; const a = al[p];
        // ширина: пока тот же цвет/альфа и не занято
        let rw = 1;
        while (x + rw < w) { const q = p + rw; if (used[q] || key[q] !== k || al[q] !== a) break; rw += 1; }
        // высота: пока ВСЯ строка шириной rw совпадает
        let rh = 1;
        let grow = true;
        while (grow && y + rh < h) {
          const base = (y + rh) * w + x;
          for (let xx = 0; xx < rw; xx += 1) { const q = base + xx; if (used[q] || key[q] !== k || al[q] !== a) { grow = false; break; } }
          if (grow) rh += 1;
        }
        for (let yy = 0; yy < rh; yy += 1) for (let xx = 0; xx < rw; xx += 1) used[(y + yy) * w + x + xx] = 1;
        const r = (k >> 16) & 255; const g = (k >> 8) & 255; const b = k & 255;
        const op = a === 255 ? '' : ` fill-opacity="${(a / 255).toFixed(3)}"`;
        rects.push(`<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${hex(r, g, b)}"${op}/>`);
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
              <span className="tool-field-label">{t.merge}: {tol === 0 ? t.mergeOff : tol}</span>
              <input type="range" min="0" max="80" value={tol} onChange={(e) => setTol(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.scale}: ×{scale}</span>
              <input type="range" min="1" max="16" value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            </div>
            <label className="rec-opt" title={t.crispHint}><input type="checkbox" checked={crisp} onChange={(e) => setCrisp(e.target.checked)} /> {t.crisp}</label>
            <label className="rec-opt" title={t.smoothHint}><input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> {t.smooth}</label>
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
