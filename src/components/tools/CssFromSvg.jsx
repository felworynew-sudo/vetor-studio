import { useRef, useState } from 'react';

// Экстрактор CSS из SVG: цвета (с прозрачностью и частотой), градиенты с учётом
// наследования href, userSpaceOnUse, gradientTransform и stop-opacity, блоки <style>,
// а также сам SVG как data-URI фон или маска. Локально через DOMParser.

const TEXT = {
  ru: {
    paste: 'Вставьте код SVG сюда…', upload: 'Загрузить .svg', extract: 'Извлечь',
    colors: 'Цвета', gradients: 'Градиенты', styles: 'Стили (<style>)', css: 'CSS-переменные',
    copy: 'Копировать', copied: 'Скопировано', empty: 'Вставьте SVG или загрузите файл',
    nothing: 'Стилей не найдено', invalid: 'Не похоже на корректный SVG',
    hint: 'Цвета — CSS-переменными (по частоте использования), градиенты — с настоящим углом, центром и прозрачностью, SVG — готовым фоном или маской для иконок в цвет текста.',
    bg: 'SVG как CSS-фон (data URI)', mask: 'SVG как маска (иконка цвета currentColor)',
  },
  en: {
    paste: 'Paste your SVG code here…', upload: 'Upload .svg', extract: 'Extract',
    colors: 'Colors', gradients: 'Gradients', styles: 'Styles (<style>)', css: 'CSS variables',
    copy: 'Copy', copied: 'Copied', empty: 'Paste SVG or upload a file',
    nothing: 'No styles found', invalid: 'Does not look like valid SVG',
    hint: 'Colors as CSS variables (by usage), gradients with the real angle, center and opacity, SVG as a ready background or a mask for text-colored icons.',
    bg: 'SVG as CSS background (data URI)', mask: 'SVG as mask (currentColor icon)',
  },
};

// Любой CSS-цвет → #rrggbb (через canvas), с учётом прозрачности → rgba().
let probe = null;
function normColor(v, alpha = 1) {
  if (!v || v === 'none' || /^url\(/.test(v) || v === 'currentColor' || v === 'inherit') return null;
  if (!probe) probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = '#000'; probe.fillStyle = v.trim();
  const hex = probe.fillStyle;
  if (alpha >= 1) return hex;
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Number(alpha.toFixed(3))})`;
}

const num = (v, def) => { if (v == null || v === '') return def; const x = parseFloat(v); return String(v).trim().endsWith('%') ? x / 100 : x; };

// Угол поворота из gradientTransform (rotate(a) или matrix(a b c d e f)).
function transformAngle(tr) {
  if (!tr) return 0;
  const r = tr.match(/rotate\(\s*(-?[\d.]+)/); if (r) return parseFloat(r[1]);
  const m = tr.match(/matrix\(\s*(-?[\d.e]+)[\s,]+(-?[\d.e]+)/); if (m) return (Math.atan2(parseFloat(m[2]), parseFloat(m[1])) * 180) / Math.PI;
  return 0;
}

function toDataUri(svgText) {
  const enc = encodeURIComponent(svgText).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%22/g, '%27');
  return `url("data:image/svg+xml,${enc}")`;
}

function extractFromSvg(input) {
  const doc = new DOMParser().parseFromString(input, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return null;
  const vb = (svg.getAttribute('viewBox') || `0 0 ${parseFloat(svg.getAttribute('width')) || 100} ${parseFloat(svg.getAttribute('height')) || 100}`).split(/[\s,]+/).map(Number);

  const counts = new Map();
  const addColor = (v, opacity = 1) => { const c = normColor(v, opacity); if (c) counts.set(c, (counts.get(c) || 0) + 1); };
  const styleOf = (el, prop) => { const st = el.getAttribute('style') || ''; const m = st.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`)); return m ? m[1].trim() : el.getAttribute(prop); };
  doc.querySelectorAll('*').forEach((el) => {
    if (el.tagName.toLowerCase() === 'stop') return;
    addColor(styleOf(el, 'fill'), num(styleOf(el, 'fill-opacity'), 1));
    addColor(styleOf(el, 'stroke'), num(styleOf(el, 'stroke-opacity'), 1));
  });

  // Градиенты: наследование через href/xlink:href (стопы и атрибуты), направление и
  // центр — в долях бокса (objectBoundingBox) или пересчётом из userSpaceOnUse.
  const byId = {}; doc.querySelectorAll('linearGradient, radialGradient').forEach((g) => { if (g.id) byId[g.id] = g; });
  const hrefOf = (el) => el.getAttribute('href') || el.getAttribute('xlink:href');
  const inherit = (g, attr) => { let cur = g; for (let i = 0; i < 10 && cur; i += 1) { if (cur.hasAttribute(attr)) return cur.getAttribute(attr); const h = hrefOf(cur); cur = h ? byId[h.slice(1)] : null; } return null; };
  const stopsOf = (g) => { let cur = g; for (let i = 0; i < 10 && cur; i += 1) { const st = cur.querySelectorAll('stop'); if (st.length) return [...st]; const h = hrefOf(cur); cur = h ? byId[h.slice(1)] : null; } return []; };

  const gradients = [];
  doc.querySelectorAll('linearGradient, radialGradient').forEach((g) => {
    const stops = stopsOf(g).map((st) => {
      const raw = styleOf(st, 'stop-color') || '#000'; const op = num(styleOf(st, 'stop-opacity'), 1);
      addColor(raw, op);
      return `${normColor(raw, op) || '#000'} ${Math.round(Math.max(0, Math.min(1, num(st.getAttribute('offset'), 0))) * 100)}%`;
    });
    if (!stops.length) return;
    const user = inherit(g, 'gradientUnits') === 'userSpaceOnUse';
    const rel = (v, axis, def) => { const x = num(v, def); return user && v != null && !String(v).includes('%') ? (x - vb[axis]) / vb[axis + 2] : x; };
    const rot = transformAngle(inherit(g, 'gradientTransform'));
    const id = g.getAttribute('id') || `grad${gradients.length + 1}`;
    let css;
    if (g.tagName.toLowerCase() === 'lineargradient') {
      const x1 = rel(inherit(g, 'x1'), 0, 0); const y1 = rel(inherit(g, 'y1'), 1, 0); const x2 = rel(inherit(g, 'x2'), 0, 1); const y2 = rel(inherit(g, 'y2'), 1, 0);
      // SVG: 0° — вправо; CSS: 0deg — вверх, по часовой.
      const ang = Math.round(((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90 + rot + 360) % 360);
      css = `linear-gradient(${ang}deg, ${stops.join(', ')})`;
    } else {
      const cx = rel(inherit(g, 'cx'), 0, 0.5); const cy = rel(inherit(g, 'cy'), 1, 0.5); const r = num(inherit(g, 'r'), 0.5);
      const rr = user ? r / Math.max(vb[2], vb[3]) : r;
      css = `radial-gradient(circle ${Math.round(rr * 141)}% at ${Math.round(cx * 100)}% ${Math.round(cy * 100)}%, ${stops.join(', ')})`;
    }
    gradients.push({ id, css });
  });

  const styleBlocks = [...doc.querySelectorAll('style')].map((st) => st.textContent.trim()).filter(Boolean);
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const cssVars = colors.map(([c], i) => `  --color-${i + 1}: ${c};`).join('\n');
  const uri = toDataUri(new XMLSerializer().serializeToString(svg).replace(/\s+/g, ' ').replace(/> </g, '><'));
  return {
    colors, cssVars: cssVars ? `:root {\n${cssVars}\n}` : '', gradients, styleBlocks,
    bgSnippet: `.icon {\n  background: ${uri} center / contain no-repeat;\n}`,
    maskSnippet: `.icon {\n  background-color: currentColor;\n  -webkit-mask: ${uri} center / contain no-repeat;\n  mask: ${uri} center / contain no-repeat;\n}`,
  };
}

function CssFromSvg({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  function run(value = raw) {
    if (!value.trim()) { setResult(null); setError(''); return; }
    const r = extractFromSvg(value);
    if (!r) { setError(t.invalid); setResult(null); return; }
    setError('');
    setResult(r);
  }
  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setRaw(reader.result); run(reader.result); };
    reader.readAsText(file);
  }
  function copy(key, text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1300); }).catch(() => {});
  }

  const nothing = result && result.colors.length === 0 && result.gradients.length === 0 && result.styleBlocks.length === 0;

  return (
    <div className="tool-panel css-from-svg">
      <div className="tool-actions">
        <button type="button" className="tool-btn" onClick={() => inputRef.current?.click()}>{t.upload}</button>
        <button type="button" className="tool-btn primary" onClick={() => run()}>{t.extract}</button>
      </div>

      <textarea className="svgc-input" placeholder={t.paste} value={raw} spellCheck={false} onChange={(e) => setRaw(e.target.value)} />
      {error && <p className="color-invalid">{error}</p>}
      {nothing && <p className="tool-local-note">{t.nothing}</p>}

      {result && result.colors.length > 0 && (
        <div className="cfs-block">
          <div className="fv-code-head"><span className="tool-field-label">{t.colors} ({result.colors.length})</span></div>
          <div className="cfs-swatches">
            {result.colors.map(([c, n]) => <span key={c} className="cfs-swatch" style={{ background: c }} title={`${c} ×${n}`}>{c} <em>×{n}</em></span>)}
          </div>
          <div className="fv-code-head">
            <span className="tool-field-label">{t.css}</span>
            <button type="button" className="tool-btn small" onClick={() => copy('vars', result.cssVars)}>{copied === 'vars' ? `✓ ${t.copied}` : t.copy}</button>
          </div>
          <pre className="fv-pre">{result.cssVars}</pre>
        </div>
      )}

      {result && result.gradients.length > 0 && (
        <div className="cfs-block">
          <div className="fv-code-head">
            <span className="tool-field-label">{t.gradients} ({result.gradients.length})</span>
            <button type="button" className="tool-btn small" onClick={() => copy('grad', result.gradients.map((g) => `/* ${g.id} */\nbackground: ${g.css};`).join('\n\n'))}>{copied === 'grad' ? `✓ ${t.copied}` : t.copy}</button>
          </div>
          <div className="cfs-grads">
            {result.gradients.map((g) => (
              <div key={g.id} className="cfs-grad"><span style={{ background: g.css }} /><code>/* {g.id} */<br />background: {g.css};</code></div>
            ))}
          </div>
        </div>
      )}

      {result && result.styleBlocks.length > 0 && (
        <div className="cfs-block">
          <div className="fv-code-head">
            <span className="tool-field-label">{t.styles}</span>
            <button type="button" className="tool-btn small" onClick={() => copy('style', result.styleBlocks.join('\n\n'))}>{copied === 'style' ? `✓ ${t.copied}` : t.copy}</button>
          </div>
          <pre className="fv-pre">{result.styleBlocks.join('\n\n')}</pre>
        </div>
      )}

      {result && (
        <div className="cfs-block">
          <div className="fv-code-head">
            <span className="tool-field-label">{t.bg}</span>
            <button type="button" className="tool-btn small" onClick={() => copy('bg', result.bgSnippet)}>{copied === 'bg' ? `✓ ${t.copied}` : t.copy}</button>
          </div>
          <pre className="fv-pre cfs-long">{result.bgSnippet}</pre>
          <div className="fv-code-head">
            <span className="tool-field-label">{t.mask}</span>
            <button type="button" className="tool-btn small" onClick={() => copy('mask', result.maskSnippet)}>{copied === 'mask' ? `✓ ${t.copied}` : t.copy}</button>
          </div>
          <pre className="fv-pre cfs-long">{result.maskSnippet}</pre>
        </div>
      )}

      <input ref={inputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default CssFromSvg;
