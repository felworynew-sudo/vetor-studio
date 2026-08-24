import { useRef, useState } from 'react';

// Экстрактор CSS из SVG: вытаскивает цвета, градиенты и стили из векторного
// файла в виде готового кода. Локально через DOMParser.

const TEXT = {
  ru: {
    paste: 'Вставьте код SVG сюда…', upload: 'Загрузить .svg', extract: 'Извлечь',
    colors: 'Цвета', gradients: 'Градиенты', styles: 'Стили (<style>)', css: 'CSS-переменные',
    copy: 'Копировать', copied: 'Скопировано', empty: 'Вставьте SVG или загрузите файл',
    nothing: 'Стилей не найдено', invalid: 'Не похоже на корректный SVG',
    hint: 'Цвета — как CSS-переменные, градиенты — готовыми linear/radial-gradient.',
  },
  en: {
    paste: 'Paste your SVG code here…', upload: 'Upload .svg', extract: 'Extract',
    colors: 'Colors', gradients: 'Gradients', styles: 'Styles (<style>)', css: 'CSS variables',
    copy: 'Copy', copied: 'Copied', empty: 'Paste SVG or upload a file',
    nothing: 'No styles found', invalid: 'Does not look like valid SVG',
    hint: 'Colors as CSS variables, gradients as ready linear/radial-gradient.',
  },
};

function extractFromSvg(input) {
  const doc = new DOMParser().parseFromString(input, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return null;

  const colors = new Set();
  const addColor = (v) => {
    if (!v) return;
    v.split(/\s+/).forEach((tok) => {
      const m = tok.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/);
      if (m && !/url\(/.test(tok)) colors.add(m[0].toLowerCase());
    });
  };
  doc.querySelectorAll('*').forEach((el) => {
    addColor(el.getAttribute('fill'));
    addColor(el.getAttribute('stroke'));
    addColor(el.getAttribute('stop-color'));
    const style = el.getAttribute('style');
    if (style) style.replace(/(fill|stroke|stop-color|color)\s*:\s*([^;]+)/g, (_, __, c) => { addColor(c); return ''; });
  });

  // Градиенты → CSS.
  const gradients = [];
  doc.querySelectorAll('linearGradient, radialGradient').forEach((g) => {
    const stops = [...g.querySelectorAll('stop')].map((s) => {
      const off = s.getAttribute('offset') || '0';
      let col = s.getAttribute('stop-color') || '#000';
      const st = s.getAttribute('style');
      if (st) { const m = st.match(/stop-color\s*:\s*([^;]+)/); if (m) col = m[1].trim(); }
      const pct = off.includes('%') ? off : `${Math.round(parseFloat(off) * 100)}%`;
      return `${col} ${pct}`;
    }).join(', ');
    if (!stops) return;
    const id = g.getAttribute('id') || `grad${gradients.length + 1}`;
    if (g.tagName.toLowerCase() === 'linearGradient'.toLowerCase()) {
      gradients.push(`/* ${id} */\nbackground: linear-gradient(90deg, ${stops});`);
    } else {
      gradients.push(`/* ${id} */\nbackground: radial-gradient(circle, ${stops});`);
    }
  });

  const styleBlocks = [...doc.querySelectorAll('style')].map((s) => s.textContent.trim()).filter(Boolean);

  const cssVars = [...colors].map((c, i) => `  --color-${i + 1}: ${c};`).join('\n');

  return {
    colors: [...colors],
    cssVars: cssVars ? `:root {\n${cssVars}\n}` : '',
    gradients,
    styleBlocks,
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
            {result.colors.map((c) => <span key={c} className="cfs-swatch" style={{ background: c }} title={c}>{c}</span>)}
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
            <button type="button" className="tool-btn small" onClick={() => copy('grad', result.gradients.join('\n\n'))}>{copied === 'grad' ? `✓ ${t.copied}` : t.copy}</button>
          </div>
          <pre className="fv-pre">{result.gradients.join('\n\n')}</pre>
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

      <input ref={inputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default CssFromSvg;
