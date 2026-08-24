import { useCallback, useEffect, useRef, useState } from 'react';
import { parse } from 'opentype.js';

// Генератор глиф-карт: постер со всеми символами шрифта. Парсинг через
// opentype.js, отрисовка в <canvas>, экспорт PNG. Локально.

const TEXT = {
  ru: {
    drop: 'Загрузите шрифт (TTF, OTF, WOFF)', hint: 'Файл обрабатывается локально, никуда не передаётся',
    cols: 'Столбцов', glyphColor: 'Цвет символов', bg: 'Фон', change: 'Другой шрифт', download: 'Скачать PNG',
    count: 'символов', hint2: 'Красивый постер со всем набором глифов — можно печатать.',
    invalid: 'Не удалось прочитать шрифт',
  },
  en: {
    drop: 'Upload a font (TTF, OTF, WOFF)', hint: 'The file is processed locally and never uploaded',
    cols: 'Columns', glyphColor: 'Glyph color', bg: 'Background', change: 'Another font', download: 'Download PNG',
    count: 'glyphs', hint2: 'A poster with the whole glyph set — printable.',
    invalid: 'Could not read the font',
  },
};

function GlyphMap({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const fontRef = useRef(null);
  const canvasRef = useRef(null);
  const [cols, setCols] = useState(12);
  const [glyphColor, setGlyphColor] = useState('#f5f7fb');
  const [bg, setBg] = useState('#0d0d11');
  const [ready, setReady] = useState(false);
  const [fontName, setFontName] = useState('');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');

  const render = useCallback((font, c, gc, bgc) => {
    const canvas = canvasRef.current;
    if (!font || !canvas) return;
    const cell = 90;
    const fontSize = cell * 0.6;
    const upm = font.unitsPerEm || 1000;
    // Собираем глифы с контурами и юникодом.
    const glyphs = [];
    for (let i = 0; i < font.glyphs.length && glyphs.length < 500; i += 1) {
      const g = font.glyphs.get(i);
      try {
        if (g && g.path && g.path.commands && g.path.commands.length > 0) glyphs.push(g);
      } catch { /* пропускаем битые глифы */ }
    }
    setCount(glyphs.length);
    const rows = Math.ceil(glyphs.length / c) || 1;
    canvas.width = c * cell;
    canvas.height = rows * cell;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgc; ctx.fillRect(0, 0, canvas.width, canvas.height);
    glyphs.forEach((g, i) => {
      const col = i % c; const row = Math.floor(i / c);
      const cx = col * cell; const cy = row * cell;
      const gw = (g.advanceWidth || upm * 0.5) * (fontSize / upm);
      const x = cx + (cell - gw) / 2;
      const y = cy + cell * 0.68;
      const path = g.getPath(x, y, fontSize);
      path.fill = gc;
      path.draw(ctx);
    });
  }, []);

  // Рендер после монтирования canvas и при смене настроек.
  useEffect(() => {
    if (ready && fontRef.current) render(fontRef.current, cols, glyphColor, bg);
  }, [ready, cols, glyphColor, bg, render]);

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const font = parse(reader.result);
        fontRef.current = font;
        setFontName(font.names?.fullName?.en || font.names?.fontFamily?.en || file.name);
        setError(''); setReady(true);
      } catch {
        setError(t.invalid);
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function download() {
    canvasRef.current?.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'glyphs.png';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  return (
    <div className="tool-panel glyph-map">
      {!ready ? (
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
          <div className="tool-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.cols}: {cols}</span>
              <input type="range" min="6" max="24" value={cols} onChange={(e) => setCols(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.glyphColor}</span>
              <input type="color" value={glyphColor} onChange={(e) => setGlyphColor(e.target.value)} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.bg}</span>
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
            </div>
          </div>

          <p className="glyph-meta">{fontName} · {count} {t.count}</p>
          <div className="iso-canvas-wrap"><canvas ref={canvasRef} className="iso-canvas" /></div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      {error && <p className="color-invalid">{error}</p>}
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,font/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔡 {t.hint2}</p>
    </div>
  );
}

export default GlyphMap;
