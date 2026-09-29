import { useEffect, useRef, useState } from 'react';
import { simplifySvg } from '../../utils/pathSimplify';

// Упрощение SVG-путей: меньше узлов — легче файл, чище кривые после автотрассировки
// и векторизации. Ползунок допуска в пикселях, сглаживание Безье с сохранением
// острых углов, наложение «до/после», счётчики узлов и веса.

const TEXT = {
  ru: {
    input: 'SVG-код', drop: 'или перетащите .svg', tolerance: 'Допуск', smooth: 'Сглаживать кривыми (сохраняя углы)', corner: 'Острые углы от', precision: 'Знаков после запятой',
    view: 'Показ', overlay: 'Наложение', side: 'Рядом', before: 'До', after: 'После', nodes: 'Узлов', size: 'Вес', copy: 'Копировать SVG', copied: 'Скопировано', download: 'Скачать SVG',
    note: 'Допуск — максимальное отклонение нового контура от исходного в пикселях. 0.5–1 px почти незаметно глазу, а узлов становится в разы меньше.',
  },
  en: {
    input: 'SVG code', drop: 'or drop an .svg', tolerance: 'Tolerance', smooth: 'Smooth with curves (keep corners)', corner: 'Sharp corners above', precision: 'Decimal places',
    view: 'View', overlay: 'Overlay', side: 'Side by side', before: 'Before', after: 'After', nodes: 'Nodes', size: 'Size', copy: 'Copy SVG', copied: 'Copied', download: 'Download SVG',
    note: 'Tolerance is the maximum deviation of the new outline from the original, in pixels. 0.5–1 px is barely visible, yet nodes drop several times.',
  },
};

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><path fill="#6166ff" d="${(() => {
  let d = 'M10 60'; for (let i = 1; i <= 90; i += 1) { const x = 10 + i * 2; const y = 60 + Math.sin(i / 7) * 35 + Math.sin(i * 1.7) * 1.2; d += ` L${x.toFixed(2)} ${y.toFixed(2)}`; } return `${d} L190 115 L10 115 Z`;
})()}"/></svg>`;

const kb = (s) => `${(new Blob([s]).size / 1024).toFixed(1)} KB`;
const safe = (s) => (/<svg[\s>]/i.test(s) && !/<script|\son\w+=/i.test(s) ? s : '');

function PathSimplifier({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const fileRef = useRef(null);
  const [src, setSrc] = useState(SAMPLE);
  const [tol, setTol] = useState(1);
  const [smooth, setSmooth] = useState(true);
  const [corner, setCorner] = useState(50);
  const [precision, setPrecision] = useState(1);
  const [view, setView] = useState('overlay');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try { setRes(simplifySvg(src, { tolerance: tol, smooth, corner, precision })); setErr(''); } catch (e) { setErr(String(e.message || e)); }
    }, 150);
    return () => clearTimeout(timer);
  }, [src, tol, smooth, corner, precision]);

  const load = (fl) => fl && fl.text().then(setSrc);
  // Для наложения: исходник полупрозрачным красным контуром поверх результата.
  const overlaySrc = res ? safe(src).replace(/<svg/i, '<svg class="ps-orig"') : '';

  return (
    <div className="tool-panel path-simplifier">
      <div className="tool-controls">
        <label className="tool-field"><span className="tool-field-label">{t.tolerance}: {tol.toFixed(2)} px</span><input type="range" min="0" max="10" step="0.05" value={tol} onChange={(e) => setTol(Number(e.target.value))} /></label>
        <label className="tool-check"><input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> {t.smooth}</label>
        {smooth && <label className="tool-field"><span className="tool-field-label">{t.corner}: {corner}°</span><input type="range" min="10" max="120" value={corner} onChange={(e) => setCorner(Number(e.target.value))} /></label>}
        <label className="tool-field"><span className="tool-field-label">{t.precision}: {precision}</span><input type="range" min="0" max="3" value={precision} onChange={(e) => setPrecision(Number(e.target.value))} /></label>
        <div className="tool-field"><span className="tool-field-label">{t.view}</span>
          <div className="segmented">{[['overlay', t.overlay], ['side', t.side]].map(([id, l]) => <button key={id} type="button" className={view === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setView(id)}>{l}</button>)}</div>
        </div>
      </div>

      {res && (
        <>
          <div className="id-stats">
            <div className="cc-ratio"><span className="cc-ratio-value">{res.nodesIn} → {res.nodesOut}</span><span className="cc-ratio-label">{t.nodes} (−{Math.max(0, Math.round((1 - res.nodesOut / Math.max(1, res.nodesIn)) * 100))}%)</span></div>
            <div className="cc-ratio"><span className="cc-ratio-value">{kb(src)} → {kb(res.svg)}</span><span className="cc-ratio-label">{t.size}</span></div>
          </div>
          {view === 'overlay' ? (
            <div className="ps-stage">
              <div className="ps-layer" dangerouslySetInnerHTML={{ __html: safe(res.svg) }} />
              <div className="ps-layer ps-top" dangerouslySetInnerHTML={{ __html: overlaySrc }} />
            </div>
          ) : (
            <div className="sj-grid">
              <div><span className="tool-field-label">{t.before}</span><div className="ps-stage" dangerouslySetInnerHTML={{ __html: safe(src) }} /></div>
              <div><span className="tool-field-label">{t.after}</span><div className="ps-stage" dangerouslySetInnerHTML={{ __html: safe(res.svg) }} /></div>
            </div>
          )}
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([res.svg], { type: 'image/svg+xml' })); a.download = 'simplified.svg'; document.body.appendChild(a); a.click(); a.remove(); }}>{t.download}</button>
            <button type="button" className="tool-btn" onClick={() => navigator.clipboard?.writeText(res.svg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>{copied ? `✓ ${t.copied}` : t.copy}</button>
          </div>
        </>
      )}
      {err && <p className="color-invalid">{err}</p>}
      <div className="tool-field">
        <span className="tool-field-label">{t.input} <button type="button" className="sp-link" onClick={() => fileRef.current?.click()}>{t.drop}</button></span>
        <textarea className="pf-input sj-code" rows={8} value={src} spellCheck={false} onChange={(e) => setSrc(e.target.value)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }} />
      </div>
      <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">💡 {t.note}</p>
    </div>
  );
}

export default PathSimplifier;
