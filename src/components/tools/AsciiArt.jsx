import { useCallback, useRef, useState } from 'react';

// Генератор ASCII-графики: превращает картинку в текстовый арт. Локально.

const RAMPS = {
  detailed: '@%#*+=-:. ',
  blocks: '█▓▒░ ',
  simple: '#+. ',
};

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    width: 'Ширина (символов)', ramp: 'Набор', invert: 'Инвертировать', change: 'Другое',
    copy: 'Копировать', copied: 'Скопировано', download: 'Скачать .txt', detailed: 'Детальный', blocks: 'Блоки', simple: 'Простой',
    hint2: 'Лучше смотрится моноширинным шрифтом.',
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — processed locally',
    width: 'Width (chars)', ramp: 'Charset', invert: 'Invert', change: 'Another',
    copy: 'Copy', copied: 'Copied', download: 'Download .txt', detailed: 'Detailed', blocks: 'Blocks', simple: 'Simple',
    hint2: 'Looks best in a monospace font.',
  },
};

function AsciiArt({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [cols, setCols] = useState(100);
  const [rampKey, setRampKey] = useState('detailed');
  const [invert, setInvert] = useState(false);
  const [ascii, setAscii] = useState('');
  const [copied, setCopied] = useState(false);

  const build = useCallback((img, c, rk, inv) => {
    const ramp = RAMPS[rk];
    const aspect = img.naturalHeight / img.naturalWidth;
    const w = Math.max(20, Math.min(300, c));
    const h = Math.max(1, Math.round(w * aspect * 0.5)); // 0.5 — символы выше, чем шире
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let out = '';
    for (let y = 0; y < h; y += 1) {
      let line = '';
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        let lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        if (inv) lum = 1 - lum;
        const idx = Math.min(ramp.length - 1, Math.floor(lum * (ramp.length - 1)));
        line += ramp[idx];
      }
      out += `${line}\n`;
    }
    setAscii(out);
  }, []);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; build(img, cols, rampKey, invert); URL.revokeObjectURL(url); };
    img.src = url;
  }
  function rebuild(next = {}) {
    const c = next.cols ?? cols; const rk = next.rampKey ?? rampKey; const inv = next.invert ?? invert;
    if (imgRef.current) build(imgRef.current, c, rk, inv);
  }

  function copy() {
    if (navigator.clipboard && ascii) navigator.clipboard.writeText(ascii).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  }
  function download() {
    const blob = new Blob([ascii], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ascii.txt';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="tool-panel ascii-art">
      {!ascii ? (
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
              <span className="tool-field-label">{t.width}: {cols}</span>
              <input type="range" min="40" max="220" value={cols} onChange={(e) => { const v = Number(e.target.value); setCols(v); rebuild({ cols: v }); }} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.ramp}</span>
              <div className="segmented">
                {Object.keys(RAMPS).map((k) => (
                  <button key={k} type="button" className={k === rampKey ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => { setRampKey(k); rebuild({ rampKey: k }); }}>{t[k]}</button>
                ))}
              </div>
            </div>
            <label className="wm-check" style={{ alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={invert} onChange={(e) => { setInvert(e.target.checked); rebuild({ invert: e.target.checked }); }} />{t.invert}
            </label>
          </div>

          <pre className="ascii-out">{ascii}</pre>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
            <button type="button" className="tool-btn" onClick={download}>{t.download}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔡 {t.hint2}</p>
    </div>
  );
}

export default AsciiArt;
