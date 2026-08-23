import { useMemo, useState } from 'react';

// Проверка контраста текста и фона по WCAG 2.1. Чистая математика, локально.

const TEXT = {
  ru: {
    fg: 'Цвет текста', bg: 'Цвет фона', ratio: 'Контраст', preview: 'Пример текста',
    sample: 'Дизайн, который работает', sampleSmall: 'Мелкий текст для проверки читаемости',
    normal: 'Обычный текст', large: 'Крупный текст (18pt+ / 14pt жирный)',
    swap: 'Поменять местами', pass: 'проходит', fail: 'не проходит',
    hint: 'AA — минимум для сайтов, AAA — повышенная доступность.',
  },
  en: {
    fg: 'Text color', bg: 'Background', ratio: 'Contrast', preview: 'Preview',
    sample: 'Design that works', sampleSmall: 'Small text to check readability',
    normal: 'Normal text', large: 'Large text (18pt+ / 14pt bold)',
    swap: 'Swap', pass: 'passes', fail: 'fails',
    hint: 'AA is the minimum for websites, AAA is enhanced accessibility.',
  },
};

function normalizeHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : null;
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

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

  const fgHex = normalizeHex(fg);
  const bgHex = normalizeHex(bg);

  const ratio = useMemo(() => {
    if (!fgHex || !bgHex) return null;
    const l1 = luminance(fgHex); const l2 = luminance(bgHex);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }, [fgHex, bgHex]);

  const r = ratio || 0;
  const checks = {
    aaNormal: r >= 4.5,
    aaLarge: r >= 3,
    aaaNormal: r >= 7,
    aaaLarge: r >= 4.5,
  };

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

      <div className="cc-ratio">
        <span className="cc-ratio-value">{ratio ? ratio.toFixed(2) : '—'}</span>
        <span className="cc-ratio-label">{t.ratio}</span>
      </div>

      <div
        className="cc-preview"
        style={{ background: bgHex || '#fff', color: fgHex || '#000' }}
      >
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
      </div>

      <p className="tool-local-note">ℹ️ {t.hint}</p>
    </div>
  );
}

export default ContrastChecker;
