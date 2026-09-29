import { useEffect, useMemo, useRef, useState } from 'react';
import { subsetFont, toSfnt, toWoff2, unicodeRange } from '../../utils/fontSubset';

// Сабсеттер шрифтов: оставляет в шрифте только нужные символы (кириллица, латиница,
// цифры, свой текст или весь текст сайта) и сжимает в WOFF2. Шрифт весом 300 КБ
// превращается в 15–40 КБ — сайт грузится быстрее. HarfBuzz hb-subset в WASM.

const SETS = [
  { id: 'basic', ru: 'Базовая латиница', en: 'Basic Latin', ranges: [[0x20, 0x7e]] },
  { id: 'latinext', ru: 'Латиница расширенная (é, ß, ł…)', en: 'Latin extended (é, ß, ł…)', ranges: [[0xa0, 0xff], [0x100, 0x17f]] },
  { id: 'cyr', ru: 'Кириллица (рус., укр., бел.)', en: 'Cyrillic (Rus, Ukr, Bel)', ranges: [[0x400, 0x45f], [0x490, 0x491]] },
  { id: 'cyrext', ru: 'Кириллица расширенная (каз., тат.…)', en: 'Cyrillic extended', ranges: [[0x460, 0x52f]] },
  { id: 'punct', ru: 'Типографика: «» — … № ₽ € ™', en: 'Typography: «» — … № ₽ € ™', ranges: [[0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x20bd, 0x20bd], [0x2116, 0x2116], [0x2122, 0x2122], [0xab, 0xab], [0xbb, 0xbb]] },
  { id: 'greek', ru: 'Греческий', en: 'Greek', ranges: [[0x370, 0x3ff]] },
];

const TEXT = {
  ru: {
    drop: 'Загрузите шрифт', hint: 'TTF, OTF, WOFF, WOFF2 — всё локально', sets: 'Наборы символов', custom: 'Плюс символы из текста (вставьте тексты сайта)', customPh: 'Вставьте текст — в шрифте останутся только его символы…',
    features: 'Сохранить все OpenType-фичи (лигатуры, альтернативы)', hinting: 'Убрать хинтинг (легче, для экранов с высоким DPI)', run: 'Сделать подмножество', working: 'Считаю…',
    chars: 'Символов', woff2: 'Скачать WOFF2', ttf: 'Скачать TTF/OTF', css: 'CSS @font-face', copied: 'Скопировано', preview: 'Превью', change: 'Другой шрифт',
    note: 'Сабсеттинг делает HarfBuzz — тот же движок, что у Google Fonts. Проверьте превью: символы вне набора браузер возьмёт из запасного шрифта.',
  },
  en: {
    drop: 'Upload a font', hint: 'TTF, OTF, WOFF, WOFF2 — all local', sets: 'Character sets', custom: 'Plus characters from text (paste your site copy)', customPh: 'Paste text — only its characters will stay in the font…',
    features: 'Keep all OpenType features (ligatures, alternates)', hinting: 'Drop hinting (smaller, for high-DPI screens)', run: 'Subset', working: 'Working…',
    chars: 'Characters', woff2: 'Download WOFF2', ttf: 'Download TTF/OTF', css: 'CSS @font-face', copied: 'Copied', preview: 'Preview', change: 'Another font',
    note: 'Subsetting is done by HarfBuzz — the same engine Google Fonts uses. Check the preview: characters outside the set fall back to another font.',
  },
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function FontSubsetter({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [font, setFont] = useState(null); // { name, size, sfnt, family }
  const [sets, setSets] = useState(() => new Set(language === 'en' ? ['basic', 'punct'] : ['basic', 'cyr', 'punct']));
  const [custom, setCustom] = useState('');
  const [keepFeatures, setKeepFeatures] = useState(true);
  const [dropHinting, setDropHinting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null); // { sfnt, woff2, family }
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const cps = useMemo(() => {
    const s = new Set();
    SETS.filter((x) => sets.has(x.id)).forEach((x) => x.ranges.forEach(([a, b]) => { for (let c = a; c <= b; c += 1) s.add(c); }));
    for (const ch of custom) s.add(ch.codePointAt(0));
    return s;
  }, [sets, custom]);

  async function load(f) {
    if (!f) return;
    setErr(''); setRes(null);
    try {
      const sfnt = await toSfnt(new Uint8Array(await f.arrayBuffer()));
      const family = `Src${Date.now()}`;
      await new FontFace(family, sfnt).load().then((ff) => document.fonts.add(ff));
      setFont({ name: f.name.replace(/\.[^.]+$/, ''), size: f.size, sfnt, family, otf: String.fromCharCode(...sfnt.subarray(0, 4)) === 'OTTO' });
    } catch (e) { setErr(String(e.message || e)); }
  }

  async function run() {
    setBusy(true); setErr('');
    try {
      const sub = await subsetFont(font.sfnt, cps, { keepFeatures, dropHinting });
      const woff2 = await toWoff2(sub);
      const family = `Sub${Date.now()}`;
      await new FontFace(family, sub).load().then((ff) => document.fonts.add(ff));
      setRes({ sfnt: sub, woff2, family });
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }
  useEffect(() => { setRes(null); }, [cps, keepFeatures, dropHinting]);

  const dl = (bytes, ext, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = `${font.name}-subset.${ext}`; document.body.appendChild(a); a.click(); a.remove(); };
  const css = font ? `@font-face {\n  font-family: '${font.name}';\n  src: url('/fonts/${font.name}-subset.woff2') format('woff2');\n  font-display: swap;\n  unicode-range: ${unicodeRange(cps)};\n}` : '';
  const sample = custom.trim() || (language === 'en' ? 'The quick brown fox jumps over the lazy dog 0123456789' : 'Съешь же ещё этих мягких французских булок — 0123456789 «№»');

  return (
    <div className="tool-panel font-subsetter">
      {!font ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="fs-head"><b>{font.name}</b> · {kb(font.size)} <button type="button" className="sp-link" onClick={() => inputRef.current?.click()}>{t.change}</button></div>
          <div className="tool-field">
            <span className="tool-field-label">{t.sets}</span>
            <div className="fs-sets">
              {SETS.map((x) => (
                <label key={x.id} className="tool-check"><input type="checkbox" checked={sets.has(x.id)} onChange={() => setSets((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} /> {x[language] || x.ru}</label>
              ))}
            </div>
          </div>
          <label className="tool-field"><span className="tool-field-label">{t.custom}</span><textarea className="pf-input" rows={3} value={custom} placeholder={t.customPh} onChange={(e) => setCustom(e.target.value)} /></label>
          <label className="tool-check"><input type="checkbox" checked={keepFeatures} onChange={(e) => setKeepFeatures(e.target.checked)} /> {t.features}</label>
          <label className="tool-check"><input type="checkbox" checked={dropHinting} onChange={(e) => setDropHinting(e.target.checked)} /> {t.hinting}</label>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={run} disabled={busy || !cps.size}>{busy ? t.working : `${t.run} (${t.chars}: ${cps.size})`}</button>
          </div>
          {res && (
            <>
              <div className="id-stats">
                <div className="cc-ratio"><span className="cc-ratio-value">{kb(font.size)} → {kb(res.woff2.length)}</span><span className="cc-ratio-label">WOFF2 (−{Math.max(0, Math.round((1 - res.woff2.length / font.size) * 100))}%)</span></div>
              </div>
              <div className="tool-actions">
                <button type="button" className="tool-btn primary" onClick={() => dl(res.woff2, 'woff2', 'font/woff2')}>{t.woff2}</button>
                <button type="button" className="tool-btn" onClick={() => dl(res.sfnt, font.otf ? 'otf' : 'ttf', 'font/ttf')}>{t.ttf}</button>
                <button type="button" className="tool-btn" onClick={() => navigator.clipboard?.writeText(css).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>{copied ? `✓ ${t.copied}` : t.css}</button>
              </div>
              <pre className="fv-pre cfs-long">{css}</pre>
            </>
          )}
          <div className="tool-field">
            <span className="tool-field-label">{t.preview}</span>
            <div className="fs-preview" style={{ fontFamily: `'${res ? res.family : font.family}', monospace` }}>{sample}</div>
          </div>
        </>
      )}
      {err && <p className="color-invalid">{err}</p>}
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default FontSubsetter;
