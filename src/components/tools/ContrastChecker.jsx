import { useMemo, useState } from 'react';
import { APCA_LEVELS, apcaLc, fixColor, normalizeHex, wcag } from '../../utils/contrast';

// Проверка контраста текста и фона: WCAG 2.x (AA/AAA) и APCA (Lc, черновик WCAG 3).
// Авто-исправление: минимально сдвигаем светлоту текста или фона в OKLCH, сохраняя
// тон, — пока не пройдёт выбранная цель. Чистая математика, локально.

const TEXT = {
  ru: {
    fg: 'Цвет текста', bg: 'Цвет фона', ratio: 'WCAG 2', preview: 'Пример текста',
    sample: 'Дизайн, который работает', sampleSmall: 'Мелкий текст для проверки читаемости',
    normal: 'Обычный текст', large: 'Крупный текст (18pt+ / 14pt жирный)',
    swap: 'Поменять местами', pass: 'проходит', fail: 'не проходит',
    apca: 'APCA Lc', apcaHint: 'APCA точнее оценивает тёмные темы и тонкие шрифты. Знак: «+» — тёмный текст на светлом, «−» — светлый на тёмном.',
    fixTitle: 'Исправить автоматически', fixText: 'Подобрать текст', fixBg: 'Подобрать фон', apply: 'Применить',
    target: 'Цель', already: 'Уже проходит', impossible: 'Недостижимо даже с чёрным/белым',
    hint: 'AA — минимум для сайтов, AAA — повышенная доступность. Исправление двигает только светлоту в OKLCH: тон и насыщенность сохраняются.',
  },
  en: {
    fg: 'Text color', bg: 'Background', ratio: 'WCAG 2', preview: 'Preview',
    sample: 'Design that works', sampleSmall: 'Small text to check readability',
    normal: 'Normal text', large: 'Large text (18pt+ / 14pt bold)',
    swap: 'Swap', pass: 'passes', fail: 'fails',
    apca: 'APCA Lc', apcaHint: 'APCA is more accurate for dark themes and thin fonts. Sign: “+” is dark text on light, “−” is light on dark.',
    fixTitle: 'Auto-fix', fixText: 'Fix text', fixBg: 'Fix background', apply: 'Apply',
    target: 'Target', already: 'Already passes', impossible: 'Not reachable even with black/white',
    hint: 'AA is the minimum for websites, AAA is enhanced accessibility. The fix only moves lightness in OKLCH: hue and chroma are kept.',
  },
};

const TARGETS = [
  { id: 'aa', metric: 'wcag', target: 4.5, label: 'WCAG AA 4.5' },
  { id: 'aaa', metric: 'wcag', target: 7, label: 'WCAG AAA 7' },
  { id: 'aaL', metric: 'wcag', target: 3, label: 'AA large 3' },
  { id: 'lc75', metric: 'apca', target: 75, label: 'APCA Lc 75' },
  { id: 'lc60', metric: 'apca', target: 60, label: 'APCA Lc 60' },
];

function Badge({ ok, label, level }) {
  return (
    <span className={ok ? 'cc-badge ok' : 'cc-badge fail'}>
      {level}: {ok ? '✓' : '✕'} <em>{label}</em>
    </span>
  );
}

function ContrastChecker({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [fg, setFg] = useState('#0d0d11');
  const [bg, setBg] = useState('#f5f7fb');
  const [targetId, setTargetId] = useState('aa');

  const fgHex = normalizeHex(fg);
  const bgHex = normalizeHex(bg);
  const ratio = useMemo(() => (fgHex && bgHex ? wcag(fgHex, bgHex) : null), [fgHex, bgHex]);
  const lc = useMemo(() => (fgHex && bgHex ? apcaLc(fgHex, bgHex) : null), [fgHex, bgHex]);
  const tg = TARGETS.find((x) => x.id === targetId);
  const fixes = useMemo(() => {
    if (!fgHex || !bgHex) return null;
    return { text: fixColor(fgHex, bgHex, tg), bg: fixColor(bgHex, fgHex, tg) };
  }, [fgHex, bgHex, tg]);

  const r = ratio || 0;
  const checks = { aaNormal: r >= 4.5, aaLarge: r >= 3, aaaNormal: r >= 7, aaaLarge: r >= 4.5 };
  const absLc = Math.abs(lc || 0);
  const passedLevel = APCA_LEVELS.find((l) => absLc >= l.lc);

  const fixCard = (kind, fix, apply) => (
    <div className="cc-fix">
      <span className="tool-field-label">{kind === 'text' ? t.fixText : t.fixBg}</span>
      {fix.dL === 0 ? <span className="cc-fix-ok">✓ {t.already}</span> : (
        <>
          <span className="cc-fix-pair">
            <i style={{ background: kind === 'text' ? fgHex : bgHex }} /> → <i style={{ background: fix.hex }} />
            <code>{fix.hex}</code>
          </span>
          {!fix.ok && <span className="color-invalid">{t.impossible}</span>}
          <button type="button" className="tool-btn small" onClick={apply}>{t.apply}</button>
        </>
      )}
    </div>
  );

  return (
    <div className="tool-panel contrast-checker">
      <div className="cc-inputs">
        <div className="tool-field">
          <span className="tool-field-label">{t.fg}</span>
          <div className="cc-color-row">
            <input type="color" value={fgHex || '#000000'} onChange={(e) => setFg(e.target.value)} />
            <input type="text" value={fg} spellCheck={false} onChange={(e) => setFg(e.target.value)} />
          </div>
        </div>
        <button type="button" className="tool-btn small cc-swap" onClick={() => { setFg(bg); setBg(fg); }} title={t.swap}>⇅</button>
        <div className="tool-field">
          <span className="tool-field-label">{t.bg}</span>
          <div className="cc-color-row">
            <input type="color" value={bgHex || '#ffffff'} onChange={(e) => setBg(e.target.value)} />
            <input type="text" value={bg} spellCheck={false} onChange={(e) => setBg(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="cc-scores">
        <div className="cc-ratio">
          <span className="cc-ratio-value">{ratio ? ratio.toFixed(2) : '—'}</span>
          <span className="cc-ratio-label">{t.ratio}</span>
        </div>
        <div className="cc-ratio">
          <span className="cc-ratio-value">{lc != null ? `${lc > 0 ? '+' : ''}${lc.toFixed(1)}` : '—'}</span>
          <span className="cc-ratio-label">{t.apca}{passedLevel ? ` · ${passedLevel[language] || passedLevel.ru}` : ''}</span>
        </div>
      </div>

      <div className="cc-preview" style={{ background: bgHex || '#fff', color: fgHex || '#000' }}>
        <p className="cc-preview-large">{t.sample}</p>
        <p className="cc-preview-small">{t.sampleSmall}</p>
      </div>

      <div className="cc-grid">
        <div className="cc-grid-col">
          <span className="cc-grid-title">{t.normal}</span>
          <Badge ok={checks.aaNormal} label={checks.aaNormal ? t.pass : t.fail} level="AA" />
          <Badge ok={checks.aaaNormal} label={checks.aaaNormal ? t.pass : t.fail} level="AAA" />
        </div>
        <div className="cc-grid-col">
          <span className="cc-grid-title">{t.large}</span>
          <Badge ok={checks.aaLarge} label={checks.aaLarge ? t.pass : t.fail} level="AA" />
          <Badge ok={checks.aaaLarge} label={checks.aaaLarge ? t.pass : t.fail} level="AAA" />
        </div>
        <div className="cc-grid-col">
          <span className="cc-grid-title">APCA</span>
          {APCA_LEVELS.slice(0, 4).map((l) => <Badge key={l.lc} ok={absLc >= l.lc} label={l[language] || l.ru} level={`Lc ${l.lc}`} />)}
        </div>
      </div>

      <h3 className="pe-h">{t.fixTitle}</h3>
      <div className="tool-field">
        <span className="tool-field-label">{t.target}</span>
        <div className="segmented cc-targets">
          {TARGETS.map((x) => <button key={x.id} type="button" className={targetId === x.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTargetId(x.id)}>{x.label}</button>)}
        </div>
      </div>
      {fixes && (
        <div className="cc-fixes">
          {fixCard('text', fixes.text, () => setFg(fixes.text.hex))}
          {fixCard('bg', fixes.bg, () => setBg(fixes.bg.hex))}
        </div>
      )}

      <p className="tool-local-note">ℹ️ {t.hint}</p>
      <p className="tool-local-note">ℹ️ {t.apcaHint}</p>
    </div>
  );
}

export default ContrastChecker;
