import { useMemo, useState } from 'react';

// Цветовые схемы (круг Иттена): по базовому цвету строит гармоничные сочетания
// вращением тона в HSL. Локально, копирование HEX в клик.

const TEXT = {
  ru: {
    base: 'Базовый цвет', scheme: 'Схема', copy: 'Копировать все', copied: 'Скопировано',
    hint: 'Схемы строятся вращением тона по цветовому кругу — как в круге Иттена.',
    schemes: {
      complementary: 'Комплементарная', analogous: 'Аналоговая', triadic: 'Триада',
      tetradic: 'Тетрада', split: 'Сплит-комплементарная', mono: 'Монохромная',
    },
  },
  en: {
    base: 'Base color', scheme: 'Scheme', copy: 'Copy all', copied: 'Copied',
    hint: 'Schemes are built by rotating hue around the color wheel — like Itten’s wheel.',
    schemes: {
      complementary: 'Complementary', analogous: 'Analogous', triadic: 'Triadic',
      tetradic: 'Tetradic', split: 'Split-complementary', mono: 'Monochromatic',
    },
  },
};

function normalizeHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}
function hexToHsl(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let hue = 0; let s = 0; const l = (max + min) / 2; const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  return { h: hue, s: s * 100, l: l * 100 };
}
function hslToHex({ h, s, l }) {
  const sn = s / 100; const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0; let g = 0; let b = 0;
  const hh = ((h % 360) + 360) % 360;
  if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; } else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function buildScheme(base, scheme) {
  const { h, s, l } = base;
  const rot = (deg) => hslToHex({ h: h + deg, s, l });
  switch (scheme) {
    case 'complementary': return [hslToHex(base), rot(180)];
    case 'analogous': return [rot(-30), hslToHex(base), rot(30)];
    case 'triadic': return [hslToHex(base), rot(120), rot(240)];
    case 'tetradic': return [hslToHex(base), rot(90), rot(180), rot(270)];
    case 'split': return [hslToHex(base), rot(150), rot(210)];
    case 'mono': return [
      hslToHex({ h, s, l: Math.max(12, l - 30) }),
      hslToHex({ h, s, l: Math.max(20, l - 15) }),
      hslToHex(base),
      hslToHex({ h, s, l: Math.min(92, l + 15) }),
      hslToHex({ h, s, l: Math.min(96, l + 30) }),
    ];
    default: return [hslToHex(base)];
  }
}

function ColorHarmony({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [raw, setRaw] = useState('#6166ff');
  const [scheme, setScheme] = useState('complementary');
  const [copied, setCopied] = useState('');

  const hex = normalizeHex(raw);
  const colors = useMemo(() => (hex ? buildScheme(hexToHsl(hex), scheme) : []), [hex, scheme]);

  function copyOne(c) {
    if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => { setCopied(c); setTimeout(() => setCopied(''), 1200); }).catch(() => {});
  }
  function copyAll() {
    if (navigator.clipboard && colors.length) navigator.clipboard.writeText(colors.join(', ')).then(() => { setCopied('all'); setTimeout(() => setCopied(''), 1400); }).catch(() => {});
  }

  return (
    <div className="tool-panel color-harmony">
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.base}</span>
          <div className="cc-color-row">
            <input type="color" value={hex || '#000000'} onChange={(e) => setRaw(e.target.value)} />
            <input type="text" value={raw} spellCheck={false} onChange={(e) => setRaw(e.target.value)} />
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.scheme}</span>
          <select className="cb-select" value={scheme} onChange={(e) => setScheme(e.target.value)}>
            {Object.entries(t.schemes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="ch-swatches">
        {colors.map((c, i) => (
          <button key={`${c}-${i}`} type="button" className="ch-swatch" onClick={() => copyOne(c)}>
            <span className="ch-swatch-color" style={{ background: c }} />
            <span className="ch-swatch-hex">{copied === c ? `✓` : c.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {colors.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={copyAll}>{copied === 'all' ? `✓ ${t.copied}` : t.copy}</button>
        </div>
      )}

      <p className="tool-local-note">🎨 {t.hint}</p>
    </div>
  );
}

export default ColorHarmony;
