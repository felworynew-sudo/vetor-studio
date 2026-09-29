import { useEffect, useRef, useState } from 'react';
import { GRADE_DEFAULTS, gradeColor, gradeUniforms } from '../../utils/gradeMath';
import { createGradeRenderer, maxTextureSize } from '../../utils/gradeGL';
import { buildLut, downloadText, writeCube } from '../../utils/lut';

// Цветокоррекция в духе Lightroom/Camera Raw на GPU (WebGL): экспозиция и баланс
// белого в линейном свете, тон — по перцептивной светлоте OKLab, насыщенность и
// вибранс — по хроме. Шумодав (bilateral), резкость, clarity, виньетка, зерно.
// Экспорт в полном разрешении и LUT .cube (цветовая часть) для видео и Lightroom.

const GROUPS = [
  { ru: 'Свет', en: 'Light', items: [
    ['exposure', 'Экспозиция', 'Exposure'], ['contrast', 'Контраст', 'Contrast'], ['highlights', 'Света', 'Highlights'],
    ['shadows', 'Тени', 'Shadows'], ['whites', 'Белые', 'Whites'], ['blacks', 'Чёрные', 'Blacks'], ['fade', 'Fade (выцветание)', 'Fade', 0],
  ] },
  { ru: 'Цвет', en: 'Color', items: [
    ['temperature', 'Температура', 'Temperature'], ['tint', 'Оттенок', 'Tint'], ['vibrance', 'Вибранс', 'Vibrance'], ['saturation', 'Насыщенность', 'Saturation'],
  ] },
  { ru: 'Детали и эффекты', en: 'Detail & effects', items: [
    ['clarity', 'Чёткость (clarity)', 'Clarity'], ['sharpen', 'Резкость', 'Sharpening', 0], ['denoise', 'Шумоподавление', 'Noise reduction', 0],
    ['vignette', 'Виньетка', 'Vignette'], ['grain', 'Зерно', 'Grain', 0],
  ] },
];

const PRESETS = [
  { id: 'warm', ru: 'Тёплый', en: 'Warm', p: { temperature: 35, tint: 6, vibrance: 15, contrast: 8 } },
  { id: 'cool', ru: 'Холодный', en: 'Cool', p: { temperature: -35, vibrance: 10, contrast: 10 } },
  { id: 'film', ru: 'Плёнка', en: 'Film', p: { fade: 45, contrast: -8, saturation: -12, grain: 35, temperature: 8, highlights: -15 } },
  { id: 'punch', ru: 'Сочно', en: 'Punchy', p: { contrast: 25, vibrance: 35, clarity: 25, blacks: -15, whites: 12 } },
  { id: 'matte', ru: 'Матовый', en: 'Matte', p: { fade: 60, contrast: -15, saturation: -20, shadows: 20 } },
  { id: 'bw', ru: 'Ч/Б', en: 'B/W', p: { saturation: -100, contrast: 20, clarity: 20, grain: 20 } },
  { id: 'moody', ru: 'Мрачный', en: 'Moody', p: { exposure: -15, shadows: -20, highlights: -30, saturation: -25, vignette: 40, temperature: -10 } },
];

const TEXT = {
  ru: { drop: 'Перетащите фото или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально', reset: 'Сбросить', change: 'Другое', download: 'Скачать', cube: 'LUT .cube', before: 'Зажмите — покажет оригинал', presets: 'Пресеты', format: 'Формат', noGl: 'WebGL недоступен в этом браузере.', note: 'Всё считается на видеокарте в браузере. Двойной клик по ползунку — сброс. LUT содержит цветовую часть (без резкости, шума, виньетки и зерна).' },
  en: { drop: 'Drop a photo or click', hint: 'PNG, JPG, WebP — processed locally', reset: 'Reset', change: 'Another', download: 'Download', cube: 'LUT .cube', before: 'Hold to see the original', presets: 'Presets', format: 'Format', noGl: 'WebGL is not available in this browser.', note: 'Everything runs on your GPU in the browser. Double-click a slider to reset it. The LUT holds the color part (no sharpening, noise, vignette or grain).' },
};

const PREVIEW_MAX = 1600;

function ColorGrade({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const rendererRef = useRef(null);
  const [src, setSrc] = useState('');
  const [params, setParams] = useState(GRADE_DEFAULTS);
  const [showOrig, setShowOrig] = useState(false);
  const [fmt, setFmt] = useState('jpg');
  const [noGl, setNoGl] = useState(false);
  const [name, setName] = useState('photo');

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setName(file.name.replace(/\.[^.]+$/, ''));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setSrc((p) => { if (p) URL.revokeObjectURL(p); return url; }); };
    img.src = url;
  }

  // (Пере)создание рендерера превью под новую картинку.
  useEffect(() => {
    const img = imgRef.current; const cv = canvasRef.current;
    if (!src || !img || !cv) return undefined;
    const k = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const pre = document.createElement('canvas'); pre.width = cv.width; pre.height = cv.height;
    const pctx = pre.getContext('2d'); pctx.imageSmoothingQuality = 'high'; pctx.drawImage(img, 0, 0, pre.width, pre.height);
    try { rendererRef.current = createGradeRenderer(cv, pre); } catch (e) { console.error(e); rendererRef.current = null; }
    if (!rendererRef.current) setNoGl(true);
    return () => { rendererRef.current?.dispose(); rendererRef.current = null; };
  }, [src]);

  useEffect(() => {
    const id = requestAnimationFrame(() => rendererRef.current?.render(params, { original: showOrig, seed: 1 }));
    return () => cancelAnimationFrame(id);
  }, [params, showOrig, src]);

  function download() {
    const img = imgRef.current; if (!img) return;
    const max = Math.min(maxTextureSize(), 8192);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const pre = document.createElement('canvas'); pre.width = c.width; pre.height = c.height; pre.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const r = createGradeRenderer(c, pre); if (!r) return;
    r.render(params, { seed: 1 });
    const mime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
    c.toBlob((blob) => {
      r.dispose();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}-graded.${fmt}`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, mime, 0.94);
  }
  function exportCube() {
    const U = gradeUniforms(params);
    downloadText(writeCube(buildLut((rgb) => gradeColor(rgb, U), 33), `Vetor Grade ${name}`), `${name}-grade.cube`);
  }

  const touched = Object.keys(GRADE_DEFAULTS).some((k) => params[k] !== 0);
  const set = (k, v) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="tool-panel grade-tool">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="grade-layout">
          <div className="grade-preview">
            <canvas ref={canvasRef} className="grade-canvas" onPointerDown={() => setShowOrig(true)} onPointerUp={() => setShowOrig(false)} onPointerLeave={() => setShowOrig(false)} />
            {noGl ? <p className="color-invalid">{t.noGl}</p> : <span className="grade-before-hint">👁 {t.before}</span>}
            <div className="tool-field">
              <span className="tool-field-label">{t.presets}</span>
              <div className="mg-chips">
                {PRESETS.map((p) => <button key={p.id} type="button" className="mg-chip" onClick={() => setParams({ ...GRADE_DEFAULTS, ...p.p })}>{p[language] || p.ru}</button>)}
              </div>
            </div>
          </div>
          <div className="grade-sliders">
            {GROUPS.map((g) => (
              <div key={g.ru} className="grade-group">
                <div className="grade-group-title">{g[language] || g.ru}</div>
                {g.items.map(([key, ru, en, min = -100]) => (
                  <label key={key} className="grade-row">
                    <span className="grade-row-head">
                      <span>{language === 'en' ? en : ru}</span>
                      <span className={params[key] !== 0 ? 'grade-val is-set' : 'grade-val'}>{params[key] > 0 ? `+${params[key]}` : params[key]}</span>
                    </span>
                    <input type="range" min={min} max={100} value={params[key]} onChange={(e) => set(key, Number(e.target.value))} onDoubleClick={() => set(key, 0)} />
                  </label>
                ))}
              </div>
            ))}
            <div className="tool-field">
              <span className="tool-field-label">{t.format}</span>
              <div className="segmented">
                {['jpg', 'png', 'webp'].map((f) => <button key={f} type="button" className={fmt === f ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}
              </div>
            </div>
            <div className="tool-actions grade-actions">
              <button type="button" className="tool-btn primary" onClick={download}>⬇ {t.download}</button>
              <button type="button" className="tool-btn" onClick={exportCube}>{t.cube}</button>
              <button type="button" className="tool-btn ghost" onClick={() => setParams(GRADE_DEFAULTS)} disabled={!touched}>{t.reset}</button>
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
