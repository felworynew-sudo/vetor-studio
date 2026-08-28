import { useMemo, useState } from 'react';

// Конвертер цветовых моделей. Ввод в любом формате (HEX/RGB/HSL) → внутренне
// приводим к HEX, от него считаем остальные. CMYK приблизительный (без ICC).

const TEXT = {
  ru: {
    pick: 'Выберите цвет',
    inputAs: 'Ввод',
    copied: 'Скопировано',
    copy: 'Копировать',
    cmykNote: 'CMYK приблизительный — для печати нужен ICC-профиль.',
    invalid: 'Неверное значение',
  },
  en: {
    pick: 'Pick a color',
    inputAs: 'Input',
    copied: 'Copied',
    copy: 'Copy',
    cmykNote: 'CMYK is approximate — real printing needs an ICC profile.',
    invalid: 'Invalid value',
  },
};

const PLACEHOLDER = { hex: '#6166ff', rgb: 'rgb(97, 102, 255)', hsl: 'hsl(238, 100%, 69%)' };

function normalizeHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `#${h.toLowerCase()}`;
  return null;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const clamp = (v, hi) => Math.max(0, Math.min(hi, v));

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 255).toString(16).padStart(2, '0')).join('')}`;
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

function hslToRgb({ h, s, l }) {
  const hn = (h % 360) / 360; const sn = clamp(s, 100) / 100; const ln = clamp(l, 100) / 100;
  if (sn === 0) { const v = Math.round(ln * 255); return { r: v, g: v, b: v }; }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue = (tt) => {
    let x = tt; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: Math.round(hue(hn + 1 / 3) * 255), g: Math.round(hue(hn) * 255), b: Math.round(hue(hn - 1 / 3) * 255) };
}

function rgbToCmyk({ r, g, b }) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - rn - k) / (1 - k); const m = (1 - gn - k) / (1 - k); const y = (1 - bn - k) / (1 - k);
  return { c: Math.round(c * 100), m: Math.round(m * 100), y: Math.round(y * 100), k: Math.round(k * 100) };
}

// Разбор введённого текста в HEX согласно выбранному формату. null — если невалидно.
function parseToHex(text, mode) {
  if (mode === 'hex') return normalizeHex(text);
  const nums = String(text).match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const [a, b, c] = nums.map(Number);
  if (mode === 'rgb') {
    if ([a, b, c].some((v) => v < 0 || v > 255)) return null;
    return rgbToHex({ r: a, g: b, b: c });
  }
  if (mode === 'hsl') {
    if (a < 0 || a > 360 || b < 0 || b > 100 || c < 0 || c > 100) return null;
    return rgbToHex(hslToRgb({ h: a, s: b, l: c }));
  }
  return null;
}

// Каноничный текст цвета в заданном формате (для переключения режима/пипетки).
function hexToText(hex, mode) {
  if (mode === 'hex') return hex.toUpperCase();
  const rgb = hexToRgb(hex);
  if (mode === 'rgb') return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const hsl = rgbToHsl(rgb);
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

function ColorConverter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [mode, setMode] = useState('hex');
  const [raw, setRaw] = useState('#6166ff');
  const [copied, setCopied] = useState('');

  const hex = parseToHex(raw, mode);
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

  function switchMode(m) {
    if (hex) setRaw(hexToText(hex, m));
    setMode(m);
  }

  function pickColor(newHex) {
    setRaw(hexToText(newHex, mode));
  }

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
          <input type="color" value={hex || '#000000'} onChange={(e) => pickColor(e.target.value)} />
        </label>
        <div className="color-hex-input">
          <span className="tool-field-label">{t.inputAs}</span>
          <div className="segmented cc-modes">
            {['hex', 'rgb', 'hsl'].map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? 'segmented-btn is-active' : 'segmented-btn'}
                onClick={() => switchMode(m)}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={raw}
            spellCheck={false}
            onChange={(e) => setRaw(e.target.value)}
            className={hex ? '' : 'is-invalid'}
            placeholder={PLACEHOLDER[mode]}
            aria-label={`${t.inputAs} ${mode.toUpperCase()}`}
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
