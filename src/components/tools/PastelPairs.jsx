import { useMemo, useState } from 'react';
import { fixColor, wcag } from '../../utils/contrast';
import { hexToRgb, oklabToOklch, oklchToRgbClamped, rgbToHex, rgbToOklab } from '../../utils/oklab';

// Калькулятор пастельных/тёмных пар: по базовому цвету строит мягкую (пастель) и
// тёмную пару в OKLCH (тон сохраняется точно) и подбирает к каждой фону цвет текста
// по реальному контрасту WCAG — не по порогу яркости. Текст на паре — того же тона,
// затемнённый/осветлённый ровно до AA. Локально.

const TEXT = {
  ru: {
    base: 'Базовый цвет', onLight: 'На светлом фоне', onDark: 'На тёмном фоне',
    text: 'Текст', pastel: 'Пастельная пара', dark: 'Тёмная пара', copied: 'Скопировано',
    sample: 'Кнопка', hint: 'Текст подбирается по контрасту WCAG ≥ 4.5:1. На пастельной и тёмной паре — текст того же тона (как в бейджах и тегах).',
  },
  en: {
    base: 'Base color', onLight: 'On light', onDark: 'On dark',
    text: 'Text', pastel: 'Pastel pair', dark: 'Dark pair', copied: 'Copied',
    sample: 'Button', hint: 'Text is chosen by WCAG contrast ≥ 4.5:1. On the pastel and dark pair the text keeps the same hue (like badges and tags).',
  },
};

function normHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}
// Чёрный или белый — что реально контрастнее к фону (а не порог яркости 0.4,
// который ошибается на средних тонах вроде оранжевого и бирюзового).
function bestText(hex) { return wcag('#0d0d11', hex) >= wcag('#ffffff', hex) ? '#0d0d11' : '#ffffff'; }

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
    const [, C, h] = oklabToOklch(...rgbToOklab(...hexToRgb(hex)));
    const pastel = rgbToHex(...oklchToRgbClamped(0.93, Math.min(C * 0.35, 0.06), h));
    const dark = rgbToHex(...oklchToRgbClamped(0.27, Math.min(C * 0.9, 0.12), h));
    return {
      text: bestText(hex),
      pastel,
      dark,
      onPastel: fixColor(hex, pastel, { target: 4.5 }).hex,
      onDark: fixColor(hex, dark, { target: 4.5 }).hex,
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
            <Swatch bg={hex} label={t.base} sublabel={`${t.text} ${pair.text.toUpperCase()} · ${wcag(pair.text, hex).toFixed(1)}:1`} onCopy={() => copy(hex)} copied={copied === hex} />
            <Swatch bg={pair.pastel} label={t.pastel} sublabel={`${t.text} ${pair.onPastel.toUpperCase()} · ${wcag(pair.onPastel, pair.pastel).toFixed(1)}:1`} onCopy={() => copy(pair.pastel)} copied={copied === pair.pastel} />
            <Swatch bg={pair.dark} label={t.dark} sublabel={`${t.text} ${pair.onDark.toUpperCase()} · ${wcag(pair.onDark, pair.dark).toFixed(1)}:1`} onCopy={() => copy(pair.dark)} copied={copied === pair.dark} />
          </div>

          <div className="pp-previews">
            <div className="pp-preview" style={{ background: '#f5f7fb' }}>
              <span className="pp-preview-cap" style={{ color: '#333' }}>{t.onLight}</span>
              <span className="pp-btn" style={{ background: hex, color: pair.text }}>{t.sample}</span>
            </div>
            <div className="pp-preview" style={{ background: '#0d0d11' }}>
              <span className="pp-preview-cap" style={{ color: '#aaa' }}>{t.onDark}</span>
              <span className="pp-btn" style={{ background: pair.pastel, color: pair.onPastel }}>{t.sample}</span>
              <span className="pp-btn" style={{ background: pair.dark, color: pair.onDark, outline: '1px solid rgba(255,255,255,0.15)' }}>{t.sample}</span>
            </div>
          </div>
        </>
      )}

      <p className="tool-local-note">🎨 {t.hint}</p>
    </div>
  );
}

export default PastelPairs;
