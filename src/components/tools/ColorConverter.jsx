import { useMemo, useState } from 'react';

// Конвертер цветовых моделей. HEX как источник истины; RGB/HSL/CMYK считаются
// от него. CMYK — приблизительный (без ICC-профиля точного соответствия нет).

const TEXT = {
  ru: {
    pick: 'Выберите цвет',
    hex: 'HEX',
    copied: 'Скопировано',
    copy: 'Копировать',
    cmykNote: 'CMYK приблизительный — для печати нужен ICC-профиль.',
    invalid: 'Неверный HEX',
  },
  en: {
    pick: 'Pick a color',
    hex: 'HEX',
    copied: 'Copied',
    copy: 'Copy',
    cmykNote: 'CMYK is approximate — real printing needs an ICC profile.',
    invalid: 'Invalid HEX',
  },
};

function normalizeHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return `#${h.toLowerCase()}`;
  }
  return null;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
  let h = 0; let s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function rgbToCmyk({ r, g, b }) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return {
    c: Math.round(c * 100), m: Math.round(m * 100), y: Math.round(y * 100), k: Math.round(k * 100),
  };
}

function ColorConverter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [raw, setRaw] = useState('#6166ff');
  const [copied, setCopied] = useState('');

  const hex = normalizeHex(raw);
  const values = useMemo(() => {
    if (!hex) return null;
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb);
    const cmyk = rgbToCmyk(rgb);
    return {
      HEX: hex.toUpperCase(),
      RGB: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      HSL: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      CMYK: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
    };
  }, [hex]);

  function copy(label, value) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(label);
        setTimeout(() => setCopied(''), 1400);
      }).catch(() => {});
    }
  }

  return (
    <div className="tool-panel color-converter">
      <div className="color-top">
        <label className="color-swatch-wrap" aria-label={t.pick}>
          <span className="color-swatch" style={{ background: hex || '#000' }} />
          <input
            type="color"
            value={hex || '#000000'}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
        <div className="color-hex-input">
          <span className="tool-field-label">{t.hex}</span>
          <input
            type="text"
            value={raw}
            spellCheck={false}
            onChange={(e) => setRaw(e.target.value)}
            className={hex ? '' : 'is-invalid'}
            placeholder="#6166ff"
          />
          {!hex && <span className="color-invalid">{t.invalid}</span>}
        </div>
      </div>

      {values && (
        <ul className="color-values">
          {Object.entries(values).map(([label, value]) => (
            <li key={label} className="color-value-row">
              <span className="color-value-label">{label}</span>
              <code className="color-value-code">{value}</code>
              <button type="button" className="tool-btn small" onClick={() => copy(label, value)}>
                {copied === label ? `✓ ${t.copied}` : t.copy}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="tool-local-note">ℹ️ {t.cmykNote}</p>
    </div>
  );
}

export default ColorConverter;
