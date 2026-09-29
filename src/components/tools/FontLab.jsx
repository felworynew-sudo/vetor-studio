import { useMemo, useRef, useState } from 'react';
import { AXIS_NAMES, FEATURE_NAMES, fontInfo, glyphSvg, openFont } from '../../utils/fontInfo';

// Font Lab: всё о шрифте в одном окне (fontkit, MIT) — имена, лицензия, метрики,
// покрытие письменностей, OpenType-фичи с живым включением, вариативные оси,
// полная карта глифов с деталями и экспортом глифа в SVG.

const TEXT = {
  ru: {
    drop: 'Загрузите шрифт', hint: 'TTF, OTF, WOFF, WOFF2, TTC — всё локально', info: 'Информация', metrics: 'Метрики', coverage: 'Покрытие', features: 'OpenType-фичи',
    axes: 'Вариативные оси', glyphs: 'Глифы', sample: 'Текст для проверки', size: 'Кегль', css: 'CSS', copied: 'Скопировано', search: 'Поиск глифа (символ или имя)',
    svg: 'Скачать SVG', advance: 'Ширина', noFeatures: 'Фич нет', noAxes: 'Шрифт не вариативный', change: 'Другой шрифт', more: 'Показать ещё',
    k: { family: 'Семейство', sub: 'Начертание', version: 'Версия', designer: 'Дизайнер', license: 'Лицензия', copyright: 'Копирайт', format: 'Формат', glyphs: 'Глифов', chars: 'Символов', upm: 'UPM', ascent: 'Ascent', descent: 'Descent', lineGap: 'Line gap', capHeight: 'Cap height', xHeight: 'x-height', italicAngle: 'Наклон' },
  },
  en: {
    drop: 'Upload a font', hint: 'TTF, OTF, WOFF, WOFF2, TTC — all local', info: 'Info', metrics: 'Metrics', coverage: 'Coverage', features: 'OpenType features',
    axes: 'Variable axes', glyphs: 'Glyphs', sample: 'Sample text', size: 'Size', css: 'CSS', copied: 'Copied', search: 'Find a glyph (character or name)',
    svg: 'Download SVG', advance: 'Advance', noFeatures: 'No features', noAxes: 'Not a variable font', change: 'Another font', more: 'Show more',
    k: { family: 'Family', sub: 'Style', version: 'Version', designer: 'Designer', license: 'License', copyright: 'Copyright', format: 'Format', glyphs: 'Glyphs', chars: 'Characters', upm: 'UPM', ascent: 'Ascent', descent: 'Descent', lineGap: 'Line gap', capHeight: 'Cap height', xHeight: 'x-height', italicAngle: 'Italic angle' },
  },
};

function FontLab({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [f, setF] = useState(null); // { font, family, name }
  const [err, setErr] = useState('');
  const [sample, setSample] = useState(language === 'en' ? 'Office affinity 1/2 0123 — “Quick” fjords' : 'Эффективный офис 1/2 0123 — «Быстрые» фьорды');
  const [size, setSize] = useState(48);
  const [feat, setFeat] = useState({});
  const [axes, setAxes] = useState({});
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(400);
  const [glyph, setGlyph] = useState(null);
  const [copied, setCopied] = useState(false);

  async function load(file) {
    if (!file) return;
    try {
      const r = await openFont(file); setF(r); setErr(''); setFeat({}); setGlyph(null); setLimit(400);
      const ax = r.font.variationAxes || {}; setAxes(Object.fromEntries(Object.entries(ax).map(([k, v]) => [k, v.default])));
    } catch (e) { setErr(String(e.message || e)); }
  }

  const info = useMemo(() => (f ? fontInfo(f.font) : null), [f]);
  const glyphs = useMemo(() => {
    if (!f) return [];
    const font = f.font; const list = [];
    const needle = q.trim();
    for (let i = 0; i < font.numGlyphs && list.length < limit; i += 1) {
      const g = font.getGlyph(i);
      if (needle) {
        const byChar = [...needle].some((ch) => g.codePoints.includes(ch.codePointAt(0)));
        if (!byChar && !(g.name || '').toLowerCase().includes(needle.toLowerCase())) continue; // eslint-disable-line no-continue
      }
      list.push(g);
    }
    return list;
  }, [f, q, limit]);

  const featCss = Object.entries(feat).filter(([, v]) => v !== undefined).map(([k, v]) => `"${k}" ${v ? 1 : 0}`).join(', ');
  const axCss = Object.entries(axes).map(([k, v]) => `"${k}" ${Math.round(v * 100) / 100}`).join(', ');
  const style = { fontFamily: f ? `'${f.family}'` : undefined, fontSize: size, fontFeatureSettings: featCss || 'normal', fontVariationSettings: axCss || 'normal' };
  const css = f ? `font-family: '${info.family}';${featCss ? `\nfont-feature-settings: ${featCss};` : ''}${axCss ? `\nfont-variation-settings: ${axCss};` : ''}` : '';

  const row = (k, v) => (v || v === 0 ? <tr key={k}><th>{t.k[k]}</th><td>{String(v)}</td></tr> : null);

  return (
    <div className="tool-panel font-lab">
      {!f ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="fl-sample-bar">
            <input className="dm-input" value={sample} onChange={(e) => setSample(e.target.value)} aria-label={t.sample} />
            <label className="tool-field"><span className="tool-field-label">{t.size}: {size}px</span><input type="range" min="12" max="160" value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
          </div>
          <div className="fl-sample" style={style}>{sample}</div>
          <div className="fl-css"><code>{css}</code><button type="button" className="tool-btn small" onClick={() => navigator.clipboard?.writeText(css).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>{copied ? `✓ ${t.copied}` : t.css}</button></div>

          <div className="fl-grid">
            <section>
              <h3 className="pe-h">{t.info}</h3>
              <table className="fl-table"><tbody>
                {row('family', info.family)}{row('sub', info.sub)}{row('version', info.version)}{row('designer', info.designer)}{row('format', info.format)}{row('glyphs', info.glyphs)}{row('chars', info.chars)}{row('license', info.license)}{row('copyright', info.copyright)}
              </tbody></table>
              <h3 className="pe-h">{t.metrics}</h3>
              <table className="fl-table"><tbody>
                {row('upm', info.upm)}{row('ascent', info.ascent)}{row('descent', info.descent)}{row('lineGap', info.lineGap)}{row('capHeight', info.capHeight)}{row('xHeight', info.xHeight)}{row('italicAngle', info.italicAngle)}
              </tbody></table>
            </section>
            <section>
              <h3 className="pe-h">{t.coverage}</h3>
              {info.coverage.map((c) => (
                <div key={c.id} className="fl-cov"><span>{c.ru}</span><i><b style={{ width: `${(c.have / c.total) * 100}%` }} /></i><em>{c.have}/{c.total}</em></div>
              ))}
              <h3 className="pe-h">{t.axes}</h3>
              {Object.keys(info.axes).length === 0 ? <p className="tool-local-note">{t.noAxes}</p> : (
                <>
                  {Object.entries(info.axes).map(([k, a]) => (
                    <label key={k} className="tool-field"><span className="tool-field-label">{a.name || AXIS_NAMES[k] || k} ({k}): {Math.round((axes[k] ?? a.default) * 10) / 10}</span>
                      <input type="range" min={a.min} max={a.max} step={(a.max - a.min) / 200} value={axes[k] ?? a.default} onChange={(e) => setAxes((s) => ({ ...s, [k]: Number(e.target.value) }))} /></label>
                  ))}
                  {Object.keys(info.instances).length > 0 && (
                    <div className="mg-chips">{Object.entries(info.instances).map(([n, v]) => <button key={n} type="button" className="mg-chip" onClick={() => setAxes({ ...v })}>{n}</button>)}</div>
                  )}
                </>
              )}
            </section>
          </div>

          <h3 className="pe-h">{t.features}</h3>
          {info.features.length === 0 ? <p className="tool-local-note">{t.noFeatures}</p> : (
            <div className="fl-feats">
              {info.features.map((k) => {
                const v = feat[k];
                return (
                  <button key={k} type="button" className={v === true ? 'fl-feat is-on' : v === false ? 'fl-feat is-off' : 'fl-feat'} onClick={() => setFeat((s) => ({ ...s, [k]: v === undefined ? true : v === true ? false : undefined }))} title={language === 'en' ? k : (FEATURE_NAMES[k] || k)}>
                    <code>{k}</code> {language === 'en' ? '' : (FEATURE_NAMES[k] || '')}
                  </button>
                );
              })}
            </div>
          )}

          <h3 className="pe-h">{t.glyphs} ({info.glyphs})</h3>
          <input className="dm-input" value={q} placeholder={t.search} onChange={(e) => setQ(e.target.value)} />
          <div className="fl-glyphs" style={{ fontFamily: `'${f.family}'`, fontVariationSettings: axCss || 'normal' }}>
            {glyphs.map((g) => (
              <button key={g.id} type="button" className={glyph?.id === g.id ? 'fl-g is-sel' : 'fl-g'} onClick={() => setGlyph(g)} title={g.name}>
                <span dangerouslySetInnerHTML={{ __html: glyphSvg(g, f.font, 44) }} />
                <em>{g.codePoints[0] != null ? `U+${g.codePoints[0].toString(16).toUpperCase().padStart(4, '0')}` : g.name || g.id}</em>
              </button>
            ))}
          </div>
          {!q && glyphs.length >= limit && limit < info.glyphs && <button type="button" className="tool-btn small" onClick={() => setLimit((l) => l + 400)}>{t.more}</button>}
          {glyph && (
            <div className="fl-glyph-card">
              <div className="fl-big" dangerouslySetInnerHTML={{ __html: glyphSvg(glyph, f.font, 220) }} />
              <div>
                <b>{glyph.name || `#${glyph.id}`}</b>
                <p>{glyph.codePoints.map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')} «${String.fromCodePoint(c)}»`).join(', ') || '—'}</p>
                <p>{t.advance}: {glyph.advanceWidth} / {info.upm}</p>
                <button type="button" className="tool-btn small" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([glyphSvg(glyph, f.font, 512)], { type: 'image/svg+xml' })); a.download = `${f.name}-${glyph.name || glyph.id}.svg`; document.body.appendChild(a); a.click(); a.remove(); }}>{t.svg}</button>
              </div>
            </div>
          )}
          <p><button type="button" className="sp-link" onClick={() => inputRef.current?.click()}>{t.change}</button></p>
        </>
      )}
      {err && <p className="color-invalid">{err}</p>}
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,.woff2,.ttc,font/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

export default FontLab;
