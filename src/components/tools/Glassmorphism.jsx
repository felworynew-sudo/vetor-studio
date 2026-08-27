import { useState } from 'react';

// Генератор glassmorphism («матовое стекло»): backdrop-blur, прозрачность,
// насыщенность, граница и радиус. Живой предпросмотр на цветном фоне + CSS в клик.

const TEXT = {
  ru: { blur: 'Размытие', alpha: 'Прозрачность', sat: 'Насыщенность', radius: 'Скругление', border: 'Граница', tint: 'Оттенок стекла', bg: 'Фон-градиент', copy: 'Копировать CSS', copied: 'Скопировано', note: 'Стекло работает поверх пёстрого фона. Живой предпросмотр + готовый CSS.' },
  en: { blur: 'Blur', alpha: 'Opacity', sat: 'Saturation', radius: 'Radius', border: 'Border', tint: 'Glass tint', bg: 'Gradient bg', copy: 'Copy CSS', copied: 'Copied', note: 'Glass sits over a busy background. Live preview + ready CSS.' },
};

function Glassmorphism({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [blur, setBlur] = useState(14);
  const [alpha, setAlpha] = useState(18);
  const [sat, setSat] = useState(160);
  const [radius, setRadius] = useState(16);
  const [border, setBorder] = useState(20);
  const [tint, setTint] = useState('#ffffff');
  const [c1, setC1] = useState('#6166ff');
  const [c2, setC2] = useState('#ff5c63');
  const [copied, setCopied] = useState(false);

  const rgbaTint = (a) => { const h = tint.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };
  const glass = {
    background: rgbaTint((alpha / 100).toFixed(2)),
    backdropFilter: `blur(${blur}px) saturate(${sat}%)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(${sat}%)`,
    borderRadius: `${radius}px`,
    border: `1px solid rgba(255,255,255,${(border / 100).toFixed(2)})`,
  };
  const css = `background: ${rgbaTint((alpha / 100).toFixed(2))};\nbackdrop-filter: blur(${blur}px) saturate(${sat}%);\n-webkit-backdrop-filter: blur(${blur}px) saturate(${sat}%);\nborder-radius: ${radius}px;\nborder: 1px solid rgba(255,255,255,${(border / 100).toFixed(2)});`;

  function copy() { navigator.clipboard?.writeText(css).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }

  return (
    <div className="tool-panel glassmo">
      <div className="iso-layout">
        <div className="iso-stage gl-stage" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
          <span className="gl-blob" style={{ background: c2 }} />
          <span className="gl-blob gl-blob2" style={{ background: c1 }} />
          <div className="gl-card" style={glass} />
        </div>
        <div className="iso-controls">
          {[['blur', blur, setBlur, 0, 40], ['alpha', alpha, setAlpha, 0, 90], ['sat', sat, setSat, 100, 250], ['radius', radius, setRadius, 0, 40], ['border', border, setBorder, 0, 90]].map(([k, v, set, mn, mx]) => (
            <label key={k} className="tool-field"><span className="tool-field-label">{t[k]}: {v}</span><input type="range" min={mn} max={mx} value={v} onChange={(e) => set(Number(e.target.value))} /></label>
          ))}
          <div className="t3-row">
            <label className="t3-color"><span className="tool-field-label">{t.tint}</span><input type="color" value={tint} onChange={(e) => setTint(e.target.value)} /></label>
            <label className="t3-color"><span className="tool-field-label">{t.bg} 1</span><input type="color" value={c1} onChange={(e) => setC1(e.target.value)} /></label>
            <label className="t3-color"><span className="tool-field-label">{t.bg} 2</span><input type="color" value={c2} onChange={(e) => setC2(e.target.value)} /></label>
          </div>
        </div>
      </div>
      <pre className="bs-code"><code>{css}</code></pre>
      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
      </div>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Glassmorphism;
