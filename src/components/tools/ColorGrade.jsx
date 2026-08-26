import { useCallback, useEffect, useRef, useState } from 'react';

// Простой цветокор в духе Lightroom/Camera Raw: тон и цвет считаются по пикселям,
// шумоподавление — box-blur, резкость — нерезкое маскирование. Всё локально на
// canvas; превью в пониженном разрешении, выгрузка — в исходном.

const PREVIEW_MAX = 1400; // ограничение стороны превью для отзывчивости
const EXPORT_MAX = 4200; // предохранитель от гигантских картинок / OOM

const CONTROLS = [
  { key: 'exposure', ru: 'Экспозиция', en: 'Exposure', min: -100, max: 100 },
  { key: 'contrast', ru: 'Контраст', en: 'Contrast', min: -100, max: 100 },
  { key: 'highlights', ru: 'Света', en: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', ru: 'Тени', en: 'Shadows', min: -100, max: 100 },
  { key: 'saturation', ru: 'Насыщенность', en: 'Saturation', min: -100, max: 100 },
  { key: 'temperature', ru: 'Температура', en: 'Temperature', min: -100, max: 100 },
  { key: 'tint', ru: 'Оттенок', en: 'Tint', min: -100, max: 100 },
  { key: 'sharpen', ru: 'Резкость', en: 'Sharpness', min: 0, max: 100 },
  { key: 'denoise', ru: 'Шумоподавление', en: 'Noise reduction', min: 0, max: 100 },
];

const ZERO = CONTROLS.reduce((a, c) => ({ ...a, [c.key]: 0 }), {});

const TEXT = {
  ru: { drop: 'Перетащите фото или нажмите', hint: 'PNG, JPG, WebP, GIF, BMP — обрабатывается локально', reset: 'Сбросить', change: 'Другое', download: 'Скачать', before: 'Зажмите — покажет оригинал', note: 'Тон, цвет, резкость и шум считаются в браузере. Ничего не загружается на сервер.' },
  en: { drop: 'Drop a photo or click', hint: 'PNG, JPG, WebP, GIF, BMP — processed locally', reset: 'Reset', change: 'Another', download: 'Download', before: 'Hold to see the original', note: 'Tone, color, sharpness and noise run in your browser. Nothing is uploaded.' },
};

// --- Обработка ---
function boxBlur(data, w, h, radius) {
  if (radius < 1) return data;
  const out = new Uint8ClampedArray(data.length);
  const tmp = new Float32Array(data.length);
  const win = radius * 2 + 1;
  for (let c = 0; c < 3; c += 1) {
    // горизонтально
    for (let y = 0; y < h; y += 1) {
      let sum = 0; const row = y * w * 4;
      for (let k = -radius; k <= radius; k += 1) sum += data[row + Math.min(w - 1, Math.max(0, k)) * 4 + c];
      for (let x = 0; x < w; x += 1) {
        tmp[row + x * 4 + c] = sum / win;
        const add = Math.min(w - 1, x + radius + 1); const sub = Math.max(0, x - radius);
        sum += data[row + add * 4 + c] - data[row + sub * 4 + c];
      }
    }
  }
  // вертикально
  for (let c = 0; c < 3; c += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0; const col = x * 4 + c;
      for (let k = -radius; k <= radius; k += 1) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w * 4 + col];
      for (let y = 0; y < h; y += 1) {
        out[y * w * 4 + col] = sum / win;
        const add = Math.min(h - 1, y + radius + 1); const sub = Math.max(0, y - radius);
        sum += tmp[add * w * 4 + col] - tmp[sub * w * 4 + col];
      }
    }
  }
  for (let i = 3; i < data.length; i += 4) out[i] = data[i]; // альфа
  return out;
}

function process(srcData, w, h, p) {
  const N = srcData.length;
  let base = new Uint8ClampedArray(srcData); // копия

  // 1. Шумоподавление — смешиваем с box-blur.
  if (p.denoise > 0) {
    const radius = p.denoise > 66 ? 3 : p.denoise > 33 ? 2 : 1;
    const blur = boxBlur(base, w, h, radius);
    const k = p.denoise / 100;
    for (let i = 0; i < N; i += 1) if (i % 4 !== 3) base[i] = base[i] * (1 - k) + blur[i] * k;
  }

  // 2. Резкость (нерезкое маскирование) — считаем перед тоном по исходной яркости.
  let hi = null;
  if (p.sharpen > 0) { hi = boxBlur(base, w, h, 1); }

  const exp = 2 ** (p.exposure / 100);
  const con = 1 + p.contrast / 100;
  const sat = 1 + p.saturation / 100;
  const tempR = 1 + p.temperature / 300; const tempB = 1 - p.temperature / 300;
  const tintG = 1 - p.tint / 300;
  const hlAmt = p.highlights / 100; const shAmt = p.shadows / 100;
  const sharpAmt = p.sharpen / 100 * 1.4;

  const out = new Uint8ClampedArray(N);
  for (let i = 0; i < N; i += 4) {
    let r = base[i]; let g = base[i + 1]; let b = base[i + 2];

    // резкость: усиливаем разницу с размытым
    if (hi) { r += (r - hi[i]) * sharpAmt; g += (g - hi[i + 1]) * sharpAmt; b += (b - hi[i + 2]) * sharpAmt; }

    // нормализуем 0..1
    r /= 255; g /= 255; b /= 255;

    // экспозиция
    r *= exp; g *= exp; b *= exp;

    // баланс белого
    r *= tempR; b *= tempB; g *= tintG;

    // света / тени по яркости
    if (hlAmt || shAmt) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (hlAmt) { const wgt = Math.max(0, (l - 0.5) * 2); const f = 1 + hlAmt * wgt * -0.7; r *= f; g *= f; b *= f; }
      if (shAmt) { const wgt = Math.max(0, (0.5 - l) * 2); const add = shAmt * wgt * 0.4; r += add; g += add; b += add; }
    }

    // контраст
    r = (r - 0.5) * con + 0.5; g = (g - 0.5) * con + 0.5; b = (b - 0.5) * con + 0.5;

    // насыщенность
    if (p.saturation !== 0) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }

    out[i] = r * 255; out[i + 1] = g * 255; out[i + 2] = b * 255; out[i + 3] = srcData[i + 3];
  }
  return out;
}

function ColorGrade({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const srcRef = useRef(null); // {data,w,h} превью-разрешение
  const fullRef = useRef(null); // {canvas} исходное разрешение
  const rafRef = useRef(0);

  const [src, setSrc] = useState('');
  const [params, setParams] = useState(ZERO);
  const [ready, setReady] = useState(false);
  const [showOrig, setShowOrig] = useState(false);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setReady(false); setParams(ZERO);
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => {
      // исходный canvas (с предохранителем размера)
      let fw = img.naturalWidth; let fh = img.naturalHeight;
      const fscale = Math.min(1, EXPORT_MAX / Math.max(fw, fh));
      fw = Math.round(fw * fscale); fh = Math.round(fh * fscale);
      const full = document.createElement('canvas'); full.width = fw; full.height = fh;
      full.getContext('2d').drawImage(img, 0, 0, fw, fh);
      fullRef.current = full;
      // превью
      const pscale = Math.min(1, PREVIEW_MAX / Math.max(fw, fh));
      const pw = Math.round(fw * pscale); const ph = Math.round(fh * pscale);
      const pc = document.createElement('canvas'); pc.width = pw; pc.height = ph;
      pc.getContext('2d').drawImage(full, 0, 0, pw, ph);
      srcRef.current = { data: pc.getContext('2d').getImageData(0, 0, pw, ph).data, w: pw, h: ph };
      const cv = canvasRef.current; cv.width = pw; cv.height = ph;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(srcRef.current.data), pw, ph), 0, 0);
      URL.revokeObjectURL(url);
      setReady(true);
    };
    img.src = url;
  }

  const render = useCallback(() => {
    const s = srcRef.current; const cv = canvasRef.current;
    if (!s || !cv) return;
    const out = process(s.data, s.w, s.h, params);
    cv.getContext('2d').putImageData(new ImageData(out, s.w, s.h), 0, 0);
  }, [params]);

  // Перерисовка превью при смене ползунков (через rAF, чтобы не лагало).
  useEffect(() => {
    if (!ready) return;
    if (showOrig) {
      const s = srcRef.current; const cv = canvasRef.current;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.data), s.w, s.h), 0, 0);
      return;
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(render);
  }, [params, ready, showOrig, render]);

  function download() {
    const full = fullRef.current;
    if (!full) return;
    const data = full.getContext('2d').getImageData(0, 0, full.width, full.height).data;
    const out = process(data, full.width, full.height, params);
    const cv = document.createElement('canvas'); cv.width = full.width; cv.height = full.height;
    cv.getContext('2d').putImageData(new ImageData(out, full.width, full.height), 0, 0);
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'graded.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  const touched = CONTROLS.some((c) => params[c.key] !== 0);

  return (
    <div className="tool-panel grade-tool">
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
        <div className="grade-layout">
          <div className="grade-preview">
            <canvas
              ref={canvasRef}
              className="grade-canvas"
              onPointerDown={() => setShowOrig(true)}
              onPointerUp={() => setShowOrig(false)}
              onPointerLeave={() => setShowOrig(false)}
            />
            <span className="grade-before-hint">👁 {t.before}</span>
          </div>

          <div className="grade-sliders">
            {CONTROLS.map((c) => (
              <label key={c.key} className="grade-row">
                <span className="grade-row-head">
                  <span>{c[language] || c.ru}</span>
                  <span className={params[c.key] !== 0 ? 'grade-val is-set' : 'grade-val'}>{params[c.key] > 0 ? `+${params[c.key]}` : params[c.key]}</span>
                </span>
                <input
                  type="range" min={c.min} max={c.max} value={params[c.key]}
                  onChange={(e) => setParams((p) => ({ ...p, [c.key]: Number(e.target.value) }))}
                  onDoubleClick={() => setParams((p) => ({ ...p, [c.key]: 0 }))}
                />
              </label>
            ))}
            <div className="tool-actions grade-actions">
              <button type="button" className="tool-btn primary" onClick={download} disabled={!ready}>⬇ {t.download}</button>
              <button type="button" className="tool-btn ghost" onClick={() => setParams(ZERO)} disabled={!touched}>{t.reset}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default ColorGrade;
