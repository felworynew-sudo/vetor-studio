import { useMemo, useState } from 'react';

// Калькулятор пастельных/тёмных пар: по базовому цвету подбирает контрастный
// цвет текста и мягкую/тёмную пару для UI-элементов. Локально.

const TEXT = {
  ru: {
    base: 'Базовый цвет', onLight: 'На светлом фоне', onDark: 'На тёмном фоне',
    text: 'Текст', pastel: 'Пастельная пара', dark: 'Тёмная пара', copied: 'Скопировано',
    sample: 'Кнопка', hint: 'Цвет текста выбирается по яркости фона для контраста.',
  },
  en: {
    base: 'Base color', onLight: 'On light', onDark: 'On dark',
    text: 'Text', pastel: 'Pastel pair', dark: 'Dark pair', copied: 'Copied',
    sample: 'Button', hint: 'Text color is picked by background luminance for contrast.',
  },
};

function normHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}
function toRgb(hex) { const h = hex.replace('#', ''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; }
function luminance({ r, g, b }) {
  const a = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function bestText(hex) { return luminance(toRgb(hex)) > 0.4 ? '#0d0d11' : '#ffffff'; }
function toHsl({ r, g, b }) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn); let h = 0; let s = 0; const l = (max + min) / 2; const d = max - min;
  if (d) { s = l > 0.5 ? d / (2 - max - min) : d / (max + min); if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0); else if (max === gn) h = (bn - rn) / d + 2; else h = (rn - gn) / d + 4; h *= 60; }
  return { h, s: s * 100, l: l * 100 };
}
function hslHex({ h, s, l }) {
  const sn = s / 100; const ln = l / 100; const c = (1 - Math.abs(2 * ln - 1)) * sn; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = ln - c / 2;
  let r = 0; let g = 0; let b = 0; const hh = ((h % 360) + 360) % 360;
  if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; } else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function Swatch({ bg, label, sublabel, onCopy, copied }) {
  return (
    <button type="button" className="pp-card" style={{ background: bg, color: bestText(bg) }} onClick={onCopy}>
      <span className="pp-card-label">{label}</span>
      <span className="pp-card-hex">{copied ? '✓' : bg.toUpperCase()}</span>
      <span className="pp-card-sub">{sublabel}</span>
    </button>
  );
}

function PastelPairs({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [raw, setRaw] = useState('#6166ff');
  const [copied, setCopied] = useState('');
  const hex = normHex(raw);

  const pair = useMemo(() => {
    if (!hex) return null;
    const hsl = toHsl(toRgb(hex));
    return {
      text: bestText(hex),
      pastel: hslHex({ h: hsl.h, s: Math.max(25, hsl.s * 0.5), l: 90 }),
      dark: hslHex({ h: hsl.h, s: Math.min(90, hsl.s * 1.05), l: 20 }),
    };
  }, [hex]);

  function copy(v) { if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => { setCopied(v); setTimeout(() => setCopied(''), 1200); }).catch(() => {}); }

  return (
    <div className="tool-panel pastel-pairs">
      <div className="tool-field">
        <span className="tool-field-label">{t.base}</span>
        <div className="cc-color-row">
          <input type="color" value={hex || '#000000'} onChange={(e) => setRaw(e.target.value)} />
          <input type="text" value={raw} spellCheck={false} onChange={(e) => setRaw(e.target.value)} />
        </div>
      </div>

      {pair && (
        <>
          <div className="pp-cards">
            <Swatch bg={hex} label={t.base} sublabel={`${t.text}: ${pair.text === '#0d0d11' ? '⬛' : '⬜'}`} onCopy={() => copy(hex)} copied={copied === hex} />
            <Swatch bg={pair.pastel} label={t.pastel} sublabel="" onCopy={() => copy(pair.pastel)} copied={copied === pair.pastel} />
            <Swatch bg={pair.dark} label={t.dark} sublabel="" onCopy={() => copy(pair.dark)} copied={copied === pair.dark} />
          </div>

          <div className="pp-previews">
            <div className="pp-preview" style={{ background: '#f5f7fb' }}>
              <span className="pp-preview-cap" style={{ color: '#333' }}>{t.onLight}</span>
              <span className="pp-btn" style={{ background: hex, color: pair.text }}>{t.sample}</span>
            </div>
            <div className="pp-preview" style={{ background: '#0d0d11' }}>
              <span className="pp-preview-cap" style={{ color: '#aaa' }}>{t.onDark}</span>
              <span className="pp-btn" style={{ background: pair.pastel, color: bestText(pair.pastel) }}>{t.sample}</span>
            </div>
          </div>
        </>
      )}

      <p className="tool-local-note">🎨 {t.hint}</p>
    </div>
  );
}

export default PastelPairs;
