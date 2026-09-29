import { useEffect, useMemo, useState } from 'react';

// Подбор пар шрифтов не «наугад», а по метрикам. Для каждого шрифта из подборки
// Google Fonts (все — OFL/Apache, с кириллицей) грузится крошечное подмножество
// (параметр text=), и на canvas измеряются: высота строчных (x-height / cap height),
// ширина, контраст штрихов (тонкий/толстый штрих «о») и плотность. Пара получает
// баллы за контраст классов (антиква + гротеск), близкую x-height и пропорции.

const FONTS = [
  ['Inter', 'sans'], ['Roboto', 'sans'], ['Open Sans', 'sans'], ['Montserrat', 'sans'], ['Raleway', 'sans'], ['Nunito', 'sans'], ['Manrope', 'sans'],
  ['PT Sans', 'sans'], ['Rubik', 'sans'], ['Fira Sans', 'sans'], ['IBM Plex Sans', 'sans'], ['Noto Sans', 'sans'], ['Onest', 'sans'], ['Golos Text', 'sans'],
  ['Commissioner', 'sans'], ['Jost', 'sans'], ['Ubuntu', 'sans'], ['Exo 2', 'sans'], ['Arsenal', 'sans'], ['Alegreya Sans', 'sans'], ['Tenor Sans', 'sans'],
  ['PT Serif', 'serif'], ['Playfair Display', 'serif'], ['Lora', 'serif'], ['Merriweather', 'serif'], ['Source Serif 4', 'serif'], ['Noto Serif', 'serif'],
  ['Cormorant Garamond', 'serif'], ['EB Garamond', 'serif'], ['Alegreya', 'serif'], ['Spectral', 'serif'], ['Literata', 'serif'], ['Vollkorn', 'serif'],
  ['Prata', 'serif'], ['IBM Plex Serif', 'serif'], ['Tinos', 'serif'], ['Roboto Slab', 'slab'], ['Bitter', 'slab'], ['Podkova', 'slab'],
  ['Oswald', 'display'], ['Unbounded', 'display'], ['Russo One', 'display'], ['Yeseva One', 'display'], ['Philosopher', 'display'], ['Comfortaa', 'display'],
  ['Caveat', 'script'], ['Marck Script', 'script'], ['IBM Plex Mono', 'mono'], ['JetBrains Mono', 'mono'],
];

const CLS = { sans: 'гротеск', serif: 'антиква', slab: 'брусковый', display: 'акцидентный', script: 'рукописный', mono: 'моноширинный' };
const CLS_EN = { sans: 'sans', serif: 'serif', slab: 'slab', display: 'display', script: 'script', mono: 'mono' };
const PROBE = 'xHoOabcdefghijklmnopqrstuvwxyzАБВабв';

const TEXT = {
  ru: {
    heading: 'Шрифт заголовков', any: 'Любой — показать лучшие пары', measuring: (n, m) => `Измеряю шрифты… ${n}/${m}`, pairs: 'Лучшие пары', swap: 'Поменять роли',
    css: 'CSS', copied: 'Скопировано', why: 'Почему', h: 'Как шрифты влияют на восприятие текста', p: 'Хорошая пара держит контраст характеров, но совпадает в пропорциях: близкая высота строчных делает смену шрифта в абзаце незаметной для глаза, а разный класс даёт иерархию.',
    xh: 'x-height', w: 'ширина', c: 'контраст', r: { cls: 'контраст классов', xh: 'близкая высота строчных', w: 'близкие пропорции', body: 'спокойный шрифт для текста', same: 'один класс — держится на весе' },
    note: 'Шрифты — из Google Fonts (свободные лицензии OFL/Apache), все с кириллицей. Для замеров грузятся крошечные подмножества, полные шрифты — только для показанных пар.',
  },
  en: {
    heading: 'Heading font', any: 'Any — show the best pairs', measuring: (n, m) => `Measuring fonts… ${n}/${m}`, pairs: 'Best pairs', swap: 'Swap roles',
    css: 'CSS', copied: 'Copied', why: 'Why', h: 'How fonts shape the way text is perceived', p: 'A good pair contrasts in character but matches in proportions: a similar x-height keeps a font switch within a paragraph unnoticeable, while a different class builds hierarchy.',
    xh: 'x-height', w: 'width', c: 'contrast', r: { cls: 'class contrast', xh: 'similar x-height', w: 'similar proportions', body: 'calm body face', same: 'same class — relies on weight' },
    note: 'Fonts come from Google Fonts (free OFL/Apache licenses), all with Cyrillic. Tiny subsets are loaded for measuring, full fonts only for the pairs shown.',
  },
};

const cssUrl = (fam, extra = '') => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}${extra}&display=swap`;
// Подключает CSS Google Fonts; промис — когда правила @font-face разобраны.
function addCss(href) {
  const ex = document.querySelector(`link[href="${href}"]`);
  if (ex) return ex.dataset.ready ? Promise.resolve() : new Promise((r) => { ex.addEventListener('load', r, { once: true }); ex.addEventListener('error', r, { once: true }); });
  return new Promise((r) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    l.onload = () => { l.dataset.ready = '1'; r(); }; l.onerror = r; document.head.appendChild(l);
  });
}

// Замеры одного шрифта на canvas (шрифт уже загружен).
function measure(fam) {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d', { willReadFrequently: true });
  x.font = `200px '${fam}'`;
  const H = x.measureText('H').actualBoundingBoxAscent || 1; const xh = x.measureText('x').actualBoundingBoxAscent || 1;
  const width = x.measureText('abcdefghijklmnopqrstuvwxyz').width / 26 / H;
  x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 300); x.fillStyle = '#000'; x.textBaseline = 'alphabetic'; x.fillText('o', 20, 250);
  const d = x.getImageData(0, 0, 400, 300).data; const ink = (px, py) => d[(py * 400 + px) * 4] < 128;
  // Контраст: толщина вертикального штриха «о» (по средней строке) / горизонтального (по средней колонке).
  const ob = x.measureText('o'); const cy = Math.round(250 - (ob.actualBoundingBoxAscent - ob.actualBoundingBoxDescent) / 2); const cx = Math.round(20 + ob.width / 2);
  let v = 0; let run = false; for (let px = 0; px < 400; px += 1) { if (ink(px, cy)) { v += 1; run = true; } else if (run) break; }
  let hz = 0; run = false; for (let py = 0; py < 300; py += 1) { if (ink(cx, py)) { hz += 1; run = true; } else if (run) break; }
  let area = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) area += 1;
  return { x: xh / H, w: width, c: hz && v ? Math.min(v, hz) / Math.max(v, hz) : 1, dens: area / (ob.width * (ob.actualBoundingBoxAscent + ob.actualBoundingBoxDescent) || 1) };
}

function score(a, b) {
  const ma = a.m; const mb = b.m; const reasons = []; let s = 0;
  const pair = [a.cls, b.cls].sort().join('+');
  const good = { 'sans+serif': 3, 'sans+slab': 2, 'display+sans': 2.5, 'display+serif': 1.5, 'mono+sans': 1, 'mono+serif': 1.5, 'script+sans': 1.5, 'script+serif': 1 };
  if (a.cls === b.cls) { s -= 0.5; reasons.push('same'); } else if (good[pair]) { s += good[pair]; reasons.push('cls'); }
  const dx = Math.abs(ma.x - mb.x); s += 2 - dx * 20; if (dx < 0.04) reasons.push('xh');
  const dw = Math.abs(ma.w - mb.w); s += 1 - dw * 4; if (dw < 0.08) reasons.push('w');
  if (b.cls === 'script' || b.cls === 'display') s -= 4; // для основного текста — не акцидентные
  if (mb.c > 0.55) { s += 0.5; reasons.push('body'); }
  return { s, reasons };
}

function FontPairs({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [metrics, setMetrics] = useState({});
  const [done, setDone] = useState(0);
  const [heading, setHeading] = useState('');
  const [copied, setCopied] = useState('');
  const [swapped, setSwapped] = useState({});

  // Грузим подмножества пачками и меряем.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < FONTS.length; i += 8) {
        const batch = FONTS.slice(i, i + 8);
        await Promise.all(batch.map(([fam]) => addCss(cssUrl(fam, `&text=${encodeURIComponent(PROBE)}`)))); // eslint-disable-line no-await-in-loop
        // fonts.load возвращает реально загруженные начертания; пустой список — шрифт недоступен
        // (fonts.check для неизвестного семейства честно не скажет, мерили бы запасной шрифт).
        const loaded = await Promise.all(batch.map(([fam]) => document.fonts.load(`40px '${fam}'`, PROBE).then((l) => l.length > 0).catch(() => false))); // eslint-disable-line no-await-in-loop
        if (cancelled) return;
        const add = {};
        batch.forEach(([fam], k) => { if (loaded[k]) add[fam] = measure(fam); });
        setMetrics((m) => ({ ...m, ...add })); setDone((d) => d + batch.length);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pairs = useMemo(() => {
    const list = FONTS.filter(([f]) => metrics[f]).map(([f, cls]) => ({ f, cls, m: metrics[f] }));
    const out = [];
    const heads = heading ? list.filter((x) => x.f === heading) : list.filter((x) => x.cls !== 'mono');
    heads.forEach((a) => list.forEach((b) => { if (a.f !== b.f) { const r = score(a, b); out.push({ a, b, ...r }); } }));
    out.sort((p, q) => q.s - p.s);
    const seen = new Set(); const uniq = [];
    for (const p of out) { const k = heading ? p.b.f : [p.a.f, p.b.f].sort().join('|'); if (!seen.has(k)) { seen.add(k); uniq.push(p); } if (uniq.length >= 10) break; }
    return uniq;
  }, [metrics, heading]);

  // Полные шрифты — только для показанных пар.
  useEffect(() => { pairs.forEach((p) => { addCss(cssUrl(p.a.f, ':wght@400;700')); addCss(cssUrl(p.b.f, ':wght@400;700')); }); }, [pairs]);

  const cls = (c) => (language === 'en' ? CLS_EN[c] : CLS[c]);
  const fam = (f, w) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${w}`;
  const cssFor = (h, b) => `@import url('https://fonts.googleapis.com/css2?${fam(h, '700')}&${fam(b, '400;700')}&display=swap');

h1, h2, h3 { font-family: '${h}', serif; font-weight: 700; }
body { font-family: '${b}', sans-serif; }`;

  return (
    <div className="tool-panel font-pairs">
      <div className="tool-controls">
        <label className="tool-field"><span className="tool-field-label">{t.heading}</span>
          <select className="cb-select" value={heading} onChange={(e) => setHeading(e.target.value)}>
            <option value="">{t.any}</option>
            {FONTS.map(([f, c]) => <option key={f} value={f}>{f} · {cls(c)}</option>)}
          </select>
        </label>
        {done < FONTS.length && <span className="tool-local-note">⏳ {t.measuring(done, FONTS.length)}</span>}
      </div>
      <h3 className="pe-h">{t.pairs}</h3>
      <div className="fp-list">
        {pairs.map((p) => {
          const key = `${p.a.f}|${p.b.f}`; const sw = swapped[key];
          const h = sw ? p.b : p.a; const b = sw ? p.a : p.b;
          return (
            <div key={key} className="fp-card">
              <div className="fp-spec">
                <div style={{ fontFamily: `'${h.f}'`, fontWeight: 700 }} className="fp-h">{t.h}</div>
                <div style={{ fontFamily: `'${b.f}'` }} className="fp-p">{t.p}</div>
              </div>
              <div className="fp-meta">
                <b>{h.f}</b> <em>{cls(h.cls)}</em> + <b>{b.f}</b> <em>{cls(b.cls)}</em>
                <span className="fp-why">{t.why}: {p.reasons.map((r) => t.r[r]).join(' · ') || '—'}</span>
                <span className="fp-num">{t.xh} {h.m.x.toFixed(2)} / {b.m.x.toFixed(2)} · {t.w} {h.m.w.toFixed(2)} / {b.m.w.toFixed(2)} · {t.c} {h.m.c.toFixed(2)} / {b.m.c.toFixed(2)}</span>
                <div className="tool-actions">
                  <button type="button" className="tool-btn small" onClick={() => setSwapped((s) => ({ ...s, [key]: !s[key] }))}>⇅ {t.swap}</button>
                  <button type="button" className="tool-btn small" onClick={() => navigator.clipboard?.writeText(cssFor(h.f, b.f)).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1200); })}>{copied === key ? `✓ ${t.copied}` : t.css}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="tool-local-note">ℹ️ {t.note}</p>
    </div>
  );
}

export default FontPairs;
