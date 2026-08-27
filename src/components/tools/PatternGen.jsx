import { useMemo, useState } from 'react';

// Генератор бесшовных SVG-паттернов: точки, сетка, полоски, клетка, кресты,
// волны, треугольники. Цвета, масштаб плитки, толщина. Предпросмотр, экспорт
// SVG и CSS (data-uri фон) в клик. Локально.

const TYPES = {
  dots: { ru: 'Точки', en: 'Dots' }, grid: { ru: 'Сетка', en: 'Grid' }, stripes: { ru: 'Полоски', en: 'Stripes' },
  checkers: { ru: 'Клетка', en: 'Checkers' }, cross: { ru: 'Кресты', en: 'Crosses' }, waves: { ru: 'Волны', en: 'Waves' }, triangles: { ru: 'Треугольники', en: 'Triangles' },
};

const TEXT = {
  ru: { type: 'Узор', fg: 'Цвет узора', bg: 'Фон', scale: 'Масштаб', weight: 'Толщина', copy: 'Копировать CSS', copied: 'Скопировано', save: 'Скачать SVG', note: 'Бесшовный узор для фонов. Вектор — масштабируется без потерь.' },
  en: { type: 'Pattern', fg: 'Pattern color', bg: 'Background', scale: 'Scale', weight: 'Thickness', copy: 'Copy CSS', copied: 'Copied', save: 'Download SVG', note: 'A seamless background pattern. Vector — scales losslessly.' },
};

function tile(type, n, fg, w) {
  const h = n / 2;
  switch (type) {
    case 'dots': return `<circle cx="${h}" cy="${h}" r="${w}" fill="${fg}"/>`;
    case 'grid': return `<path d="M0 0H${n}M0 0V${n}" stroke="${fg}" stroke-width="${w}" fill="none"/>`;
    case 'stripes': return `<path d="M-${n} ${n}L${n} -${n}M0 ${n * 2}L${n * 2} 0" stroke="${fg}" stroke-width="${w * 2}"/>`;
    case 'checkers': return `<rect width="${h}" height="${h}" fill="${fg}"/><rect x="${h}" y="${h}" width="${h}" height="${h}" fill="${fg}"/>`;
    case 'cross': return `<path d="M${h} ${h - w * 2}V${h + w * 2}M${h - w * 2} ${h}H${h + w * 2}" stroke="${fg}" stroke-width="${w}"/>`;
    case 'waves': return `<path d="M0 ${h} Q ${n / 4} 0, ${h} ${h} T ${n} ${h}" stroke="${fg}" stroke-width="${w}" fill="none"/>`;
    case 'triangles': return `<path d="M${h} ${w} L${n - w} ${n - w} L${w} ${n - w} Z" fill="${fg}"/>`;
    default: return '';
  }
}

function PatternGen({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [type, setType] = useState('dots');
  const [fg, setFg] = useState('#6166ff');
  const [bg, setBg] = useState('#0d0d11');
  const [scale, setScale] = useState(28);
  const [weight, setWeight] = useState(3);
  const [copied, setCopied] = useState(false);

  const svg = useMemo(() => `<svg xmlns="http://www.w3.org/2000/svg" width="${scale}" height="${scale}" viewBox="0 0 ${scale} ${scale}"><rect width="${scale}" height="${scale}" fill="${bg}"/>${tile(type, scale, fg, weight)}</svg>`, [type, fg, bg, scale, weight]);
  const dataUri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const css = `background-color: ${bg};\nbackground-image: ${dataUri};`;

  function copy() { navigator.clipboard?.writeText(css).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }
  function save() { const b = new Blob([svg], { type: 'image/svg+xml' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `pattern-${type}.svg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

  return (
    <div className="tool-panel patterngen">
      <div className="iso-layout">
        <div className="iso-stage" style={{ backgroundColor: bg, backgroundImage: dataUri, minHeight: 340 }} />
        <div className="iso-controls">
          <div className="tool-field">
            <span className="tool-field-label">{t.type}</span>
            <div className="gm-sets">
              {Object.entries(TYPES).map(([k, v]) => <button key={k} type="button" className={type === k ? 'crop-ratio is-active' : 'crop-ratio'} onClick={() => setType(k)}>{v[language] || v.ru}</button>)}
            </div>
          </div>
          <div className="t3-row">
            <label className="t3-color"><span className="tool-field-label">{t.fg}</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></label>
            <label className="t3-color"><span className="tool-field-label">{t.bg}</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
          </div>
          <label className="tool-field"><span className="tool-field-label">{t.scale}: {scale}px</span><input type="range" min="10" max="80" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
          <label className="tool-field"><span className="tool-field-label">{t.weight}: {weight}px</span><input type="range" min="1" max="12" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></label>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
            <button type="button" className="tool-btn" onClick={save}>{t.save}</button>
          </div>
        </div>
      </div>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default PatternGen;
