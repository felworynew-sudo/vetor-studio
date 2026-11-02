import { useEffect, useMemo, useRef, useState } from 'react';
import { extractPalette, imageToData } from '../../utils/paletteEngine';
import { deltaOK, rgbToOklab } from '../../utils/oklab';

// Анализатор цветового веса: доли цветов на макете и проверка правила 60-30-10.
// Роли считаются по смыслу, а не по порядку: доминанта — самая большая масса,
// акцент — самый насыщенный цвет, заметно отличный от доминанты, дополнительный —
// крупнейший из остальных; прочие оттенки присоединяются к ближайшей роли.
// Клик по цвету или роли — маска: где этот цвет лежит на макете. Локально в <canvas>.

const TEXT = {
  ru: {
    drop: 'Загрузите макет или изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    change: 'Другое изображение', dominant: 'Доминанта', secondary: 'Дополнительный', accent: 'Акцент',
    roles: 'Роли по правилу 60-30-10', colors: 'Цвета на макете', target: 'цель',
    rule: 'Правило 60-30-10: ~60% основной цвет, ~30% дополнительный, ~10% акцент.', copied: 'Скопировано',
    maskHint: 'Нажмите на цвет или роль — на макете останется только он.', showAll: 'Показать всё',
    pass: 'Соответствует 60-30-10', near: 'Почти соответствует', fail: 'Перекос в пропорциях',
    domLow: (p) => `Доминанта ${p}% — маловато: у макета нет спокойной «базы», глазу не на чем отдохнуть.`,
    domHigh: (p) => `Доминанта ${p}% — слишком много: макет выглядит пустым или однообразным.`,
    secLow: (p) => `Дополнительного ${p}% — мало: не хватает второго плана, макет «плоский».`,
    secHigh: (p) => `Дополнительного ${p}% — много: он спорит с доминантой.`,
    accLow: (p) => `Акцента ${p}% — почти незаметен: важным элементам не хватает выделения.`,
    accHigh: (p) => `Акцента ${p}% — перебор: он перестаёт выделять главное и утомляет.`,
    noAcc: 'Нет выраженного акцента — все цвета спокойные. Добавьте один насыщенный цвет для кнопок и главного.',
    good: 'Пропорции сбалансированы: база, второй план и акцент читаются.',
  },
  en: {
    drop: 'Upload a design or image', hint: 'PNG, JPG, WebP — processed locally',
    change: 'Another image', dominant: 'Dominant', secondary: 'Secondary', accent: 'Accent',
    roles: '60-30-10 roles', colors: 'Colors in the design', target: 'target',
    rule: 'The 60-30-10 rule: ~60% main, ~30% secondary, ~10% accent.', copied: 'Copied',
    maskHint: 'Click a color or a role to see only it on the design.', showAll: 'Show all',
    pass: 'Follows 60-30-10', near: 'Almost there', fail: 'Proportions are off',
    domLow: (p) => `Dominant is ${p}% — too little: the design has no calm base to rest the eye.`,
    domHigh: (p) => `Dominant is ${p}% — too much: the design looks empty or monotonous.`,
    secLow: (p) => `Secondary is ${p}% — too little: no supporting layer, the design feels flat.`,
    secHigh: (p) => `Secondary is ${p}% — too much: it competes with the dominant color.`,
    accLow: (p) => `Accent is ${p}% — barely visible: key elements lack emphasis.`,
    accHigh: (p) => `Accent is ${p}% — too much: it stops highlighting what matters and tires the eye.`,
    noAcc: 'No clear accent — every color is calm. Add one saturated color for buttons and key elements.',
    good: 'Balanced proportions: base, supporting layer and accent all read clearly.',
  },
};

const ROLE_KEYS = ['dominant', 'secondary', 'accent'];
const TARGET = { dominant: 60, secondary: 30, accent: 10 };
const RANGE = { dominant: [50, 75], secondary: [18, 40], accent: [4, 16] };
const ROLE_TINT = { dominant: '#6166ff', secondary: '#3ec98a', accent: '#ff5c63' };

// Цвета палитры → роли. Возвращает { roleOf: Map(color → роль), share: { роль: % } }.
function assignRoles(colors) {
  const roleOf = new Map();
  if (!colors.length) return { roleOf, share: {}, hasAccent: false };
  const [dom, ...rest] = colors;
  roleOf.set(dom, 'dominant');
  const vivid = rest.filter((c) => c.C > 0.07 && deltaOK(c.lab, dom.lab) > 0.1);
  // второй по массе цвет считаем акцентом, только если он и правда мал
  const pool = vivid.filter((c) => c !== rest[0] || c.pct < 15 || rest.length === 1);
  const accent = pool.reduce((a, c) => (!a || c.C * Math.sqrt(c.pct) > a.C * Math.sqrt(a.pct) ? c : a), null);
  if (accent) roleOf.set(accent, 'accent');
  const secondary = rest.find((c) => c !== accent);
  if (secondary) roleOf.set(secondary, 'secondary');
  const anchors = [...roleOf.entries()];
  rest.filter((c) => !roleOf.has(c)).forEach((c) => {
    let best = anchors[0]; let bd = Infinity;
    anchors.forEach(([a, r]) => { const d = deltaOK(a.lab, c.lab); if (d < bd) { bd = d; best = [a, r]; } });
    roleOf.set(c, best[1]);
  });
  const share = { dominant: 0, secondary: 0, accent: 0 };
  colors.forEach((c) => { share[roleOf.get(c)] += c.pct; });
  return { roleOf, share, hasAccent: !!accent };
}

function verdict(share, hasAccent, t) {
  const r = (k) => Math.round(share[k] || 0);
  const notes = []; let off = 0;
  const check = (k, low, high) => {
    const v = r(k); const [a, b] = RANGE[k];
    if (v < a) { notes.push(low(v)); off += (a - v) / a; } else if (v > b) { notes.push(high(v)); off += (v - b) / b; }
  };
  check('dominant', t.domLow, t.domHigh);
  check('secondary', t.secLow, t.secHigh);
  if (!hasAccent) { notes.push(t.noAcc); off += 1; } else check('accent', t.accLow, t.accHigh);
  const level = !notes.length ? 'pass' : off < 0.5 ? 'near' : 'fail';
  return { level, notes: notes.length ? notes : [t.good] };
}

function ColorWeight({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [colors, setColors] = useState([]);
  const [copied, setCopied] = useState('');
  const [focus, setFocus] = useState(null); // { kind: 'color'|'role', value }

  const { roleOf, share, hasAccent } = useMemo(() => assignRoles(colors), [colors]);
  const v = useMemo(() => verdict(share, hasAccent, t), [share, hasAccent, t]);

  // Карта «пиксель → индекс цвета палитры» для масок (≤480 px по длинной стороне).
  const labels = useMemo(() => {
    if (!img || !colors.length) return null;
    const data = imageToData(img, 480);
    const lab = colors.map((c) => c.lab);
    const idx = new Uint8Array(data.width * data.height);
    for (let i = 0; i < idx.length; i += 1) {
      const p = rgbToOklab(data.data[i * 4], data.data[i * 4 + 1], data.data[i * 4 + 2]);
      let best = 0; let bd = Infinity;
      for (let k = 0; k < lab.length; k += 1) { const d = deltaOK(p, lab[k]); if (d < bd) { bd = d; best = k; } }
      idx[i] = best;
    }
    return { data, idx };
  }, [img, colors]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !labels) return;
    const { data, idx } = labels;
    cv.width = data.width; cv.height = data.height;
    const out = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
    if (focus) {
      const keep = colors.map((c) => (focus.kind === 'color' ? c.hex === focus.value : roleOf.get(c) === focus.value));
      for (let i = 0; i < idx.length; i += 1) {
        if (keep[idx[i]]) continue;
        const o = i * 4; const g = (out.data[o] * 0.3 + out.data[o + 1] * 0.59 + out.data[o + 2] * 0.11) * 0.25 + 20;
        out.data[o] = g; out.data[o + 1] = g; out.data[o + 2] = g + 6;
      }
    }
    cv.getContext('2d').putImageData(out, 0, 0);
  }, [labels, focus, colors, roleOf]);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el); setFocus(null);
      setColors(extractPalette(imageToData(el, 220), 8).colors);
      URL.revokeObjectURL(url);
    };
    el.src = url;
  }

  function copy(hex) {
    navigator.clipboard?.writeText(hex).then(() => { setCopied(hex); setTimeout(() => setCopied(''), 1200); }).catch(() => {});
  }
  const toggle = (kind, value) => setFocus((f) => (f && f.kind === kind && f.value === value ? null : { kind, value }));

  return (
    <div className="tool-panel color-weight">
      {!img ? (
        <button
          type="button"
          className="tool-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
        >
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="cw-layout">
          <div className="cw-left">
            <canvas ref={canvasRef} className="cw-canvas" />
            <div className="tool-actions">
              {focus && <button type="button" className="tool-btn small" onClick={() => setFocus(null)}>{t.showAll}</button>}
              <button type="button" className="tool-btn small ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
            <p className="tool-local-note">{t.maskHint}</p>
          </div>

          <div className="cw-right">
            <div className={`cw-verdict is-${v.level}`}>
              <strong>{v.level === 'pass' ? `✓ ${t.pass}` : v.level === 'near' ? `≈ ${t.near}` : `⚠ ${t.fail}`}</strong>
              <ul>{v.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>

            <span className="tool-field-label">{t.roles}</span>
            <div className="cw-roles">
              {ROLE_KEYS.map((k) => {
                const p = Math.round(share[k] || 0);
                const sw = colors.filter((c) => roleOf.get(c) === k);
                return (
                  <button key={k} type="button" className={focus?.kind === 'role' && focus.value === k ? 'cw-role-row is-active' : 'cw-role-row'} onClick={() => toggle('role', k)}>
                    <span className="cw-role-name"><i style={{ background: ROLE_TINT[k] }} />{t[k]}</span>
                    <span className="cw-role-track">
                      <span className="cw-role-fill" style={{ width: `${Math.min(100, p)}%`, background: sw[0]?.hex || '#555' }} />
                      <span className="cw-role-target" style={{ left: `${TARGET[k]}%` }} title={`${t.target} ${TARGET[k]}%`} />
                    </span>
                    <span className="cw-pct">{p}%</span>
                  </button>
                );
              })}
            </div>

            <span className="tool-field-label">{t.colors}</span>
            <div className="cw-bar">
              {colors.map((c) => (
                <button key={c.hex} type="button" className="cw-bar-seg" style={{ width: `${c.pct}%`, background: c.hex }} title={`${c.hex} ${Math.round(c.pct)}%`} onClick={() => toggle('color', c.hex)} />
              ))}
            </div>
            <ul className="cw-list">
              {colors.map((c) => (
                <li key={c.hex} className={focus?.kind === 'color' && focus.value === c.hex ? 'cw-row is-active' : 'cw-row'}>
                  <button type="button" className="cw-swatch" style={{ background: c.hex }} aria-label={c.hex} onClick={() => toggle('color', c.hex)} />
                  <button type="button" className="cw-hex" onClick={() => copy(c.hex)}>{copied === c.hex ? `✓ ${t.copied}` : c.hex.toUpperCase()}</button>
                  <span className="cw-role" style={{ color: ROLE_TINT[roleOf.get(c)] }}>{t[roleOf.get(c)]}</span>
                  <span className="cw-pct">{Math.round(c.pct)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">📊 {t.rule}</p>
    </div>
  );
}

export default ColorWeight;
