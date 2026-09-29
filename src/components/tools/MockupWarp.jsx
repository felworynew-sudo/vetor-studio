import { useEffect, useRef, useState } from 'react';
import { createWarp } from '../../utils/warpGL';
import { maxTextureSize } from '../../utils/gradeGL';

// Мокап с перспективой: фото сцены (билборд, экран, коробка, стена) + ваш дизайн →
// ставите 4 угла, дизайн натягивается по гомографии (WebGL, сглаженные края).
// Режим «сохранить свет» пропускает тени и блики сцены поверх дизайна.

const TEXT = {
  ru: {
    scene: 'Фото сцены (билборд, экран, стена…)', design: 'Ваш дизайн', drop: 'Перетащите или нажмите',
    hint: 'Перетащите 4 угла на место экрана/плаката. Порядок: левый верх, правый верх, правый низ, левый низ.',
    fit: 'Вписать дизайн', stretch: 'Растянуть', cover: 'Заполнить', contain: 'Целиком', blend: 'Смешивание', normal: 'Обычное', multiply: 'Умножение', light: 'Сохранить свет сцены',
    lightAmt: 'Свет сцены', opacity: 'Непрозрачность', reset: 'Сбросить углы', download: 'Скачать PNG', noGl: 'WebGL недоступен.',
    note: 'Всё локально. Для экранов ноутбуков и телефонов используйте «Обычное», для плакатов, ткани и стен — «Сохранить свет».',
  },
  en: {
    scene: 'Scene photo (billboard, screen, wall…)', design: 'Your design', drop: 'Drop or click',
    hint: 'Drag the 4 corners onto the screen/poster. Order: top-left, top-right, bottom-right, bottom-left.',
    fit: 'Fit design', stretch: 'Stretch', cover: 'Cover', contain: 'Contain', blend: 'Blend', normal: 'Normal', multiply: 'Multiply', light: 'Keep scene light',
    lightAmt: 'Scene light', opacity: 'Opacity', reset: 'Reset corners', download: 'Download PNG', noGl: 'WebGL is unavailable.',
    note: 'All local. Use “Normal” for laptop and phone screens, “Keep scene light” for posters, fabric and walls.',
  },
};

const PREVIEW = 1600;

function Drop({ label, url, onFile, t }) {
  const ref = useRef(null);
  return (
    <button type="button" className="pt-drop" onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
      {url ? <img src={url} alt="" /> : <span>{t.drop}</span>}
      <em>{label}</em>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
    </button>
  );
}

const defaultQuad = (w, h) => [[w * 0.25, h * 0.2], [w * 0.75, h * 0.25], [w * 0.72, h * 0.78], [w * 0.28, h * 0.8]];

function MockupWarp({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const warpRef = useRef(null);
  const [scene, setScene] = useState(null);
  const [design, setDesign] = useState(null);
  const [quad, setQuad] = useState(null); // в пикселях превью
  const [fit, setFit] = useState('cover');
  const [mode, setMode] = useState(0);
  const [light, setLight] = useState(0.6);
  const [opacity, setOpacity] = useState(1);
  const [noGl, setNoGl] = useState(false);

  const load = (set) => (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => set({ img, url, name: file.name.replace(/\.[^.]+$/, '') }); img.src = url;
  };

  // Новая сцена: холст превью и рендерер.
  useEffect(() => {
    const cv = canvasRef.current; if (!scene || !cv) return undefined;
    const k = Math.min(1, PREVIEW / Math.max(scene.img.naturalWidth, scene.img.naturalHeight));
    cv.width = Math.round(scene.img.naturalWidth * k); cv.height = Math.round(scene.img.naturalHeight * k);
    let w = null;
    try { w = createWarp(cv); } catch (e) { console.error(e); }
    if (!w) { setNoGl(true); return undefined; }
    const pre = document.createElement('canvas'); pre.width = cv.width; pre.height = cv.height; pre.getContext('2d').drawImage(scene.img, 0, 0, cv.width, cv.height);
    w.setScene(pre); if (design) w.setDesign(design.img);
    warpRef.current = w;
    setQuad(defaultQuad(cv.width, cv.height));
    return () => { w.dispose(); warpRef.current = null; };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (design && warpRef.current) warpRef.current.setDesign(design.img); }, [design]);

  useEffect(() => {
    if (quad && warpRef.current) warpRef.current.render(quad, { opacity, mode, light, fit });
  }, [quad, opacity, mode, light, fit, design]);

  function startDrag(e, i) {
    e.preventDefault(); e.stopPropagation();
    const rect = wrapRef.current.getBoundingClientRect(); const cv = canvasRef.current;
    const k = cv.width / rect.width;
    const move = (ev) => {
      const x = Math.max(0, Math.min(cv.width, (ev.clientX - rect.left) * k));
      const y = Math.max(0, Math.min(cv.height, (ev.clientY - rect.top) * k));
      setQuad((q) => q.map((p, j) => (j === i ? [x, y] : p)));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  function download() {
    const img = scene.img; const cv = canvasRef.current;
    const k = Math.min(1, Math.min(maxTextureSize(), 8192) / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const w = createWarp(c); if (!w) return;
    w.setScene(img.naturalWidth === c.width ? img : (() => { const p = document.createElement('canvas'); p.width = c.width; p.height = c.height; p.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return p; })());
    if (design) w.setDesign(design.img);
    const s = c.width / cv.width;
    w.render(quad.map(([x, y]) => [x * s, y * s]), { opacity, mode, light, fit });
    c.toBlob((b) => { w.dispose(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${scene.name}-mockup.png`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }

  const cv = canvasRef.current;
  return (
    <div className="tool-panel mockup-warp">
      <div className="pt-inputs">
        <Drop label={t.scene} url={scene?.url} onFile={load(setScene)} t={t} />
        <span />
        <Drop label={t.design} url={design?.url} onFile={load(setDesign)} t={t} />
      </div>
      {scene && (
        <>
          <p className="tool-local-note">🖱 {t.hint}</p>
          <div className="mw-stage" ref={wrapRef}>
            <canvas ref={canvasRef} className="mw-canvas" />
            {noGl && <p className="color-invalid">{t.noGl}</p>}
            {quad && cv && (
              <>
                <svg className="mw-svg" viewBox={`0 0 ${cv.width} ${cv.height}`} preserveAspectRatio="none">
                  <polygon points={quad.map((p) => p.join(',')).join(' ')} fill="none" stroke="#fff" strokeWidth={cv.width / 500} strokeDasharray={`${cv.width / 120} ${cv.width / 160}`} />
                </svg>
                {quad.map(([x, y], i) => (
                  <span key={i} className="mw-handle" style={{ left: `${(x / cv.width) * 100}%`, top: `${(y / cv.height) * 100}%` }} onPointerDown={(e) => startDrag(e, i)}>{i + 1}</span>
                ))}
              </>
            )}
          </div>
          <div className="tool-controls">
            <div className="tool-field"><span className="tool-field-label">{t.fit}</span>
              <div className="segmented">{[['cover', t.cover], ['contain', t.contain], ['stretch', t.stretch]].map(([id, l]) => <button key={id} type="button" className={fit === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFit(id)}>{l}</button>)}</div>
            </div>
            <div className="tool-field"><span className="tool-field-label">{t.blend}</span>
              <div className="segmented">{[[0, t.normal], [1, t.multiply], [2, t.light]].map(([id, l]) => <button key={id} type="button" className={mode === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode(id)}>{l}</button>)}</div>
            </div>
            {mode === 2 && <label className="tool-field"><span className="tool-field-label">{t.lightAmt}: {Math.round(light * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={light} onChange={(e) => setLight(Number(e.target.value))} /></label>}
            <label className="tool-field"><span className="tool-field-label">{t.opacity}: {Math.round(opacity * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={download} disabled={!design}>{t.download}</button>
            <button type="button" className="tool-btn ghost" onClick={() => setQuad(defaultQuad(cv.width, cv.height))}>{t.reset}</button>
          </div>
        </>
      )}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default MockupWarp;
