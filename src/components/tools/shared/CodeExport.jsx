import { useState } from 'react';
import { toCss, toTailwind } from '../../../utils/cssExport';

// Блок кода с переключателем CSS / Tailwind и копированием в клик.
// decls: [[свойство, значение], …]; extra — дополнительные форматы { id, label, code }.

const TEXT = {
  ru: { copy: 'Копировать', copied: 'Скопировано', twHint: 'Произвольные свойства Tailwind 3.2+ — работают без правки конфига.' },
  en: { copy: 'Copy', copied: 'Copied', twHint: 'Tailwind 3.2+ arbitrary properties — no config changes needed.' },
};

export default function CodeExport({ decls, extra = [], language = 'ru', selector = '.element' }) {
  const t = TEXT[language] || TEXT.ru;
  const formats = [
    { id: 'css', label: 'CSS', code: toCss(decls, selector) },
    { id: 'tw', label: 'Tailwind', code: `class="${toTailwind(decls)}"`, hint: t.twHint },
    ...extra,
  ];
  const [fmt, setFmt] = useState('css');
  const [copied, setCopied] = useState(false);
  const cur = formats.find((f) => f.id === fmt) || formats[0];

  function copy() {
    navigator.clipboard?.writeText(cur.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  }

  return (
    <div className="code-export">
      <div className="code-export-head">
        <div className="segmented">
          {formats.map((f) => (
            <button key={f.id} type="button" className={f.id === cur.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt(f.id)}>{f.label}</button>
          ))}
        </div>
        <button type="button" className="tool-btn primary small" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
      </div>
      <pre className="code-export-code"><code>{cur.code}</code></pre>
      {cur.hint && <p className="tool-local-note">{cur.hint}</p>}
    </div>
  );
}
