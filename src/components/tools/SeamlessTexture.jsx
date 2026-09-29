import { useEffect, useRef, useState } from 'react';

// Бесшовная текстура: фото поверхности → тайл, который повторяется без швов.
//  • Растушёвка: смешиваем картинку с её копией, сдвинутой на полпериода, — у
//    копии края непрерывны при повторе, а шов уходит в центр, где берём оригинал.
//  • Зеркало: 2×2 отражения — всегда бесшовно (подходит для абстрактных фактур).
// Плюс выравнивание освещения (убирает виньетку и градиент света, из-за которых
// плитка «моргает») и превью 3×3. Всё локально.

const TEXT = {
  ru: {
    drop: 'Загрузите фото фактуры', hint: 'Камень, дерево, ткань, трава, бумага — PNG, JPG, WebP', method: 'Метод', blend: 'Растушёвка шва', mirror: 'Зеркало 2×2',
    feather: 'Ширина растушёвки', flatten: 'Выровнять освещение', size: 'Размер тайла', square: 'Сделать квадратным', tiles: 'Превью плиткой', offset: 'Сдвиг на полпериода (проверка шва)',
    download: 'Скачать тайл PNG', change: 'Другое фото',
    note: 'Для лучшего результата снимайте фактуру ровно, без перспективы и с рассеянным светом. Всё локально.',
  },
  en: {
    drop: 'Upload a texture photo', hint: 'Stone, wood, fabric, grass, paper — PNG, JPG, WebP', method: 'Method', blend: 'Seam feathering', mirror: 'Mirror 2×2',
    feather: 'Feather width', flatten: 'Flatten lighting', size: 'Tile size', square: 'Make square', tiles: 'Tiled preview', offset: 'Half offset (seam check)',
    download: 'Download tile PNG', change: 'Another photo',
    note: 'For best results shoot the texture straight on, without perspective and in diffuse light. All local.',
  },
};

function boxBlurChannel(src, w, h, r) {
  const tmp = new Float32Array(w * h); const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    let s = 0; for (let k = -r; k <= r; k += 1) s += src[y * w + ((k + w) % w)];
    for (let x = 0; x < w; x += 1) { tmp[y * w + x] = s / (2 * r + 1); s += src[y * w + ((x + r + 1) % w)] - src[y * w + ((x - r + w) % w)]; }
  }
  for (let x = 0; x < w; x += 1) {
    let s = 0; for (let k = -r; k <= r; k += 1) s += tmp[((k + h) % h) * w + x];
    for (let y = 0; y < h; y += 1) { out[y * w + x] = s / (2 * r + 1); s += tmp[((y + r + 1) % h) * w + x] - tmp[((y - r + h) % h) * w + x]; }
  }
  return out;
}

// Выравнивание: делим на сильно размытую яркость (крупные перепады света), сохраняя среднее.
function flattenLight(id, amount) {
  if (!amount) return id;
  const { width: w, height: h, data } = id;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) L[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2] + 1;
  const r = Math.max(4, Math.round(Math.min(w, h) / 6));
  let big = boxBlurChannel(L, w, h, r); big = boxBlurChannel(big, w, h, r);
  let mean = 0; for (let i = 0; i < L.length; i += 1) mean += big[i]; mean /= L.length;
  const out = new ImageData(new Uint8ClampedArray(data), w, h);
  for (let i = 0; i < w * h; i += 1) {
    const k = 1 + ((mean / big[i]) - 1) * amount;
    out.data[i * 4] *= k; out.data[i * 4 + 1] *= k; out.data[i * 4 + 2] *= k;
  }
  return out;
}

function makeSeamless(id, feather) {
  const { width: w, height: h, data } = id;
  const out = new ImageData(w, h);
  const fx = Math.max(1, (w / 2) * feather); const fy = Math.max(1, (h / 2) * feather);
  for (let y = 0; y < h; y += 1) {
    const wy = Math.min(1, Math.min(y, h - 1 - y) / fy);
    for (let x = 0; x < w; x += 1) {
      const wx = Math.min(1, Math.min(x, w - 1 - x) / fx);
      // Вес оригинала: 1 в центре, 0 на краях (там берём сдвинутую копию).
      let a = Math.min(wx, wy); a = a * a * (3 - 2 * a);
      const i = (y * w + x) * 4; const j = (((y + (h >> 1)) % h) * w + ((x + (w >> 1)) % w)) * 4;
      for (let c = 0; c < 4; c += 1) out.data[i + c] = data[i + c] * a + data[j + c] * (1 - a);
    }
  }
  return out;
}

function SeamlessTexture({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const tileRef = useRef(null);
  const [src, setSrc] = useState('');
  const [method, setMethod] = useState('blend');
  const [feather, setFeather] = useState(0.35);
  const [flatten, setFlatten] = useState(0.6);
  const [size, setSize] = useState(1024);
  const [square, setSquare] = useState(true);
  const [offset, setOffset] = useState(false);
  const [tileUrl, setTileUrl] = useState('');

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { imgRef.current = img; setSrc((p) => { if (p) URL.revokeObjectURL(p); return url; }); }; img.src = url;
  }

  useEffect(() => {
    const img = imgRef.current; if (!img || !src) return undefined;
    const timer = setTimeout(() => {
      let sw = img.naturalWidth; let sh = img.naturalHeight; let sx = 0; let sy = 0;
      if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = m; sh = m; }
      const k = size / Math.max(sw, sh);
      const w = Math.max(8, Math.round(sw * k)); const h = Math.max(8, Math.round(sh * k));
      const c = document.createElement('canvas');
      const x = c.getContext('2d', { willReadFrequently: true });
      if (method === 'mirror') {
        const hw = Math.round(w / 2); const hh = Math.round(h / 2);
        c.width = hw * 2; c.height = hh * 2;
        const q = document.createElement('canvas'); q.width = hw; q.height = hh; const qx = q.getContext('2d', { willReadFrequently: true });
        qx.drawImage(img, sx, sy, sw, sh, 0, 0, hw, hh);
        qx.putImageData(flattenLight(qx.getImageData(0, 0, hw, hh), flatten), 0, 0);
        [[1, 1, 0, 0], [-1, 1, hw * 2, 0], [1, -1, 0, hh * 2], [-1, -1, hw * 2, hh * 2]].forEach(([a, b, tx, ty]) => { x.setTransform(a, 0, 0, b, tx, ty); x.drawImage(q, 0, 0); });
        x.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        c.width = w; c.height = h;
        x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        let id = flattenLight(x.getImageData(0, 0, w, h), flatten);
        id = makeSeamless(id, feather);
        x.putImageData(id, 0, 0);
      }
      if (offset) {
        const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const ox = o.getContext('2d');
        const hw = c.width / 2; const hh = c.height / 2;
        [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].forEach(([dx, dy]) => ox.drawImage(c, dx, dy));
        tileRef.current = o;
      } else tileRef.current = c;
      tileRef.current.toBlob((b) => setTileUrl((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(b); }), 'image/png');
    }, 150);
    return () => clearTimeout(timer);
  }, [src, method, feather, flatten, size, square, offset]);

  function download() {
    tileRef.current?.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `seamless-${tileRef.current.width}.png`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }

  return (
    <div className="tool-panel seamless">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            <span className="tool-field-label">{t.tiles}</span>
            <div className="st-tiles" style={{ backgroundImage: tileUrl ? `url(${tileUrl})` : 'none' }} />
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="tool-field"><span className="tool-field-label">{t.method}</span>
              <div className="segmented">{[['blend', t.blend], ['mirror', t.mirror]].map(([id, l]) => <button key={id} type="button" className={method === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMethod(id)}>{l}</button>)}</div>
            </div>
            {method === 'blend' && <label className="tool-field"><span className="tool-field-label">{t.feather}: {Math.round(feather * 100)}%</span><input type="range" min="0.05" max="1" step="0.01" value={feather} onChange={(e) => setFeather(Number(e.target.value))} /></label>}
            <label className="tool-field"><span className="tool-field-label">{t.flatten}: {Math.round(flatten * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={flatten} onChange={(e) => setFlatten(Number(e.target.value))} /></label>
            <div className="tool-field"><span className="tool-field-label">{t.size}</span>
              <div className="segmented">{[512, 1024, 2048].map((s) => <button key={s} type="button" className={size === s ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSize(s)}>{s}</button>)}</div>
            </div>
            <label className="tool-check"><input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} /> {t.square}</label>
            <label className="tool-check"><input type="checkbox" checked={offset} onChange={(e) => setOffset(e.target.checked)} /> {t.offset}</label>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default SeamlessTexture;
