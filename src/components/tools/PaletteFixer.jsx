import { useMemo, useState } from 'react';
import { apcaLc, fixColor, normalizeHex, wcag } from '../../utils/contrast';

// Accessible Palette Fixer: не просто проверка контраста, а автоматическое
// минимальное исправление всей палитры до WCAG/APCA на выбранном фоне — светлота
// двигается в OKLCH, тон сохраняется. Плюс матрица контраста всех пар палитры.

const TEXT = {
  ru: {
    palette: 'Палитра (HEX через пробел, запятую или с новой строки)', bg: 'Фон', target: 'Цель',
    tabFix: 'Исправить под фон', tabMatrix: 'Матрица пар', before: 'Было', after: 'Стало', ok: 'уже проходит',
    copyCss: 'Копировать CSS', copyHex: 'Копировать HEX', copied: 'Скопировано', shift: 'сдвиг L',
    matrixHint: 'Строка — текст, столбец — фон. Зелёные ячейки проходят выбранную цель.',
    note: 'Исправление меняет только светлоту (OKLCH L) и ровно настолько, насколько нужно, — бренд-цвета остаются узнаваемыми.',
  },
  en: {
    palette: 'Palette (HEX separated by spaces, commas or new lines)', bg: 'Background', target: 'Target',
    tabFix: 'Fix for background', tabMatrix: 'Pair matrix', before: 'Before', after: 'After', ok: 'already passes',
    copyCss: 'Copy CSS', copyHex: 'Copy HEX', copied: 'Copied', shift: 'L shift',
    matrixHint: 'Row is text, column is background. Green cells pass the chosen target.',
    note: 'The fix changes only lightness (OKLCH L) and only as much as needed — brand colors stay recognizable.',
  },
};

const TARGETS = [
  { id: 'aa', metric: 'wcag', target: 4.5, label: 'WCAG AA 4.5' },
  { id: 'aaL', metric: 'wcag', target: 3, label: 'AA large / UI 3' },
  { id: 'aaa', metric: 'wcag', target: 7, label: 'WCAG AAA 7' },
  { id: 'lc75', metric: 'apca', target: 75, label: 'APCA Lc 75' },
  { id: 'lc60', metric: 'apca', target: 60, label: 'APCA Lc 60' },
  { id: 'lc45', metric: 'apca', target: 45, label: 'APCA Lc 45' },
];

function parsePalette(text) {
  return [...new Set((text.match(/#?[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(normalizeHex).filter(Boolean))];
}

function PaletteFixer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [text, setText] = useState('#6166ff #ff5c63 #3ec98a #f5c84c #75d0ff #b277ff #8a8f98');
  const [bg, setBg] = useState('#ffffff');
  const [targetId, setTargetId] = useState('aa');
  const [tab, setTab] = useState('fix');
  const [copied, setCopied] = useState('');
  const tg = TARGETS.find((x) => x.id === targetId);
  const colors = useMemo(() => parsePalette(text), [text]);
  const bgHex = normalizeHex(bg) || '#ffffff';
  const score = (a, b) => (tg.metric === 'apca' ? Math.abs(apcaLc(a, b)) : wcag(a, b));
  const fmt = (v) => (tg.metric === 'apca' ? `Lc ${v.toFixed(0)}` : `${v.toFixed(2)}:1`);

  const rows = useMemo(() => colors.map((c) => ({ c, before: score(c, bgHex), fix: fixColor(c, bgHex, tg) })), [colors, bgHex, tg]); // eslint-disable-line react-hooks/exhaustive-deps

  function copy(kind) {
    const out = kind === 'css'
      ? `:root {\n${rows.map((r, i) => `  --color-${i + 1}: ${r.fix.hex};`).join('\n')}\n}`
      : rows.map((r) => r.fix.hex).join(' ');
    navigator.clipboard?.writeText(out).then(() => { setCopied(kind); setTimeout(() => setCopied(''), 1200); }).catch(() => {});
  }

  return (
    <div className="tool-panel palette-fixer">
      <label className="tool-field"><span className="tool-field-label">{t.palette}</span>
        <textarea className="pf-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} /></label>
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.bg}</span>
          <div className="cc-color-row">
            <input type="color" value={bgHex} onChange={(e) => setBg(e.target.value)} />
            <input type="text" value={bg} onChange={(e) => setBg(e.target.value)} spellCheck={false} />
            {['#ffffff', '#f5f5f7', '#121212', '#000000'].map((c) => <button key={c} type="button" className="pf-bgchip" style={{ background: c }} onClick={() => setBg(c)} title={c} />)}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.target}</span>
          <div className="segmented cc-targets">
            {TARGETS.map((x) => <button key={x.id} type="button" className={targetId === x.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTargetId(x.id)}>{x.label}</button>)}
          </div>
        </div>
      </div>

      <div className="segmented pf-tabs">
        <button type="button" className={tab === 'fix' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('fix')}>{t.tabFix}</button>
        <button type="button" className={tab === 'matrix' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('matrix')}>{t.tabMatrix}</button>
      </div>

      {tab === 'fix' ? (
        <>
          <div className="pf-rows" style={{ background: bgHex }}>
            {rows.map((r) => (
              <div key={r.c} className="pf-row">
                <span className="pf-sample" style={{ color: r.c }}>Aa {t.before}</span>
                <span className="pf-val">{r.c} · {fmt(r.before)}</span>
                <span className="pf-arrow">→</span>
                <span className="pf-sample" style={{ color: r.fix.hex }}>Aa {t.after}</span>
                <span className="pf-val">{r.fix.dL === 0 ? `✓ ${t.ok}` : `${r.fix.hex} · ${fmt(r.fix.score)} · ${t.shift} ${(r.fix.dL * 100).toFixed(1)}%`}</span>
              </div>
            ))}
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => copy('css')}>{copied === 'css' ? `✓ ${t.copied}` : t.copyCss}</button>
            <button type="button" className="tool-btn" onClick={() => copy('hex')}>{copied === 'hex' ? `✓ ${t.copied}` : t.copyHex}</button>
          </div>
        </>
      ) : (
        <>
          <div className="pf-matrix-wrap">
            <table className="pf-matrix">
              <thead><tr><th />{colors.map((c) => <th key={c}><i style={{ background: c }} /></th>)}</tr></thead>
              <tbody>
                {colors.map((fg) => (
                  <tr key={fg}>
                    <th><i style={{ background: fg }} /></th>
                    {colors.map((b) => {
                      if (fg === b) return <td key={b} className="is-self">—</td>;
                      const v = score(fg, b);
                      return <td key={b} className={v >= tg.target ? 'is-pass' : 'is-fail'} style={{ background: b, color: fg }}>{tg.metric === 'apca' ? v.toFixed(0) : v.toFixed(1)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tool-local-note">{t.matrixHint}</p>
        </>
      )}
      <p className="tool-local-note">ℹ️ {t.note}</p>
    </div>
  );
}

export default PaletteFixer;
