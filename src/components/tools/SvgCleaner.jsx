import { useRef, useState } from 'react';

// Очиститель SVG: убирает мусор из экспортов Figma/Illustrator/Inkscape —
// комментарии, <metadata>, редакторские namespace/атрибуты, лишние пробелы.
// Локально через DOMParser, без внешних библиотек.

const TEXT = {
  ru: {
    paste: 'Вставьте код SVG сюда…', upload: 'Загрузить .svg', clean: 'Очистить',
    copy: 'Копировать', copied: 'Скопировано', download: 'Скачать', clear: 'Очистить поле',
    saved: 'Экономия', before: 'Было', after: 'Стало', empty: 'Вставьте SVG или загрузите файл',
    hint: 'Удаляются комментарии, метаданные, редакторские атрибуты (inkscape, sodipodi, adobe) и лишние пробелы.',
    invalid: 'Не похоже на корректный SVG',
  },
  en: {
    paste: 'Paste your SVG code here…', upload: 'Upload .svg', clean: 'Clean',
    copy: 'Copy', copied: 'Copied', download: 'Download', clear: 'Clear field',
    saved: 'Saved', before: 'Before', after: 'After', empty: 'Paste SVG or upload a file',
    hint: 'Removes comments, metadata, editor attributes (inkscape, sodipodi, adobe) and extra whitespace.',
    invalid: 'Does not look like valid SVG',
  },
};

const EDITOR_PREFIXES = ['inkscape', 'sodipodi', 'adobe', 'illustrator', 'i', 'x', 'graph', 'dc', 'cc', 'rdf'];
const DROP_ELEMENTS = ['metadata', 'sodipodi:namedview', 'rdf:rdf', 'foreignObject'];

function cleanSvg(input) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return null;

  // Чистим редакторские xmlns:* и на самом корне <svg>.
  [...svg.attributes].forEach((attr) => {
    const n = attr.name.toLowerCase();
    if (n.startsWith('xmlns:') && EDITOR_PREFIXES.includes(n.split(':')[1])) svg.removeAttribute(attr.name);
    const prefix = n.includes(':') ? n.split(':')[0] : '';
    if (prefix && prefix !== 'xmlns' && EDITOR_PREFIXES.includes(prefix)) svg.removeAttribute(attr.name);
  });

  const walk = (node) => {
    // комментарии
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 8) { child.remove(); return; }
      if (child.nodeType === 1) {
        const name = child.nodeName.toLowerCase();
        if (DROP_ELEMENTS.includes(name)) { child.remove(); return; }
        // редакторские атрибуты по префиксу
        [...child.attributes].forEach((attr) => {
          const n = attr.name.toLowerCase();
          const prefix = n.includes(':') ? n.split(':')[0] : '';
          if (prefix && EDITOR_PREFIXES.includes(prefix)) child.removeAttribute(attr.name);
          if (n.startsWith('xmlns:') && EDITOR_PREFIXES.includes(n.split(':')[1])) child.removeAttribute(attr.name);
        });
        walk(child);
      }
    });
  };
  walk(svg);

  let out = new XMLSerializer().serializeToString(svg);
  // схлопнуть пробелы между тегами и лишние пустые строки
  out = out.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  return out;
}

function bytes(str) {
  return new Blob([str]).size;
}
function fmt(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function SvgCleaner({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function run(value = raw) {
    if (!value.trim()) { setCleaned(''); setError(''); return; }
    const result = cleanSvg(value);
    if (!result) { setError(t.invalid); setCleaned(''); return; }
    setError('');
    setCleaned(result);
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setRaw(reader.result); run(reader.result); };
    reader.readAsText(file);
  }

  function copy() {
    if (navigator.clipboard && cleaned) {
      navigator.clipboard.writeText(cleaned).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }).catch(() => {});
    }
  }

  function download() {
    if (!cleaned) return;
    const blob = new Blob([cleaned], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cleaned.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  const beforeSize = bytes(raw);
  const afterSize = bytes(cleaned);
  const saved = beforeSize > 0 && afterSize > 0 ? Math.round((1 - afterSize / beforeSize) * 100) : 0;

  return (
    <div className="tool-panel svg-cleaner">
      <div className="tool-actions">
        <button type="button" className="tool-btn" onClick={() => inputRef.current?.click()}>{t.upload}</button>
        <button type="button" className="tool-btn primary" onClick={() => run()}>{t.clean}</button>
        {raw && <button type="button" className="tool-btn ghost" onClick={() => { setRaw(''); setCleaned(''); setError(''); }}>{t.clear}</button>}
      </div>

      <textarea
        className="svgc-input"
        placeholder={t.paste}
        value={raw}
        spellCheck={false}
        onChange={(e) => setRaw(e.target.value)}
      />

      {error && <p className="color-invalid">{error}</p>}

      {cleaned && (
        <>
          <div className="svgc-stats">
            <span>{t.before}: <strong>{fmt(beforeSize)}</strong></span>
            <span className="convert-arrow">→</span>
            <span>{t.after}: <strong>{fmt(afterSize)}</strong></span>
            {saved > 0 && <span className="convert-delta">({t.saved} {saved}%)</span>}
          </div>
          <textarea className="svgc-output" readOnly value={cleaned} spellCheck={false} />
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
            <button type="button" className="tool-btn" onClick={download}>{t.download}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default SvgCleaner;
