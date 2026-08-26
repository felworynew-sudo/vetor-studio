import { useCallback, useEffect, useRef, useState } from 'react';
import { parse } from 'opentype.js';

// Генератор глиф-карт: постер с символами шрифта. Гибко: весь набор или только
// латиница / кириллица / цифры / пунктуация / своя фраза; фон — цвет, градиент
// или своя картинка. Парсинг opentype.js, отрисовка в <canvas>, экспорт PNG.

const SETS = {
  latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  cyrillic: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  digits: '0123456789',
  punct: '.,:;!?’“”()[]{}<>/\\|@#$%^&*-_+=~',
};

const TEXT = {
  ru: {
    drop: 'Загрузите шрифт (TTF, OTF, WOFF)', hint: 'Файл обрабатывается локально, никуда не передаётся',
    set: 'Набор', all: 'Весь шрифт', latin: 'Латиница', cyrillic: 'Кириллица', digits: 'Цифры', punct: 'Пунктуация', custom: 'Своя фраза',
    phrase: 'Текст / фраза', phrasePh: 'Например: Верстак',
    cols: 'Столбцов', glyphColor: 'Цвет символов', bgMode: 'Фон', bgColor: 'Цвет', bgGrad: 'Градиент', bgImg: 'Картинка',
    bg2: 'Второй цвет', pickImg: 'Выбрать картинку', change: 'Другой шрифт', download: 'Скачать PNG',
    count: 'символов', hint2: 'Постер с набором глифов — печатайте или используйте в макете.',
    invalid: 'Не удалось прочитать шрифт', empty: 'В этом шрифте нет таких символов.',
  },
  en: {
    drop: 'Upload a font (TTF, OTF, WOFF)', hint: 'The file is processed locally and never uploaded',
    set: 'Set', all: 'Whole font', latin: 'Latin', cyrillic: 'Cyrillic', digits: 'Digits', punct: 'Punctuation', custom: 'Custom text',
    phrase: 'Text / phrase', phrasePh: 'e.g. Verstak',
    cols: 'Columns', glyphColor: 'Glyph color', bgMode: 'Background', bgColor: 'Color', bgGrad: 'Gradient', bgImg: 'Image',
    bg2: 'Second color', pickImg: 'Choose image', change: 'Another font', download: 'Download PNG',
    count: 'glyphs', hint2: 'A poster of the glyph set — print it or drop it into a layout.',
    invalid: 'Could not read the font', empty: 'This font has none of those characters.',
  },
};

function GlyphMap({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const bgInputRef = useRef(null);
  const fontRef = useRef(null);
  const bgImgRef = useRef(null);
  const canvasRef = useRef(null);

  const [cols, setCols] = useState(12);
  const [glyphColor, setGlyphColor] = useState('#f5f7fb');
  const [charset, setCharset] = useState('all');
  const [phrase, setPhrase] = useState('Верстак');
  const [bgMode, setBgMode] = useState('color');
  const [bg, setBg] = useState('#0d0d11');
  const [bg2, setBg2] = useState('#6166ff');
  const [bgImgUrl, setBgImgUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [fontName, setFontName] = useState('');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');

  function collectGlyphs(font) {
    const out = [];
    const push = (g) => { try { if (g && g.index !== 0 && g.path && g.path.commands && g.path.commands.length) out.push(g); } catch { /* skip */ } };
    if (charset === 'all') {
      for (let i = 0; i < font.glyphs.length && out.length < 600; i += 1) push(font.glyphs.get(i));
    } else {
      const str = charset === 'custom' ? (phrase || '') : (SETS[charset] || '');
      for (const ch of str) push(font.charToGlyph(ch));
    }
    return out;
  }

  const render = useCallback((font) => {
    const canvas = canvasRef.current;
    if (!font || !canvas) return;
    const cell = 90; const fontSize = cell * 0.6; const upm = font.unitsPerEm || 1000;
    const glyphs = collectGlyphs(font);
    setCount(glyphs.length);
    const c = Math.max(1, Math.min(cols, glyphs.length || 1));
    const rows = Math.ceil(glyphs.length / c) || 1;
    canvas.width = c * cell; canvas.height = rows * cell;
    const ctx = canvas.getContext('2d');
    // фон
    if (bgMode === 'image' && bgImgRef.current) {
      const img = bgImgRef.current; const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale; const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    } else if (bgMode === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, bg); g.addColorStop(1, bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    // глифы
    glyphs.forEach((g, i) => {
      const col = i % c; const row = Math.floor(i / c);
      const gw = (g.advanceWidth || upm * 0.5) * (fontSize / upm);
      const x = col * cell + (cell - gw) / 2; const y = row * cell + cell * 0.68;
      const path = g.getPath(x, y, fontSize); path.fill = glyphColor; path.draw(ctx);
    });
  }, [cols, glyphColor, charset, phrase, bgMode, bg, bg2, bgImgUrl]);

  useEffect(() => { if (ready && fontRef.current) render(fontRef.current); }, [ready, render]);

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { fontRef.current = parse(reader.result); setFontName(fontRef.current.names?.fullName?.en || fontRef.current.names?.fontFamily?.en || file.name); setError(''); setReady(true); }
      catch { setError(t.invalid); }
    };
    reader.readAsArrayBuffer(file);
  }
  function loadBg(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image(); img.onload = () => { bgImgRef.current = img; setBgImgUrl(url); setBgMode('image'); }; img.src = url;
  }
  function download() {
    canvasRef.current?.toBlob((blob) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'glyphs.png';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  const SET_BTNS = ['all', 'latin', 'cyrillic', 'digits', 'punct', 'custom'];

  return (
    <div className="tool-panel glyph-map">
      {!ready ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="tool-field">
            <span className="tool-field-label">{t.set}</span>
            <div className="gm-sets">
              {SET_BTNS.map((s) => (
                <button key={s} type="button" className={charset === s ? 'crop-ratio is-active' : 'crop-ratio'} onClick={() => setCharset(s)}>{t[s]}</button>
              ))}
            </div>
          </div>

          {charset === 'custom' && (
            <div className="tool-field">
              <span className="tool-field-label">{t.phrase}</span>
              <input type="text" className="yt-input" value={phrase} placeholder={t.phrasePh} onChange={(e) => setPhrase(e.target.value)} />
            </div>
          )}

          <div className="tool-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.cols}: {cols}</span>
              <input type="range" min="4" max="24" value={cols} onChange={(e) => setCols(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.glyphColor}</span>
              <input type="color" value={glyphColor} onChange={(e) => setGlyphColor(e.target.value)} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.bgMode}</span>
              <div className="segmented">
                <button type="button" className={bgMode === 'color' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBgMode('color')}>{t.bgColor}</button>
                <button type="button" className={bgMode === 'gradient' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBgMode('gradient')}>{t.bgGrad}</button>
                <button type="button" className={bgMode === 'image' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => (bgImgRef.current ? setBgMode('image') : bgInputRef.current?.click())}>{t.bgImg}</button>
              </div>
            </div>
            {bgMode !== 'image' && (
              <div className="tool-field">
                <span className="tool-field-label">{bgMode === 'gradient' ? `${t.bgColor} 1` : t.bgColor}</span>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              </div>
            )}
            {bgMode === 'gradient' && (
              <div className="tool-field">
                <span className="tool-field-label">{t.bg2}</span>
                <input type="color" value={bg2} onChange={(e) => setBg2(e.target.value)} />
              </div>
            )}
            {bgMode === 'image' && (
              <button type="button" className="tool-btn small" onClick={() => bgInputRef.current?.click()}>{t.pickImg}</button>
            )}
          </div>

          <p className="glyph-meta">{fontName} · {count} {t.count}</p>
          {count === 0 && <p className="color-invalid">{t.empty}</p>}
          <div className="iso-canvas-wrap" style={count === 0 ? { display: 'none' } : undefined}><canvas ref={canvasRef} className="iso-canvas" /></div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={download} disabled={count === 0}>{t.download}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      {error && <p className="color-invalid">{error}</p>}
      <input ref={inputRef} type="file" accept=".ttf,.otf,.woff,font/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={(e) => { loadBg(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔡 {t.hint2}</p>
    </div>
  );
}

export default GlyphMap;
