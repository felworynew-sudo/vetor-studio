import { useMemo, useState } from 'react';
import { hexToRgb, oklabToOklch, oklchToRgbClamped, rgbToHex, rgbToOklab } from '../../utils/oklab';
import { buildAse } from '../../utils/ase';

// Цветовые схемы (круг Иттена): по базовому цвету строит гармоничные сочетания
// вращением тона. По умолчанию — в OKLCH: светлота и насыщенность воспринимаются
// одинаковыми у всех цветов схемы (в HSL жёлтый «светлее» синего при тех же L/S),
// выход за sRGB аккуратно сжимается по хроме. HSL оставлен для сравнения.
// Для каждого цвета схемы строится шкала оттенков 50–950 (как в Tailwind) в OKLCH;
// экспорт — CSS-переменные, Tailwind (v3 и v4), JSON и .ase для Adobe/Figma-плагинов.

const TEXT = {
  ru: {
    base: 'Базовый цвет', scheme: 'Схема', copy: 'Копировать все', copied: 'Скопировано',
    hint: 'Схемы строятся вращением тона по цветовому кругу — как в круге Иттена. В режиме OKLCH все цвета схемы визуально одной светлоты и насыщенности.',
    space: 'Пространство', oklch: 'OKLCH (перцептивно)', hsl: 'HSL (классика)',
    shades: 'Шкала оттенков', shadesHint: 'Клик по плашке — скопировать. Рамкой отмечен исходный цвет схемы.',
    export: 'Экспорт', prefix: 'Имена', download: 'Скачать .ase', copyCode: 'Копировать код',
    names: ['primary', 'secondary', 'accent', 'highlight', 'extra'],
    schemes: {
      complementary: 'Комплементарная', analogous: 'Аналоговая', triadic: 'Триада',
      tetradic: 'Тетрада', split: 'Сплит-комплементарная', mono: 'Монохромная',
    },
  },
  en: {
    base: 'Base color', scheme: 'Scheme', copy: 'Copy all', copied: 'Copied',
    hint: 'Schemes are built by rotating hue around the color wheel — like Itten’s wheel. In OKLCH mode all colors look equally light and saturated.',
    space: 'Space', oklch: 'OKLCH (perceptual)', hsl: 'HSL (classic)',
    shades: 'Shade scale', shadesHint: 'Click a swatch to copy. The outlined one is the scheme color itself.',
    export: 'Export', prefix: 'Names', download: 'Download .ase', copyCode: 'Copy code',
    names: ['primary', 'secondary', 'accent', 'highlight', 'extra'],
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

// Та же схема в OKLCH: вращаем h, сохраняя L и C; моно — шаги по L.
function buildSchemeOk(hex, scheme) {
  const [L, C, h] = oklabToOklch(...rgbToOklab(...hexToRgb(hex)));
  const at = (dh, l = L, c = C) => rgbToHex(...oklchToRgbClamped(l, c, (((h + dh) % 360) + 360) % 360));
  switch (scheme) {
    case 'complementary': return [hex, at(180)];
    case 'analogous': return [at(-30), hex, at(30)];
    case 'triadic': return [hex, at(120), at(240)];
    case 'tetradic': return [hex, at(90), at(180), at(270)];
    case 'split': return [hex, at(150), at(210)];
    case 'mono': return [0.28, 0.42, null, 0.8, 0.92].map((l) => (l == null ? hex : at(0, l, C * (l > 0.85 ? 0.45 : 0.9))));
    default: return [hex];
  }
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

// Шкала 50–950 в OKLCH: светлота по фиксированной лестнице, хрома тише у краёв
// (очень светлые и очень тёмные оттенки не вылезают за гамут), тон — как у цвета.
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const STEP_L = [0.975, 0.94, 0.88, 0.8, 0.71, 0.62, 0.53, 0.45, 0.37, 0.29, 0.21];

function shadeScale(hex) {
  const [L, C, h] = oklabToOklch(...rgbToOklab(...hexToRgb(hex)));
  let baseIdx = 0; STEP_L.forEach((l, i) => { if (Math.abs(l - L) < Math.abs(STEP_L[baseIdx] - L)) baseIdx = i; });
  return STEPS.map((step, i) => {
    if (i === baseIdx) return { step, hex, base: true };
    const l = STEP_L[i];
    const k = 1 - Math.abs(l - 0.6) ** 1.6 * 1.6; // тише к краям
    return { step, hex: rgbToHex(...oklchToRgbClamped(l, C * Math.max(0.12, k), h)), base: false };
  });
}

function exportCode(fmt, rows) {
  if (fmt === 'css') {
    return `:root {\n${rows.map((r) => r.scale.map((s) => `  --${r.name}-${s.step}: ${s.hex};`).join('\n')).join('\n\n')}\n}`;
  }
  if (fmt === 'tw4') {
    return `@theme {\n${rows.map((r) => r.scale.map((s) => `  --color-${r.name}-${s.step}: ${s.hex};`).join('\n')).join('\n\n')}\n}`;
  }
  const obj = Object.fromEntries(rows.map((r) => [r.name, Object.fromEntries(r.scale.map((s) => [s.step, s.hex]))]));
  if (fmt === 'tw3') {
    const body = JSON.stringify(obj, null, 2).replace(/"(\d+)":/g, '$1:').replace(/"([a-z][\w-]*)":/g, (m, k) => (/^[a-z]\w*$/.test(k) ? `${k}:` : m)).replace(/"/g, "'");
    return `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: ${body.replace(/\n/g, '\n      ')},\n    },\n  },\n};`;
  }
  return JSON.stringify(obj, null, 2);
}

function ColorHarmony({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [raw, setRaw] = useState('#6166ff');
  const [scheme, setScheme] = useState('complementary');
  const [copied, setCopied] = useState('');
  const [space, setSpace] = useState('oklch');
  const [fmt, setFmt] = useState('css');

  const hex = normalizeHex(raw);
  const colors = useMemo(() => {
    if (!hex) return [];
    return space === 'oklch' ? buildSchemeOk(hex, scheme) : buildScheme(hexToHsl(hex), scheme);
  }, [hex, scheme, space]);

  // у монохромной схемы один тон — достаточно одной шкалы от базового цвета
  const rows = useMemo(() => (scheme === 'mono' ? [hex].filter(Boolean) : colors).map((c, i) => ({ name: t.names[i] || `color-${i + 1}`, hex: c, scale: shadeScale(c) })), [colors, scheme, hex, t.names]);
  const code = useMemo(() => exportCode(fmt, rows), [fmt, rows]);

  function downloadAse() {
    const groups = rows.map((r) => ({ name: r.name, colors: r.scale.map((s) => ({ name: `${r.name}-${s.step}`, hex: s.hex })) }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buildAse(groups)], { type: 'application/octet-stream' }));
    a.download = `palette-${scheme}.ase`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

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
        <div className="tool-field">
          <span className="tool-field-label">{t.space}</span>
          <div className="segmented">
            <button type="button" className={space === 'oklch' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSpace('oklch')}>{t.oklch}</button>
            <button type="button" className={space === 'hsl' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSpace('hsl')}>{t.hsl}</button>
          </div>
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

      {rows.length > 0 && (
        <>
          <span className="tool-field-label">{t.shades}</span>
          <div className="ch-scale">
            {rows.map((r) => (
              <div key={r.name} className="ch-scale-row">
                <span className="ch-scale-name">{r.name}</span>
                {r.scale.map((sh) => (
                  <button key={sh.step} type="button" className={sh.base ? 'ch-shade is-base' : 'ch-shade'} style={{ background: sh.hex, color: sh.step >= 500 ? '#fff' : '#111' }} title={`${r.name}-${sh.step} ${sh.hex}`} onClick={() => copyOne(sh.hex)}>
                    <span>{copied === sh.hex ? '✓' : sh.step}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="tool-local-note">{t.shadesHint}</p>

          <div className="code-export">
            <div className="code-export-head">
              <div className="segmented">
                {[['css', 'CSS'], ['tw4', 'Tailwind 4'], ['tw3', 'Tailwind 3'], ['json', 'JSON']].map(([k, l]) => (
                  <button key={k} type="button" className={fmt === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt(k)}>{l}</button>
                ))}
              </div>
              <button type="button" className="tool-btn primary small" onClick={() => copyOne(code)}>{copied === code ? `✓ ${t.copied}` : t.copyCode}</button>
              <button type="button" className="tool-btn small" onClick={downloadAse}>⬇ {t.download}</button>
            </div>
            <pre className="code-export-code"><code>{code}</code></pre>
          </div>
        </>
      )}

      <p className="tool-local-note">🎨 {t.hint}</p>
    </div>
  );
}

export default ColorHarmony;
