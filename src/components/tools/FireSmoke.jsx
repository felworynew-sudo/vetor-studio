import { useEffect, useRef, useState } from 'react';
import { FIRE_DEFAULTS, FIRE_PRESETS, createFluid } from '../../utils/fluidGL';

// Огонь и дым: настоящая симуляция жидкости на видеокарте (stable fluids,
// WebGL2) — температура поднимает газ, вихри закручивают языки пламени,
// остывающий газ становится дымом. Пресеты, палитры, ветер, мышь —
// раздувать и «рисовать» огонь, двойной клик — перенести источник.
// Экспорт: PNG-кадр (с альфой), видео WebM и спрайт-лист для игр.

const TEXT = {
  ru: {
    preset: 'Пресет', play: 'Пуск', stop: 'Пауза', reset: 'Сначала', png: 'PNG-кадр', webm: 'Видео 5 с (WebM)', rec: 'Запись…', sheet: 'Спрайт-лист 6×6',
    intensity: 'Сила источника', heat: 'Жар', smoke: 'Дым', buoyancy: 'Подъёмная сила', vorticity: 'Турбулентность', cooling: 'Остывание', wind: 'Ветер', width: 'Ширина источника',
    palette: 'Палитра', fire: 'Огонь', blue: 'Синий', green: 'Зелёный', purple: 'Фиолетовый', bg: 'Фон', bgTr: 'Прозрачный', bgBk: 'Чёрный', quality: 'Детализация', shape: 'Кадр', tall: 'Вертикальный', square: 'Квадрат',
    hint: '🖱 Тяните по кадру — раздувать пламя, двойной клик — перенести источник', noGl: 'Нужен WebGL2 с float-текстурами — в этом браузере недоступно.',
    note: 'Симуляция считается на видеокарте локально. PNG и спрайт-лист на прозрачном фоне сохраняют альфу.',
  },
  en: {
    preset: 'Preset', play: 'Play', stop: 'Pause', reset: 'Restart', png: 'PNG frame', webm: '5 s video (WebM)', rec: 'Recording…', sheet: 'Sprite sheet 6×6',
    intensity: 'Source strength', heat: 'Heat', smoke: 'Smoke', buoyancy: 'Buoyancy', vorticity: 'Turbulence', cooling: 'Cooling', wind: 'Wind', width: 'Source width',
    palette: 'Palette', fire: 'Fire', blue: 'Blue', green: 'Green', purple: 'Purple', bg: 'Background', bgTr: 'Transparent', bgBk: 'Black', quality: 'Detail', shape: 'Frame', tall: 'Portrait', square: 'Square',
    hint: '🖱 Drag across the frame to fan the flames, double-click to move the source', noGl: 'Needs WebGL2 with float textures — unavailable in this browser.',
    note: 'The simulation runs on your GPU locally. PNG and the sprite sheet keep alpha on a transparent background.',
  },
};

const SLIDERS = [['intensity', 0.2, 3, 0.05], ['heat', 0.1, 2.5, 0.05], ['smoke', 0, 2, 0.05], ['buoyancy', 1, 25, 0.5], ['vorticity', 0, 60, 1], ['cooling', 0.2, 3.5, 0.05], ['wind', -6, 6, 0.1]];

function merge(preset) {
  const p = FIRE_PRESETS.find((x) => x.id === preset)?.p || {};
  return { ...FIRE_DEFAULTS, ...p, source: { ...FIRE_DEFAULTS.source, ...(p.source || {}) } };
}

function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

function FireSmoke({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const [preset, setPreset] = useState('campfire');
  const [p, setP] = useState(() => merge('campfire'));
  const [bg, setBg] = useState('transparent');
  const [quality, setQuality] = useState(192);
  const [tall, setTall] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [rec, setRec] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const live = useRef({}); live.current = { p, bg, playing };
  const splats = useRef([]); const timeRef = useRef(0); const drag = useRef(null);

  // Пересоздаём симуляцию при смене размера кадра/детализации.
  useEffect(() => {
    const c = canvasRef.current; c.width = 512; c.height = tall ? 640 : 512;
    let sim = null; try { sim = createFluid(c, quality); } catch (e) { console.error(e); }
    if (!sim) { setNoGl(true); return undefined; }
    simRef.current = sim; timeRef.current = 0;
    let raf = 0;
    const loop = () => {
      const s = live.current;
      if (s.playing) { const dt = 1 / 60; timeRef.current += dt; sim.step(s.p, dt, timeRef.current, splats.current.splice(0)); }
      sim.render(s.p, s.bg);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); sim.dispose(); simRef.current = null; };
  }, [quality, tall]);

  const uv = (e) => { const r = canvasRef.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
  function onMove(e) {
    if (!drag.current) return; const [x, y] = uv(e); const [px, py] = drag.current;
    splats.current.push({ x, y, dx: (x - px) * 60, dy: (y - py) * 60 }); drag.current = [x, y];
  }
  function moveSource(e) { const [x, y] = uv(e); setP((s) => ({ ...s, source: { ...s.source, x, y } })); }

  function choose(id) { setPreset(id); setP(merge(id)); simRef.current?.reset(); timeRef.current = 0; }

  function png() { canvasRef.current.toBlob((b) => download(b, `fire-${preset}.png`), 'image/png'); }
  function webm() {
    const c = canvasRef.current; if (!c.captureStream || !window.MediaRecorder) return;
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8e6 }); const chunks = [];
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => { download(new Blob(chunks, { type: 'video/webm' }), `fire-${preset}.webm`); setRec(false); };
    setPlaying(true); setRec(true); r.start(); setTimeout(() => r.stop(), 5000);
  }
  // 36 кадров цикла по 3 шага симуляции в сетку 6×6 (кадр 160 px по ширине).
  function sheet() {
    const sim = simRef.current; const c = canvasRef.current; if (!sim) return;
    const cw = 160; const ch = Math.round(cw * c.height / c.width); const out = document.createElement('canvas'); out.width = cw * 6; out.height = ch * 6;
    const x = out.getContext('2d');
    for (let i = 0; i < 36; i += 1) {
      for (let k = 0; k < 3; k += 1) { timeRef.current += 1 / 60; sim.step(p, 1 / 60, timeRef.current, []); }
      sim.render(p, bg); x.drawImage(c, (i % 6) * cw, Math.floor(i / 6) * ch, cw, ch);
    }
    out.toBlob((b) => download(b, `fire-${preset}-sheet-6x6.png`), 'image/png');
  }

  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const seg = (value, onPick, opts) => (
    <div className="segmented">{opts.map(([v, label]) => <button key={String(v)} type="button" className={value === v ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => onPick(v)}>{label}</button>)}</div>
  );

  return (
    <div className="tool-panel firesmoke">
      <div className="iso-layout">
        <div className="iso-stage fs-stage" data-bg={bg}>
          <canvas
            ref={canvasRef}
            className="fs-canvas"
            onPointerDown={(e) => { drag.current = uv(e); e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={onMove}
            onPointerUp={() => { drag.current = null; }}
            onDoubleClick={moveSource}
          />
          {noGl && <p className="color-invalid">{t.noGl}</p>}
          <span className="iso-drag">{t.hint}</span>
        </div>
        <div className="iso-controls">
          <div className="tool-field">
            <span className="tool-field-label">{t.preset}</span>
            <div className="gm-sets">
              {FIRE_PRESETS.map((x) => <button key={x.id} type="button" className={preset === x.id ? 'crop-ratio is-active' : 'crop-ratio'} onClick={() => choose(x.id)}>{x[language] || x.ru}</button>)}
            </div>
          </div>
          {SLIDERS.map(([k, min, max, step]) => (
            <label key={k} className="tool-field">
              <span className="tool-field-label">{t[k]}: {p[k].toFixed(step < 0.1 ? 2 : 1)}</span>
              <input type="range" min={min} max={max} step={step} value={p[k]} onChange={(e) => set(k, Number(e.target.value))} />
            </label>
          ))}
          <label className="tool-field">
            <span className="tool-field-label">{t.width}: {Math.round(p.source.w * 200)}%</span>
            <input type="range" min="0" max="0.45" step="0.005" value={p.source.w} onChange={(e) => setP((s) => ({ ...s, source: { ...s.source, w: Number(e.target.value) } }))} />
          </label>
          <div className="tool-field"><span className="tool-field-label">{t.palette}</span>{seg(p.palette, (v) => set('palette', v), [['fire', t.fire], ['blue', t.blue], ['green', t.green], ['purple', t.purple]])}</div>
          <div className="tool-field"><span className="tool-field-label">{t.bg}</span>{seg(bg, setBg, [['transparent', t.bgTr], ['#000000', t.bgBk]])}</div>
          <div className="tool-field"><span className="tool-field-label">{t.shape}</span>{seg(tall, setTall, [[true, t.tall], [false, t.square]])}</div>
          <div className="tool-field"><span className="tool-field-label">{t.quality}</span>{seg(quality, setQuality, [[128, '128'], [192, '192'], [256, '256']])}</div>
          <div className="tool-actions">
            <button type="button" className="tool-btn" onClick={() => setPlaying((v) => !v)}>{playing ? `⏸ ${t.stop}` : `▶ ${t.play}`}</button>
            <button type="button" className="tool-btn ghost" onClick={() => { simRef.current?.reset(); timeRef.current = 0; }}>↺ {t.reset}</button>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={png}>{t.png}</button>
            <button type="button" className="tool-btn" onClick={webm} disabled={rec}>{rec ? t.rec : t.webm}</button>
            <button type="button" className="tool-btn" onClick={sheet}>{t.sheet}</button>
          </div>
        </div>
      </div>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default FireSmoke;
