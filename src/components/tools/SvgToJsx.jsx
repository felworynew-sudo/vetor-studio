import { useEffect, useRef, useState } from 'react';
import { svgToComponent } from '../../utils/svgToJsx';

// SVG → React-компонент с преобразованиями как у SVGR (utils/svgToJsx: SVGR рассчитан на
// Node и в браузере не собирается). Опционально чистим SVG через SVGO, делаем иконку
// (1em), currentColor, TypeScript, memo/forwardRef, React Native.

const TEXT = {
  ru: {
    input: 'SVG-код', drop: 'или перетащите .svg файл', name: 'Имя компонента', ts: 'TypeScript', icon: 'Иконка (размер 1em)', current: 'Цвета → currentColor',
    memo: 'React.memo', ref: 'forwardRef', native: 'React Native', svgo: 'Сначала почистить SVGO', props: 'Прокидывать {...props}', title: 'Проп title (доступность)',
    output: 'Компонент', copy: 'Копировать', copied: 'Скопировано', download: 'Скачать файл', preview: 'Превью', error: 'Ошибка',
    note: 'Всё считается в браузере. Результат совместим с тем, что даёт SVGR (стандарт для SVG-иконок в React).',
  },
  en: {
    input: 'SVG code', drop: 'or drop an .svg file', name: 'Component name', ts: 'TypeScript', icon: 'Icon (1em size)', current: 'Colors → currentColor',
    memo: 'React.memo', ref: 'forwardRef', native: 'React Native', svgo: 'Clean with SVGO first', props: 'Spread {...props}', title: 'title prop (a11y)',
    output: 'Component', copy: 'Copy', copied: 'Copied', download: 'Download file', preview: 'Preview', error: 'Error',
    note: 'Everything runs in the browser. Output matches what SVGR (the standard for SVG icons in React) produces.',
  },
};

const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#6166ff" d="M12 2 2 22h20L12 2Zm0 5.5 6.5 12.5h-13L12 7.5Z"/><circle cx="12" cy="16" r="1.6" fill="#ff5c63"/></svg>';

const toPascal = (s) => (s.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/^(\d)/, 'Svg$1')) || 'Icon';

function SvgToJsx({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const fileRef = useRef(null);
  const [svg, setSvg] = useState(SAMPLE);
  const [name, setName] = useState('Icon');
  const [o, setO] = useState({ ts: false, icon: true, current: false, memo: false, ref: false, native: false, svgo: true, props: true, title: false });
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setO((p) => ({ ...p, [k]: e.target.checked }));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        let src = svg;
        if (o.svgo) {
          const { optimize } = await import('svgo/browser');
          src = optimize(src, { multipass: true, plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }, 'prefixIds'] }).data;
        }
        const out = svgToComponent(src, { name: name || 'Icon', typescript: o.ts, icon: o.icon, current: o.current, memo: o.memo, ref: o.ref, native: o.native, props: o.props, title: o.title }).code;
        if (!cancelled) { setCode(out); setErr(''); }
      } catch (e) { if (!cancelled) setErr(String(e.message || e)); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [svg, name, o]);

  function loadFile(f) {
    if (!f) return;
    f.text().then((txt) => { setSvg(txt); setName(toPascal(f.name)); });
  }
  function download() {
    const blob = new Blob([code], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name || 'Icon'}.${o.ts ? 'tsx' : 'jsx'}`; document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="tool-panel svg-jsx">
      <div className="sj-grid">
        <div className="tool-field">
          <span className="tool-field-label">{t.input} <button type="button" className="sp-link" onClick={() => fileRef.current?.click()}>{t.drop}</button></span>
          <textarea className="pf-input sj-code" rows={14} value={svg} spellCheck={false} onChange={(e) => setSvg(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }} />
          <div className="sj-preview" title={t.preview} dangerouslySetInnerHTML={{ __html: /<svg[\s>]/i.test(svg) && !/<script|on\w+=/i.test(svg) ? svg : '' }} />
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.output}</span>
          <textarea className="pf-input sj-code" rows={14} value={err ? `// ${t.error}: ${err}` : code} readOnly spellCheck={false} />
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })} disabled={!code || !!err}>{copied ? `✓ ${t.copied}` : t.copy}</button>
            <button type="button" className="tool-btn" onClick={download} disabled={!code || !!err}>{t.download}</button>
          </div>
        </div>
      </div>
      <div className="tool-controls">
        <label className="tool-field"><span className="tool-field-label">{t.name}</span><input className="dm-input" value={name} onChange={(e) => setName(toPascal(e.target.value) || e.target.value)} /></label>
        {[['svgo', t.svgo], ['icon', t.icon], ['current', t.current], ['ts', t.ts], ['props', t.props], ['title', t.title], ['memo', t.memo], ['ref', t.ref], ['native', t.native]].map(([k, l]) => (
          <label key={k} className="tool-check"><input type="checkbox" checked={o[k]} onChange={set(k)} /> {l}</label>
        ))}
      </div>
      <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">⚛️ {t.note}</p>
    </div>
  );
}

export default SvgToJsx;
