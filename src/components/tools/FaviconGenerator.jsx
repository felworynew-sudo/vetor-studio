import { useRef, useState } from 'react';

// Генератор фавиконок: из одной картинки нарезает набор PNG нужных размеров,
// плюс готовый HTML-сниппет и manifest.json. Локально через <canvas>.

const SIZES = [16, 32, 48, 180, 192, 512];

const TEXT = {
  ru: {
    drop: 'Загрузите картинку (лучше квадратную, от 512px)', hint: 'PNG, JPG, WebP — обрабатывается локально',
    change: 'Другая картинка', download: 'Скачать', downloadAll: 'Скачать все размеры',
    snippet: 'HTML для <head>', manifest: 'manifest.json', copy: 'Копировать', copied: 'Скопировано',
    local: 'Всё считается в браузере, картинка никуда не передаётся.',
  },
  en: {
    drop: 'Upload an image (square, 512px+ is best)', hint: 'PNG, JPG, WebP — processed locally',
    change: 'Another image', download: 'Download', downloadAll: 'Download all sizes',
    snippet: 'HTML for <head>', manifest: 'manifest.json', copy: 'Copy', copied: 'Copied',
    local: 'Everything runs in your browser, the image is never uploaded.',
  },
};

const SNIPPET = `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />`;

const MANIFEST = `{
  "icons": [
    { "src": "/favicon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}`;

function nameFor(size) {
  if (size === 180) return 'apple-touch-icon.png';
  return `favicon-${size}.png`;
}

function FaviconGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [icons, setIcons] = useState([]);
  const [copied, setCopied] = useState('');

  function generate(img) {
    const out = SIZES.map((size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      // вписываем по центру с сохранением пропорций (cover)
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * scale; const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      return { size, url: canvas.toDataURL('image/png'), name: nameFor(size) };
    });
    setIcons(out);
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { generate(img); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function download(icon) {
    const a = document.createElement('a');
    a.href = icon.url; a.download = icon.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function downloadAll() {
    icons.forEach((ic, i) => setTimeout(() => download(ic), i * 200));
  }
  function copy(key, text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1400); }).catch(() => {});
  }

  return (
    <div className="tool-panel favicon-generator">
      {icons.length === 0 ? (
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
          <div className="fv-grid">
            {icons.map((ic) => (
              <button key={ic.size} type="button" className="fv-item" onClick={() => download(ic)} title={t.download}>
                <img src={ic.url} alt={ic.name} style={{ width: Math.min(ic.size, 64), height: Math.min(ic.size, 64) }} />
                <span className="fv-item-size">{ic.size}px</span>
              </button>
            ))}
          </div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={downloadAll}>{t.downloadAll}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>

          <div className="fv-code">
            <div className="fv-code-head">
              <span className="tool-field-label">{t.snippet}</span>
              <button type="button" className="tool-btn small" onClick={() => copy('snip', SNIPPET)}>{copied === 'snip' ? `✓ ${t.copied}` : t.copy}</button>
            </div>
            <pre className="fv-pre">{SNIPPET}</pre>
          </div>

          <div className="fv-code">
            <div className="fv-code-head">
              <span className="tool-field-label">{t.manifest}</span>
              <button type="button" className="tool-btn small" onClick={() => copy('man', MANIFEST)}>{copied === 'man' ? `✓ ${t.copied}` : t.copy}</button>
            </div>
            <pre className="fv-pre">{MANIFEST}</pre>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
    </div>
  );
}

export default FaviconGenerator;
