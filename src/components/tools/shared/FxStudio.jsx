import { useEffect, useRef, useState } from 'react';
import { FX_DEFAULTS, FX_PRESETS, createFx } from '../../../utils/fxGL';

// Общая студия ретро-эффектов на GPU для страниц «CRT / глитч» и «VHS / Print Lab»:
// пресеты, группы ползунков, живая анимация, VHS-таймкод, экспорт PNG и WebM.

const GROUPS = [
  { id: 'crt', ru: 'CRT', en: 'CRT', items: [['curvature', 'Кривизна кинескопа', 'Curvature', 0, 1.5], ['scanlines', 'Скан-линии', 'Scanlines', 0, 1], ['scanDensity', 'Плотность линий', 'Line density', 0.3, 2], ['mask', 'RGB-маска', 'RGB mask', 0, 1], ['glow', 'Свечение', 'Glow', 0, 1.5], ['flicker', 'Мерцание', 'Flicker', 0, 1]] },
  { id: 'glitch', ru: 'Глитч', en: 'Glitch', items: [['rgbShift', 'RGB-сдвиг', 'RGB shift', 0, 20], ['rgbAngle', 'Угол сдвига', 'Shift angle', 0, 360], ['blocks', 'Блоки', 'Blocks', 0, 1], ['blockSize', 'Размер блоков', 'Block size', 0, 1]] },
  { id: 'vhs', ru: 'VHS', en: 'VHS', items: [['jitter', 'Дрожание строк', 'Line jitter', 0, 1], ['tracking', 'Трекинг', 'Tracking', 0, 1], ['chromaBlur', 'Размытие цвета', 'Chroma blur', 0, 1.5], ['bleed', 'Растекание', 'Bleed', 0, 1], ['tapeNoise', 'Помехи ленты', 'Tape noise', 0, 1]] },
  { id: 'print', ru: 'Печать', en: 'Print', items: [['misreg', 'Несовмещение CMY', 'CMY misregistration', 0, 8], ['posterize', 'Постеризация', 'Posterize', 0, 1], ['paperGrain', 'Зерно бумаги', 'Paper grain', 0, 1], ['paper', 'Тон бумаги', 'Paper tone', 0, 1]] },
  { id: 'film', ru: 'Плёнка', en: 'Film', items: [['grain', 'Зерно', 'Grain', 0, 1], ['scratches', 'Царапины и пыль', 'Scratches & dust', 0, 1], ['leak', 'Засветка', 'Light leak', 0, 1]] },
  { id: 'tone', ru: 'Тон', en: 'Tone', items: [['saturation', 'Насыщенность', 'Saturation', 0, 2], ['contrast', 'Контраст', 'Contrast', 0.5, 1.8], ['brightness', 'Яркость', 'Brightness', -0.3, 0.3], ['vignette', 'Виньетка', 'Vignette', 0, 1]] },
];

const TEXT = {
  ru: { drop: 'Перетащите картинку или нажмите', hint: 'PNG, JPG, WebP — обрабатывается на видеокарте, локально', presets: 'Пресеты', animate: 'Анимация', stamp: 'VHS-таймкод', reseed: 'Перетрясти', png: 'Скачать PNG', webm: 'Записать видео 4 с (WebM)', recording: 'Запись…', reset: 'Сбросить', change: 'Другое', noGl: 'WebGL недоступен.' },
  en: { drop: 'Drop an image or click', hint: 'PNG, JPG, WebP — processed on the GPU, locally', presets: 'Presets', animate: 'Animate', stamp: 'VHS timestamp', reseed: 'Reshuffle', png: 'Download PNG', webm: 'Record 4 s video (WebM)', recording: 'Recording…', reset: 'Reset', change: 'Another', noGl: 'WebGL is unavailable.' },
};

export default function FxStudio({ language = 'ru', groups = GROUPS.map((g) => g.id), presets = FX_PRESETS.map((p) => p.id), initial = 'vhs', note }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null); const glRef = useRef(null); const outRef = useRef(null); const fxRef = useRef(null);
  const [img, setImg] = useState(null);
  const [p, setP] = useState(() => ({ ...FX_DEFAULTS, ...(FX_PRESETS.find((x) => x.id === initial)?.p || {}) }));
  const [stamp, setStamp] = useState(!!FX_PRESETS.find((x) => x.id === initial)?.stamp);
  const [animate, setAnimate] = useState(true);
  const [seed, setSeed] = useState(1);
  const [rec, setRec] = useState(false);
  const [noGl, setNoGl] = useState(false);

  function load(f) { if (!f || !f.type.startsWith('image/')) return; const u = URL.createObjectURL(f); const i = new Image(); i.onload = () => setImg(i); i.src = u; }

  useEffect(() => {
    if (!img || !glRef.current) return undefined;
    const c = glRef.current; const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const pre = document.createElement('canvas'); pre.width = c.width; pre.height = c.height; pre.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    try { fxRef.current = createFx(c, pre); } catch (e) { console.error(e); fxRef.current = null; }
    if (!fxRef.current) setNoGl(true);
    return () => { fxRef.current?.dispose(); fxRef.current = null; };
  }, [img]);

  // Кадр: GPU-эффект + (опционально) VHS-таймкод поверх на 2D-холсте.
  const drawFrame = (time) => {
    const fx = fxRef.current; const out = outRef.current; const c = glRef.current; if (!fx || !out || !c) return;
    fx.render(p, time, seed);
    out.width = c.width; out.height = c.height; const x = out.getContext('2d'); x.drawImage(c, 0, 0);
    if (stamp) {
      const s = Math.round(out.height / 18); x.font = `bold ${s}px "VCR OSD Mono", "Courier New", monospace`; x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = s / 6;
      x.fillText('PLAY ▶', s, s * 1.5);
      const secs = 7453 + Math.floor(time); const tc = `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      x.fillText(`SP  ${tc}`, s, out.height - s); x.textAlign = 'right'; x.fillText('SEP. 29 1989', out.width - s, out.height - s); x.textAlign = 'left'; x.shadowBlur = 0;
    }
  };

  useEffect(() => {
    if (!img) return undefined;
    let raf = 0; const t0 = performance.now(); let last = 0;
    const loop = (now) => { if (now - last > 40) { drawFrame((now - t0) / 1000); last = now; } raf = requestAnimationFrame(loop); };
    if (animate) raf = requestAnimationFrame(loop); else setTimeout(() => drawFrame(0));
    return () => cancelAnimationFrame(raf);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function png() { outRef.current.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'retro.png'; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png'); }
  function webm() {
    const out = outRef.current; if (!out.captureStream || !window.MediaRecorder) return;
    const stream = out.captureStream(25); const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 }); const chunks = [];
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'retro.webm'; document.body.appendChild(a); a.click(); a.remove(); setRec(false); };
    setAnimate(true); setRec(true); r.start(); setTimeout(() => r.stop(), 4000);
  }

  const shown = GROUPS.filter((g) => groups.includes(g.id));
  return (
    <div className="tool-panel fx-studio">
      {!img ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            <canvas ref={glRef} hidden />
            <canvas ref={outRef} className="fx-out" />
            {noGl && <p className="color-invalid">{t.noGl}</p>}
            <div className="tool-field"><span className="tool-field-label">{t.presets}</span>
              <div className="mg-chips">{FX_PRESETS.filter((x) => presets.includes(x.id)).map((x) => <button key={x.id} type="button" className="mg-chip" onClick={() => { setP({ ...FX_DEFAULTS, ...x.p }); setStamp(!!x.stamp); }}>{x[language] || x.ru}</button>)}</div>
            </div>
            <div className="tool-actions">
              <label className="tool-check"><input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> {t.animate}</label>
              <label className="tool-check"><input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} /> {t.stamp}</label>
            </div>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={png}>{t.png}</button>
              <button type="button" className="tool-btn" onClick={webm} disabled={rec}>{rec ? t.recording : t.webm}</button>
              <button type="button" className="tool-btn" onClick={() => setSeed(Math.random() * 1000)}>🎲 {t.reseed}</button>
              <button type="button" className="tool-btn ghost" onClick={() => setP({ ...FX_DEFAULTS })}>{t.reset}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            {shown.map((g) => (
              <div key={g.id} className="grade-group">
                <div className="grade-group-title">{g[language] || g.ru}</div>
                {g.items.map(([k, ru, en, min, max]) => (
                  <label key={k} className="grade-row">
                    <span className="grade-row-head"><span>{language === 'en' ? en : ru}</span><span className={p[k] !== FX_DEFAULTS[k] ? 'grade-val is-set' : 'grade-val'}>{Math.round(p[k] * 100) / 100}</span></span>
                    <input type="range" min={min} max={max} step={(max - min) / 200} value={p[k]} onChange={(e) => setP((s) => ({ ...s, [k]: Number(e.target.value) }))} onDoubleClick={() => setP((s) => ({ ...s, [k]: FX_DEFAULTS[k] }))} />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
      {note && <p className="tool-local-note">🔒 {note}</p>}
    </div>
  );
}
