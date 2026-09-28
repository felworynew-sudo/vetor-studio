import { useRef, useState } from 'react';
import { optimize } from 'svgo/browser';

// Очиститель/оптимизатор SVG на движке SVGO (браузерная сборка — работает
// полностью локально, ничего не отправляется на сервер). Три режима: от
// простой чистки мусора до агрессивной оптимизации геометрии.

const TEXT = {
  ru: {
    paste: 'Вставьте код SVG сюда…', upload: 'Загрузить .svg', clean: 'Очистить',
    copy: 'Копировать', copied: 'Скопировано', download: 'Скачать', clear: 'Очистить поле',
    saved: 'Экономия', before: 'Было', after: 'Стало', empty: 'Вставьте SVG или загрузите файл',
    hint: 'Работает на SVGO прямо в браузере — комментарии, метаданные, редакторский мусор и (в режимах оптимизации) геометрия path.',
    invalid: 'Не похоже на корректный SVG',
    modeSafe: 'Безопасная очистка', modeOptimize: 'Оптимизация', modeAggressive: 'Агрессивная',
    modeSafeHint: 'Только мусор: комментарии, метаданные, редакторские атрибуты. Геометрия не трогается.',
    modeOptimizeHint: 'Плюс SVGO preset-default: округление чисел, объединение путей, чистка ID — стандартная оптимизация.',
    modeAggressiveHint: 'Плюс жёсткое округление и удаление width/height (остаётся viewBox) — максимальная экономия.',
  },
  en: {
    paste: 'Paste your SVG code here…', upload: 'Upload .svg', clean: 'Clean',
    copy: 'Copy', copied: 'Copied', download: 'Download', clear: 'Clear field',
    saved: 'Saved', before: 'Before', after: 'After', empty: 'Paste SVG or upload a file',
    hint: 'Runs on SVGO right in your browser — comments, metadata, editor junk, and (in optimize modes) path geometry.',
    invalid: 'Does not look like valid SVG',
    modeSafe: 'Safe cleanup', modeOptimize: 'Optimize', modeAggressive: 'Aggressive',
    modeSafeHint: 'Junk only: comments, metadata, editor attributes. Geometry stays untouched.',
    modeOptimizeHint: 'Plus SVGO preset-default: number rounding, path merging, ID cleanup — standard optimization.',
    modeAggressiveHint: 'Plus tighter rounding and dropping width/height (viewBox stays) — maximum savings.',
  },
};

// Три пресета плагинов SVGO. safe — не трогает геометрию, только мусор
// редакторов (Figma/Illustrator/Inkscape). optimize — стандартный preset-default.
// aggressive — preset-default с более жёстким округлением + без width/height.
function pluginsFor(mode) {
  if (mode === 'safe') {
    return [
      'removeDoctype', 'removeXMLProcInst', 'removeComments', 'removeMetadata',
      'removeEditorsNSData', 'removeEmptyAttrs', 'removeEmptyContainers', 'removeUselessDefs',
    ];
  }
  if (mode === 'aggressive') {
    return [
      {
        name: 'preset-default',
        params: {
          overrides: {
            cleanupNumericValues: { floatPrecision: 1 },
            convertPathData: { floatPrecision: 1 },
          },
        },
      },
      'removeDimensions',
    ];
  }
  return ['preset-default'];
}

// SVGO не считает чужеродные (не-SVG) элементы вроде sodipodi:namedview
// «пустым контейнером» и не трогает их — досатываем руками для паритета
// со старым клинером (это всегда мусор редактора, полезной геометрии нет).
function stripForeignJunk(svg) {
  return svg.replace(/<sodipodi:namedview\b[^>]*\/>/g, '').replace(/<sodipodi:namedview\b[^>]*>[\s\S]*?<\/sodipodi:namedview>/g, '');
}

function cleanSvg(input, mode) {
  try {
    const result = optimize(input, { multipass: mode !== 'safe', plugins: pluginsFor(mode) });
    if (result.error) return null;
    return stripForeignJunk(result.data);
  } catch {
    return null;
  }
}

function bytes(str) {
  return new Blob([str]).size;
}
function fmt(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function SvgCleaner({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState('optimize');

  function run(value = raw, m = mode) {
    if (!value.trim()) { setCleaned(''); setError(''); return; }
    const result = cleanSvg(value, m);
    if (!result) { setError(t.invalid); setCleaned(''); return; }
    setError('');
    setCleaned(result);
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setRaw(reader.result); run(reader.result); };
    reader.readAsText(file);
  }

  function copy() {
    if (navigator.clipboard && cleaned) {
      navigator.clipboard.writeText(cleaned).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }).catch(() => {});
    }
  }

  function download() {
    if (!cleaned) return;
    const blob = new Blob([cleaned], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cleaned.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  const beforeSize = bytes(raw);
  const afterSize = bytes(cleaned);
  const saved = beforeSize > 0 && afterSize > 0 ? Math.round((1 - afterSize / beforeSize) * 100) : 0;
  const modeHint = mode === 'safe' ? t.modeSafeHint : mode === 'aggressive' ? t.modeAggressiveHint : t.modeOptimizeHint;

  return (
    <div className="tool-panel svg-cleaner">
      <div className="segmented svgc-modes">
        <button type="button" className={mode === 'safe' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => { setMode('safe'); if (raw) run(raw, 'safe'); }}>{t.modeSafe}</button>
        <button type="button" className={mode === 'optimize' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => { setMode('optimize'); if (raw) run(raw, 'optimize'); }}>{t.modeOptimize}</button>
        <button type="button" className={mode === 'aggressive' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => { setMode('aggressive'); if (raw) run(raw, 'aggressive'); }}>{t.modeAggressive}</button>
      </div>
      <p className="tool-local-note svgc-mode-hint">{modeHint}</p>

      <div className="tool-actions">
        <button type="button" className="tool-btn" onClick={() => inputRef.current?.click()}>{t.upload}</button>
        <button type="button" className="tool-btn primary" onClick={() => run()}>{t.clean}</button>
        {raw && <button type="button" className="tool-btn ghost" onClick={() => { setRaw(''); setCleaned(''); setError(''); }}>{t.clear}</button>}
      </div>

      <textarea
        className="svgc-input"
        placeholder={t.paste}
        value={raw}
        spellCheck={false}
        onChange={(e) => setRaw(e.target.value)}
      />

      {error && <p className="color-invalid">{error}</p>}

      {cleaned && (
        <>
          <div className="svgc-stats">
            <span>{t.before}: <strong>{fmt(beforeSize)}</strong></span>
            <span className="convert-arrow">→</span>
            <span>{t.after}: <strong>{fmt(afterSize)}</strong></span>
            {saved > 0 && <span className="convert-delta">({t.saved} {saved}%)</span>}
          </div>
          <textarea className="svgc-output" readOnly value={cleaned} spellCheck={false} />
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
            <button type="button" className="tool-btn" onClick={download}>{t.download}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default SvgCleaner;
