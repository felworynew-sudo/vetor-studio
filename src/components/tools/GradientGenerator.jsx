import { useState } from 'react';

// Генератор CSS-градиентов: стопы, угол, тип. Живой предпросмотр + копирование
// готового CSS. Локально.

const TEXT = {
  ru: {
    type: 'Тип', linear: 'Линейный', radial: 'Радиальный', angle: 'Угол',
    stops: 'Цвета', add: '+ Цвет', copy: 'Копировать CSS', copied: 'Скопировано',
    random: 'Случайный', hint: 'Готовый CSS можно вставить в свойство background.',
  },
  en: {
    type: 'Type', linear: 'Linear', radial: 'Radial', angle: 'Angle',
    stops: 'Colors', add: '+ Color', copy: 'Copy CSS', copied: 'Copied',
    random: 'Random', hint: 'Paste the generated CSS into a background property.',
  },
};

const PRESETS = [
  ['#6166ff', '#ff5c63'], ['#0d0d11', '#6166ff'], ['#3ec98a', '#ffb703'],
  ['#f72585', '#4cc9f0'], ['#264653', '#e9c46a'], ['#ff9e00', '#03071e'],
];

function GradientGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [type, setType] = useState('linear');
  const [angle, setAngle] = useState(135);
  const [stops, setStops] = useState([
    { color: '#6166ff', pos: 0 },
    { color: '#ff5c63', pos: 100 },
  ]);
  const [copied, setCopied] = useState(false);

  const stopStr = stops.map((s) => `${s.color} ${s.pos}%`).join(', ');
  const css = type === 'linear'
    ? `linear-gradient(${angle}deg, ${stopStr})`
    : `radial-gradient(circle, ${stopStr})`;

  function updateStop(i, patch) {
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStop() {
    if (stops.length >= 5) return;
    setStops((prev) => [...prev, { color: '#ffffff', pos: 50 }]);
  }
  function removeStop(i) {
    if (stops.length <= 2) return;
    setStops((prev) => prev.filter((_, idx) => idx !== i));
  }
  function randomize() {
    const p = PRESETS[Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) % PRESETS.length)];
    setStops(p.map((color, i) => ({ color, pos: i === 0 ? 0 : 100 })));
    setAngle(Math.round((typeof performance !== 'undefined' ? performance.now() : 90) % 360));
  }
  function copy() {
    if (navigator.clipboard) navigator.clipboard.writeText(`background: ${css};`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  }

  return (
    <div className="tool-panel gradient-generator">
      <div className="gg-preview" style={{ background: css }} />

      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.type}</span>
          <div className="segmented">
            <button type="button" className={type === 'linear' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setType('linear')}>{t.linear}</button>
            <button type="button" className={type === 'radial' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setType('radial')}>{t.radial}</button>
          </div>
        </div>
        {type === 'linear' && (
          <div className="tool-field">
            <span className="tool-field-label">{t.angle}: {angle}°</span>
            <input type="range" min="0" max="360" value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
          </div>
        )}
      </div>

      <div className="gg-stops">
        <span className="tool-field-label">{t.stops}</span>
        {stops.map((s, i) => (
          <div key={i} className="gg-stop">
            <input type="color" value={s.color} onChange={(e) => updateStop(i, { color: e.target.value })} />
            <input type="text" className="gg-stop-hex" value={s.color} spellCheck={false} onChange={(e) => updateStop(i, { color: e.target.value })} />
            <input type="range" min="0" max="100" value={s.pos} onChange={(e) => updateStop(i, { pos: Number(e.target.value) })} />
            <span className="gg-stop-pos">{s.pos}%</span>
            {stops.length > 2 && <button type="button" className="tool-btn small ghost" onClick={() => removeStop(i)}>✕</button>}
          </div>
        ))}
        {stops.length < 5 && <button type="button" className="tool-btn small" onClick={addStop}>{t.add}</button>}
      </div>

      <code className="gg-css">background: {css};</code>

      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
        <button type="button" className="tool-btn" onClick={randomize}>🎲 {t.random}</button>
      </div>

      <p className="tool-local-note">✨ {t.hint}</p>
    </div>
  );
}

export default GradientGenerator;
