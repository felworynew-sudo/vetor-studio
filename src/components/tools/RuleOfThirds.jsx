import { useRef, useState } from 'react';

// Правило третей: накладывает композиционную сетку на изображение для поиска
// удачной композиции баннера/кадра. Локально, оверлеем поверх картинки.

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    change: 'Другое', thirds: 'Трети', golden: 'Золотое сечение', diagonals: 'Диагонали', phi: 'Фи-спираль',
    grid: 'Сетка', note: 'Ключевые объекты лучше размещать на линиях и в их пересечениях.',
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally',
    change: 'Another', thirds: 'Thirds', golden: 'Golden ratio', diagonals: 'Diagonals', phi: 'Phi grid',
    grid: 'Grid', note: 'Place key subjects on the lines and at their intersections.',
  },
};

const GRIDS = ['thirds', 'golden', 'diagonals'];

function gridLines(type) {
  if (type === 'thirds') {
    return { v: [1 / 3, 2 / 3], h: [1 / 3, 2 / 3], diag: false };
  }
  if (type === 'golden') {
    return { v: [0.382, 0.618], h: [0.382, 0.618], diag: false };
  }
  return { v: [], h: [], diag: true };
}

function RuleOfThirds({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [preview, setPreview] = useState('');
  const [grid, setGrid] = useState('thirds');

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  const lines = gridLines(grid);

  return (
    <div className="tool-panel rot-tool">
      {!preview ? (
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
        <>
          <div className="tool-field">
            <span className="tool-field-label">{t.grid}</span>
            <div className="segmented">
              {GRIDS.map((g) => (
                <button key={g} type="button" className={g === grid ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setGrid(g)}>{t[g]}</button>
              ))}
            </div>
          </div>

          <div className="rot-canvas">
            <img src={preview} alt="" className="rot-img" />
            <svg className="rot-grid" viewBox="0 0 100 100" preserveAspectRatio="none">
              {lines.v.map((x) => <line key={`v${x}`} x1={x * 100} y1="0" x2={x * 100} y2="100" />)}
              {lines.h.map((y) => <line key={`h${y}`} x1="0" y1={y * 100} x2="100" y2={y * 100} />)}
              {lines.diag && (
                <>
                  <line x1="0" y1="0" x2="100" y2="100" />
                  <line x1="100" y1="0" x2="0" y2="100" />
                  <line x1="50" y1="0" x2="0" y2="50" />
                  <line x1="50" y1="0" x2="100" y2="50" />
                  <line x1="0" y1="50" x2="50" y2="100" />
                  <line x1="100" y1="50" x2="50" y2="100" />
                </>
              )}
              {!lines.diag && lines.v.flatMap((x) => lines.h.map((y) => (
                <circle key={`p${x}-${y}`} cx={x * 100} cy={y * 100} r="1.1" className="rot-point" />
              )))}
            </svg>
          </div>

          <div className="tool-actions">
            <button type="button" className="tool-btn" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">📐 {t.note}</p>
    </div>
  );
}

export default RuleOfThirds;
