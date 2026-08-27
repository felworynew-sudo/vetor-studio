import { useState } from 'react';

// Генератор CSS box-shadow: несколько слоёв тени с настройкой смещения, размытия,
// разброса, цвета и inset. Живой предпросмотр + готовый CSS в клик. Локально.

let uid = 0;
const newLayer = () => ({ id: uid += 1, x: 0, y: 10, blur: 25, spread: -5, color: '#6166ff', alpha: 40, inset: false });

const TEXT = {
  ru: { add: 'Добавить слой', x: 'X', y: 'Y', blur: 'Размытие', spread: 'Разброс', color: 'Цвет', alpha: 'Прозрачность', inset: 'Внутрь', copy: 'Копировать CSS', copied: 'Скопировано', el: 'Цвет фигуры', bg: 'Фон', note: 'Живой предпросмотр — крутите ползунки, забирайте готовый CSS.' },
  en: { add: 'Add layer', x: 'X', y: 'Y', blur: 'Blur', spread: 'Spread', color: 'Color', alpha: 'Opacity', inset: 'Inset', copy: 'Copy CSS', copied: 'Copied', el: 'Shape color', bg: 'Background', note: 'Live preview — drag the sliders and grab the CSS.' },
};

function hexA(hex, a) {
  const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16); const g = parseInt(h.slice(2, 4), 16); const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${(a / 100).toFixed(2)})`;
}

function BoxShadow({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [layers, setLayers] = useState([newLayer()]);
  const [elColor, setElColor] = useState('#161821');
  const [bg, setBg] = useState('#0d0d11');
  const [copied, setCopied] = useState(false);

  const setL = (id, k, v) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  const css = layers.map((l) => `${l.inset ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${hexA(l.color, l.alpha)}`).join(', ');

  function copy() {
    navigator.clipboard?.writeText(`box-shadow: ${css};`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  }

  return (
    <div className="tool-panel boxshadow">
      <div className="iso-layout">
        <div className="iso-stage bs-stage" style={{ background: bg }}>
          <div className="bs-box" style={{ background: elColor, boxShadow: css }} />
        </div>
        <div className="iso-controls">
          <div className="t3-row">
            <label className="t3-color"><span className="tool-field-label">{t.el}</span><input type="color" value={elColor} onChange={(e) => setElColor(e.target.value)} /></label>
            <label className="t3-color"><span className="tool-field-label">{t.bg}</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
          </div>
          {layers.map((l, i) => (
            <div key={l.id} className="bs-layer">
              <div className="bs-layer-head">
                <span>#{i + 1}</span>
                <label className="rec-opt"><input type="checkbox" checked={l.inset} onChange={(e) => setL(l.id, 'inset', e.target.checked)} /> {t.inset}</label>
                <input type="color" value={l.color} onChange={(e) => setL(l.id, 'color', e.target.value)} />
                {layers.length > 1 && <button type="button" className="tool-btn small ghost" onClick={() => setLayers((ls) => ls.filter((x) => x.id !== l.id))}>✕</button>}
              </div>
              <div className="bs-sliders">
                {[['x', -50, 50], ['y', -50, 50], ['blur', 0, 100], ['spread', -50, 50], ['alpha', 0, 100]].map(([k, mn, mx]) => (
                  <label key={k} className="bs-mini"><span>{t[k]} {l[k]}</span><input type="range" min={mn} max={mx} value={l[k]} onChange={(e) => setL(l.id, k, Number(e.target.value))} /></label>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="tool-btn" onClick={() => setLayers((ls) => [...ls, newLayer()])}>+ {t.add}</button>
        </div>
      </div>
      <pre className="bs-code"><code>box-shadow: {css};</code></pre>
      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
      </div>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default BoxShadow;
