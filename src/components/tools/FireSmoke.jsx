import { useCallback, useEffect, useRef, useState } from 'react';

// Генератор огня и дыма: система частиц на canvas. Пресеты пламени (свеча,
// костёр, факел, огненный шар) и дыма (лёгкий, густой), свечение вкл/выкл,
// старт/стоп анимации, фон прозрачный или чёрный, экспорт кадра в PNG. Локально.

const PRESETS = {
  candle: { kind: 'fire', ru: 'Свеча', en: 'Candle', spawnW: 8, rate: 3, rise: 2.1, spread: 0.5, size: 9, spin: 0 },
  campfire: { kind: 'fire', ru: 'Костёр', en: 'Campfire', spawnW: 64, rate: 12, rise: 3.0, spread: 1.4, size: 15, spin: 0 },
  torch: { kind: 'fire', ru: 'Факел', en: 'Torch', spawnW: 22, rate: 8, rise: 3.4, spread: 0.9, size: 13, spin: 0 },
  fireball: { kind: 'fire', ru: 'Огненный шар', en: 'Fireball', spawnW: 40, rate: 16, rise: 1.4, spread: 2.6, size: 17, spin: 1 },
  smokeThin: { kind: 'smoke', ru: 'Дым лёгкий', en: 'Light smoke', spawnW: 16, rate: 2.5, rise: 1.6, spread: 1.0, size: 26, spin: 0 },
  smokeThick: { kind: 'smoke', ru: 'Дым густой', en: 'Thick smoke', spawnW: 40, rate: 6, rise: 1.3, spread: 1.4, size: 34, spin: 0 },
};

const TEXT = {
  ru: { preset: 'Тип', glow: 'Свечение', bg: 'Фон', bgTr: 'Прозрачный', bgBk: 'Чёрный', intensity: 'Интенсивность', play: 'Пуск', stop: 'Стоп', save: 'Скачать PNG', note: 'Анимация частиц считается локально в браузере. PNG сохраняет текущий кадр (на прозрачном фоне — с альфой).' },
  en: { preset: 'Type', glow: 'Glow', bg: 'Background', bgTr: 'Transparent', bgBk: 'Black', intensity: 'Intensity', play: 'Play', stop: 'Stop', save: 'Download PNG', note: 'The particle animation runs locally in your browser. PNG saves the current frame (transparent background keeps alpha).' },
};

function FireSmoke({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const canvasRef = useRef(null);
  const stateRef = useRef({ parts: [], raf: 0, playing: false, t: 0 });

  const [preset, setPreset] = useState('campfire');
  const [glow, setGlow] = useState(true);
  const [bg, setBg] = useState('transparent');
  const [intensity, setIntensity] = useState(1);
  const [playing, setPlaying] = useState(true);

  // держим настройки в ref, чтобы цикл видел свежие значения без пересоздания
  const cfg = useRef({});
  cfg.current = { preset, glow, bg, intensity };

  const frame = useCallback(() => {
    const st = stateRef.current; const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d'); const W = canvas.width; const H = canvas.height;
    const { preset: pk, glow: gl, bg: bgc, intensity: inten } = cfg.current;
    const p = PRESETS[pk]; const smoke = p.kind === 'smoke';
    st.t += 1;
    // фон
    if (bgc === 'black') { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    else ctx.clearRect(0, 0, W, H);
    // эмиссия
    const ex = W / 2; const ey = H * 0.86;
    const n = Math.round(p.rate * inten);
    for (let i = 0; i < n; i += 1) {
      const ang = p.spin ? Math.random() * Math.PI * 2 : 0;
      const rad = p.spin ? Math.random() * p.spawnW : (Math.random() - 0.5) * p.spawnW;
      st.parts.push({
        x: ex + (p.spin ? Math.cos(ang) * rad : rad),
        y: ey + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * p.spread + (p.spin ? Math.cos(ang) * 0.8 : 0),
        vy: -(p.rise * (0.7 + Math.random() * 0.6)) - (p.spin ? Math.sin(ang) * 0.6 : 0),
        life: 0, max: 40 + Math.random() * 45, size: p.size * (0.7 + Math.random() * 0.6), seed: Math.random() * 100,
      });
    }
    if (st.parts.length > 2600) st.parts.splice(0, st.parts.length - 2600);
    // отрисовка
    ctx.globalCompositeOperation = (gl && !smoke) ? 'lighter' : 'source-over';
    for (let i = st.parts.length - 1; i >= 0; i -= 1) {
      const q = st.parts[i]; q.life += 1;
      const age = q.life / q.max;
      if (age >= 1) { st.parts.splice(i, 1); continue; }
      q.x += q.vx + Math.sin((st.t + q.seed) * 0.08) * (smoke ? 0.5 : 0.7);
      q.y += q.vy; q.vy *= 0.985; if (smoke) q.vx *= 0.98;
      const r = q.size * (smoke ? (0.6 + age * 1.6) : (0.5 + (1 - age) * 0.9));
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      if (smoke) {
        const sh = 60 + ((q.seed * 3) % 50 | 0);
        const a = Math.sin(age * Math.PI) * 0.22 * inten;
        g.addColorStop(0, `rgba(${sh},${sh},${sh},${a})`); g.addColorStop(1, `rgba(${sh},${sh},${sh},0)`);
      } else {
        const a = (1 - age) ** 1.3;
        g.addColorStop(0, `hsla(${52 - age * 46}, 100%, ${72 - age * 42}%, ${a})`);
        g.addColorStop(0.6, `hsla(${34 - age * 26}, 100%, 50%, ${a * 0.5})`);
        g.addColorStop(1, 'hsla(10, 100%, 40%, 0)');
      }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (st.playing) st.raf = requestAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const st = stateRef.current; st.playing = playing;
    if (playing) { cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(frame); }
    else cancelAnimationFrame(st.raf);
    return () => cancelAnimationFrame(st.raf);
  }, [playing, frame]);

  useEffect(() => () => cancelAnimationFrame(stateRef.current.raf), []);

  function save() {
    const canvas = canvasRef.current; if (!canvas) return;
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'fire-smoke.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const fires = Object.entries(PRESETS).filter(([, v]) => v.kind === 'fire');
  const smokes = Object.entries(PRESETS).filter(([, v]) => v.kind === 'smoke');

  return (
    <div className="tool-panel firesmoke">
      <div className="iso-layout">
        <div className="iso-stage fs-stage" data-bg={bg}>
          <canvas ref={canvasRef} width="480" height="480" className="fs-canvas" />
        </div>
        <div className="iso-controls">
          <div className="tool-field">
            <span className="tool-field-label">{t.preset}</span>
            <div className="gm-sets">
              {fires.map(([k, v]) => <button key={k} type="button" className={preset === k ? 'crop-ratio is-active' : 'crop-ratio'} onClick={() => setPreset(k)}>🔥 {v[language] || v.ru}</button>)}
              {smokes.map(([k, v]) => <button key={k} type="button" className={preset === k ? 'crop-ratio is-active' : 'crop-ratio'} onClick={() => setPreset(k)}>💨 {v[language] || v.ru}</button>)}
            </div>
          </div>
          <div className="tool-field">
            <span className="tool-field-label">{t.intensity}: {intensity.toFixed(1)}×</span>
            <input type="range" min="0.3" max="2.5" step="0.1" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
          </div>
          <label className="rec-opt"><input type="checkbox" checked={glow} onChange={(e) => setGlow(e.target.checked)} /> {t.glow}</label>
          <div className="tool-field">
            <span className="tool-field-label">{t.bg}</span>
            <div className="segmented">
              <button type="button" className={bg === 'transparent' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBg('transparent')}>{t.bgTr}</button>
              <button type="button" className={bg === 'black' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBg('black')}>{t.bgBk}</button>
            </div>
          </div>
          <div className="tool-actions">
            <button type="button" className={playing ? 'tool-btn' : 'tool-btn primary'} onClick={() => setPlaying((v) => !v)}>{playing ? `⏸ ${t.stop}` : `▶ ${t.play}`}</button>
            <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
          </div>
        </div>
      </div>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default FireSmoke;
