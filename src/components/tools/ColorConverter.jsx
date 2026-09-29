import { useEffect, useMemo, useState } from 'react';

// Конвертер цветовых моделей на Color.js (MIT, авторы CSS Color 4/5): принимает
// любой CSS-цвет — HEX, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(),
// color(display-p3 …), имена — и переводит во все пространства. Проверяет, влезает
// ли цвет в sRGB / Display-P3 / Rec.2020, и даёт ближайший безопасный вариант
// (gamut mapping по CSS Color 4). CMYK — наивная формула без ICC.

const TEXT = {
  ru: {
    pick: 'Выберите цвет', input: 'Любой CSS-цвет', copied: 'Скопировано', copy: 'Копировать', invalid: 'Не удалось разобрать цвет',
    gamut: 'Гамут', inG: 'влезает', outG: 'не влезает', clipped: 'Ближайший цвет в sRGB', examples: 'Примеры',
    cmykNote: 'CMYK приблизительный — для печати нужен ICC-профиль типографии.',
    wideNote: 'Цвет вне sRGB: на обычных мониторах он будет показан приглушённее. В CSS можно задать oklch() или color(display-p3) с фолбэком на HEX.',
  },
  en: {
    pick: 'Pick a color', input: 'Any CSS color', copied: 'Copied', copy: 'Copy', invalid: 'Could not parse the color',
    gamut: 'Gamut', inG: 'fits', outG: 'out of gamut', clipped: 'Closest sRGB color', examples: 'Examples',
    cmykNote: 'CMYK is approximate — real printing needs the print shop’s ICC profile.',
    wideNote: 'The color is outside sRGB: regular monitors show it duller. In CSS use oklch() or color(display-p3) with a HEX fallback.',
  },
};

const EXAMPLES = ['#6166ff', 'oklch(70% 0.25 150)', 'color(display-p3 1 0 0.5)', 'hsl(24 90% 55%)', 'lab(60 40 -60)', 'rebeccapurple'];

let ColorLib = null;
function useColorLib() {
  const [ready, setReady] = useState(!!ColorLib);
  useEffect(() => {
    if (ColorLib) return;
    import('colorjs.io').then((m) => { ColorLib = m.default; setReady(true); });
  }, []);
  return ready ? ColorLib : null;
}

const r1 = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : 0);

function ColorConverter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const Color = useColorLib();
  const [raw, setRaw] = useState('#6166ff');
  const [copied, setCopied] = useState('');

  const parsed = useMemo(() => {
    if (!Color) return null;
    try { return new Color(raw.trim()); } catch { return null; }
  }, [Color, raw]);

  const info = useMemo(() => {
    if (!parsed) return null;
    const srgb = parsed.to('srgb');
    const inSrgb = srgb.inGamut();
    const safe = inSrgb ? srgb : srgb.clone().toGamut({ space: 'srgb', method: 'css' });
    const hex = safe.toString({ format: 'hex' });
    const [R, G, B] = safe.coords.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
    const k = 1 - Math.max(R, G, B) / 255;
    const cmyk = k === 1 ? [0, 0, 0, 100] : [R, G, B].map((v) => Math.round(((1 - v / 255 - k) / (1 - k)) * 100)).concat(Math.round(k * 100));
    const ok = parsed.to('oklch');
    const values = {
      HEX: hex.toUpperCase(),
      RGB: `rgb(${R} ${G} ${B})`,
      HSL: safe.to('hsl').toString({ precision: 3 }),
      HWB: safe.to('hwb').toString({ precision: 3 }),
      OKLCH: `oklch(${r1(ok.coords[0] * 100, 1)}% ${r1(ok.coords[1], 3)} ${r1(ok.coords[2] || 0, 1)})`,
      OKLab: parsed.to('oklab').toString({ precision: 4 }),
      'CIE Lab': parsed.to('lab').toString({ precision: 4 }),
      'CIE LCH': parsed.to('lch').toString({ precision: 4 }),
      'Display-P3': parsed.to('p3').toString({ precision: 4 }),
      'Rec. 2020': parsed.to('rec2020').toString({ precision: 4 }),
      CMYK: `cmyk(${cmyk[0]}%, ${cmyk[1]}%, ${cmyk[2]}%, ${cmyk[3]}%)`,
      'CSS var': `--color: ${hex};`,
    };
    return {
      values, hex, inSrgb,
      inP3: parsed.to('p3').inGamut(), inRec: parsed.to('rec2020').inGamut(),
      display: parsed.display().toString(),
    };
  }, [parsed]);

  function copy(label, value) {
    navigator.clipboard?.writeText(value).then(() => { setCopied(label); setTimeout(() => setCopied(''), 1400); }).catch(() => {});
  }

  return (
    <div className="tool-panel color-converter">
      <div className="color-top">
        <label className="color-swatch-wrap" aria-label={t.pick}>
          <span className="color-swatch" style={{ background: info ? info.display : '#000' }} />
          <input type="color" value={info ? info.hex.slice(0, 7) : '#000000'} onChange={(e) => setRaw(e.target.value)} />
        </label>
        <div className="color-hex-input">
          <span className="tool-field-label">{t.input}</span>
          <input type="text" value={raw} spellCheck={false} onChange={(e) => setRaw(e.target.value)} className={parsed || !Color ? '' : 'is-invalid'} aria-label={t.input} />
          {Color && !parsed && <span className="color-invalid">{t.invalid}</span>}
          <div className="cv-examples">
            <span>{t.examples}:</span>
            {EXAMPLES.map((ex) => <button key={ex} type="button" className="mg-chip" onClick={() => setRaw(ex)}>{ex}</button>)}
          </div>
        </div>
      </div>

      {info && (
        <>
          <div className="cv-gamut">
            <span className="tool-field-label">{t.gamut}:</span>
            {[['sRGB', info.inSrgb], ['Display-P3', info.inP3], ['Rec. 2020', info.inRec]].map(([n, ok]) => (
              <span key={n} className={ok ? 'cc-badge ok' : 'cc-badge fail'}>{n}: {ok ? '✓' : '✕'} <em>{ok ? t.inG : t.outG}</em></span>
            ))}
          </div>
          {!info.inSrgb && (
            <p className="tool-local-note aid-warn">⚠️ {t.wideNote} {t.clipped}: <b>{info.hex.toUpperCase()}</b></p>
          )}
          <ul className="color-values">
            {Object.entries(info.values).map(([label, value]) => (
              <li key={label} className="color-value-row">
                <span className="color-value-label">{label}</span>
                <code className="color-value-code">{value}</code>
                <button type="button" className="tool-btn small" onClick={() => copy(label, value)}>
                  {copied === label ? `✓ ${t.copied}` : t.copy}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="tool-local-note">ℹ️ {t.cmykNote}</p>
    </div>
  );
}

export default ColorConverter;
