import { useEffect, useRef, useState } from 'react';
import { AXIS_NAMES, namedInstances, openFont } from '../../utils/fontInfo';

// Variable Font Playground: оси вариативного шрифта (wght, wdth, slnt, opsz и
// собственные) считываются автоматически, каждую можно крутить или анимировать,
// именованные начертания в один клик, «водопад» кеглей, готовый CSS.

const TEXT = {
  ru: {
    drop: 'Загрузите вариативный шрифт', hint: 'TTF, OTF, WOFF2 с осями wght / wdth / slnt / opsz и др.', notVar: 'В этом шрифте нет вариативных осей — это обычный статичный шрифт.',
    animate: 'Анимировать', instances: 'Начертания', waterfall: 'Водопад кеглей', css: 'Копировать CSS', copied: 'Скопировано', reset: 'Сбросить', change: 'Другой шрифт',
    color: 'Цвет', bg: 'Фон', align: 'По центру',
  },
  en: {
    drop: 'Upload a variable font', hint: 'TTF, OTF, WOFF2 with wght / wdth / slnt / opsz and other axes', notVar: 'This font has no variation axes — it is a regular static font.',
    animate: 'Animate', instances: 'Instances', waterfall: 'Size waterfall', css: 'Copy CSS', copied: 'Copied', reset: 'Reset', change: 'Another font',
    color: 'Color', bg: 'Background', align: 'Centered',
  },
};

function VariableFonts({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [vals, setVals] = useState({});
  const [anim, setAnim] = useState({});
  const [text, setText] = useState(language === 'en' ? 'Variable type' : 'Живой шрифт');
  const [fg, setFg] = useState('#f5f7fb');
  const [bg, setBg] = useState('#14141c');
  const [copied, setCopied] = useState(false);

  async function load(file) {
    if (!file) return;
    try {
      const r = await openFont(file); setF(r); setErr('');
      const ax = r.font.variationAxes || {};
      setVals(Object.fromEntries(Object.entries(ax).map(([k, v]) => [k, v.default]))); setAnim({});
    } catch (e) { setErr(String(e.message || e)); }
  }

  // Анимация выбранных осей: синусоида между min и max, у каждой оси своя фаза.
  useEffect(() => {
    const on = Object.keys(anim).filter((k) => anim[k]);
    if (!f || !on.length) return undefined;
    const ax = f.font.variationAxes; let raf = 0; const t0 = performance.now();
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      setVals((v) => { const n = { ...v }; on.forEach((k, i) => { const a = ax[k]; n[k] = a.min + ((Math.sin(s * 1.3 + i * 1.7) + 1) / 2) * (a.max - a.min); }); return n; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, f]);

  const axes = f ? f.font.variationAxes || {} : {};
  const settings = Object.entries(vals).map(([k, v]) => `"${k}" ${Math.round(v * 10) / 10}`).join(', ');
  const instances = f ? namedInstances(f.font) : {};
  const css = f ? `@font-face {\n  font-family: '${f.font.familyName}';\n  src: url('/fonts/${f.name}.woff2') format('woff2-variations');\n  font-weight: ${axes.wght ? `${axes.wght.min} ${axes.wght.max}` : 'normal'};\n}\n\n.text {\n  font-family: '${f.font.familyName}';\n  font-variation-settings: ${settings || 'normal'};\n}` : '';

  return (
    <div className="tool-panel variable-fonts">
      {!f ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="vf-stage" style={{ background: bg, color: fg }}>
            <div className="vf-text" contentEditable suppressContentEditableWarning spellCheck={false} onInput={(e) => setText(e.currentTarget.textContent)} style={{ fontFamily: `'${f.family}'`, fontVariationSettings: settings || 'normal' }}>{text}</div>
          </div>
          {!Object.keys(axes).length && <p className="aid-warn tool-local-note">⚠️ {t.notVar}</p>}
          <div className="vf-axes">
            {Object.entries(axes).map(([k, a]) => (
              <div key={k} className="vf-axis">
                <label className="tool-field"><span className="tool-field-label">{a.name || AXIS_NAMES[k] || k} <code>{k}</code>: {Math.round((vals[k] ?? a.default) * 10) / 10} <em>({a.min}–{a.max})</em></span>
                  <input type="range" min={a.min} max={a.max} step={(a.max - a.min) / 400} value={vals[k] ?? a.default} onChange={(e) => { setAnim((s) => ({ ...s, [k]: false })); setVals((v) => ({ ...v, [k]: Number(e.target.value) })); }} /></label>
                <label className="tool-check"><input type="checkbox" checked={!!anim[k]} onChange={(e) => setAnim((s) => ({ ...s, [k]: e.target.checked }))} /> {t.animate}</label>
              </div>
            ))}
          </div>
          {Object.keys(instances).length > 0 && (
            <div className="tool-field"><span className="tool-field-label">{t.instances}</span>
              <div className="mg-chips">{Object.entries(instances).map(([n, v]) => <button key={n} type="button" className="mg-chip" onClick={() => { setAnim({}); setVals({ ...vals, ...v }); }} style={{ fontFamily: `'${f.family}'`, fontVariationSettings: Object.entries(v).map(([k, x]) => `"${k}" ${x}`).join(', ') }}>{n}</button>)}</div>
            </div>
          )}
          <div className="mg-row">
            <label className="tool-field"><span className="tool-field-label">{t.color}</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.bg}</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
            <button type="button" className="tool-btn small" onClick={() => { setAnim({}); setVals(Object.fromEntries(Object.entries(axes).map(([k, v]) => [k, v.default]))); }}>{t.reset}</button>
          </div>
          <h3 className="pe-h">{t.waterfall}</h3>
          <div className="vf-water" style={{ fontFamily: `'${f.family}'`, fontVariationSettings: settings || 'normal' }}>
            {[72, 48, 32, 24, 18, 14, 12].map((s) => <div key={s}><em>{s}</em><span style={{ fontSize: s }}>{text}</span></div>)}
          </div>
          <pre className="fv-pre cfs-long">{css}</pre>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => navigator.clipboard?.writeText(css).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>{copied ? `✓ ${t.copied}` : t.css}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}
      {err && <p className="color-invalid">{err}</p>}
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

export default VariableFonts;
