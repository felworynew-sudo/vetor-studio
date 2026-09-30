import { useEffect, useMemo, useRef, useState } from 'react';

// Генератор фавиконок по современному минимальному набору: favicon.ico
// (16/32/48 внутри, PNG-кадры), icon.svg (из SVG-исходника или текста/эмодзи),
// apple-touch-icon 180 (без прозрачности), icon-192/512 и maskable-512
// с безопасной зоной, manifest.webmanifest и HTML-сниппет. Всё — одним ZIP.
// Источник: картинка, SVG или буква/эмодзи на фоне. Локально через <canvas>.

const TEXT = {
  ru: {
    drop: 'Загрузите картинку или SVG (лучше квадратную, от 512px)', hint: 'PNG, JPG, WebP, SVG — обрабатывается локально', orText: 'или сделайте из буквы / эмодзи:',
    textMode: 'Текст', make: 'Создать', change: 'Другой источник', zip: 'Скачать всё (ZIP)', download: 'Скачать',
    pad: 'Отступ', radius: 'Скругление', bg: 'Фон', transparent: 'Прозрачный', fg: 'Цвет текста', fit: 'Вписать', cover: 'Заполнить',
    name: 'Название приложения', theme: 'Цвет темы', snippet: 'HTML для <head>', manifest: 'manifest.webmanifest', copy: 'Копировать', copied: 'Скопировано',
    preview: 'Предпросмотр', tabLight: 'Светлая вкладка', tabDark: 'Тёмная вкладка', home: 'Иконка на экране (маска)',
    noSvg: 'icon.svg создаётся только из SVG-исходника или текста — растровую картинку честно векторизовать нельзя.',
    local: 'Всё считается в браузере, картинка никуда не передаётся.',
  },
  en: {
    drop: 'Upload an image or SVG (square, 512px+ is best)', hint: 'PNG, JPG, WebP, SVG — processed locally', orText: 'or make one from a letter / emoji:',
    textMode: 'Text', make: 'Create', change: 'Another source', zip: 'Download all (ZIP)', download: 'Download',
    pad: 'Padding', radius: 'Corner radius', bg: 'Background', transparent: 'Transparent', fg: 'Text color', fit: 'Contain', cover: 'Cover',
    name: 'App name', theme: 'Theme color', snippet: 'HTML for <head>', manifest: 'manifest.webmanifest', copy: 'Copy', copied: 'Copied',
    preview: 'Preview', tabLight: 'Light tab', tabDark: 'Dark tab', home: 'Home screen (masked)',
    noSvg: 'icon.svg is produced only from an SVG source or text — a raster image cannot be honestly vectorized.',
    local: 'Everything runs in your browser, the image is never uploaded.',
  },
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

// ICO-контейнер с PNG-кадрами (поддерживается браузерами и Windows Vista+).
function buildIco(frames) {
  const head = 6 + frames.length * 16; const total = head + frames.reduce((s, f) => s + f.data.length, 0);
  const buf = new Uint8Array(total); const dv = new DataView(buf.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, frames.length, true);
  let off = head;
  frames.forEach((f, i) => {
    const e = 6 + i * 16;
    buf[e] = f.size >= 256 ? 0 : f.size; buf[e + 1] = f.size >= 256 ? 0 : f.size; buf[e + 2] = 0; buf[e + 3] = 0;
    dv.setUint16(e + 4, 1, true); dv.setUint16(e + 6, 32, true); dv.setUint32(e + 8, f.data.length, true); dv.setUint32(e + 12, off, true);
    buf.set(f.data, off); off += f.data.length;
  });
  return buf;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Одна иконка. solid — фон обязателен (apple/maskable), maskable — безопасная зона 80%.
function renderIcon(size, o, { solid = false, maskable = false } = {}) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  const bg = o.bg === 'transparent' ? (solid ? '#ffffff' : null) : o.bg;
  if (bg) { x.fillStyle = bg; if (solid) x.fillRect(0, 0, size, size); else { roundRect(x, 0, 0, size, size, (o.radius / 100) * size * 0.5); x.fill(); } }
  const pad = maskable ? Math.max(o.pad, 0.2) : o.pad; const inset = size * pad; const box = size - inset * 2;
  if (o.kind === 'text') {
    x.fillStyle = o.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 100px ${FONT}`; const m = x.measureText(o.text || ' ');
    const hgt = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 100;
    const k = Math.min(box / Math.max(1, m.width), box / hgt);
    x.font = `700 ${100 * k}px ${FONT}`; const m2 = x.measureText(o.text || ' ');
    const dy = ((m2.actualBoundingBoxAscent - m2.actualBoundingBoxDescent) / 2);
    x.textBaseline = 'alphabetic'; x.fillText(o.text || ' ', size / 2, size / 2 + dy);
  } else if (o.img) {
    const iw = o.img.naturalWidth || 512; const ih = o.img.naturalHeight || 512;
    const k = o.cover ? Math.max(box / iw, box / ih) : Math.min(box / iw, box / ih);
    const w = iw * k; const h = ih * k;
    x.save(); if (o.cover) { x.beginPath(); x.rect(inset, inset, box, box); x.clip(); }
    x.drawImage(o.img, (size - w) / 2, (size - h) / 2, w, h); x.restore();
  }
  return c;
}

const toBytes = (canvas) => new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function textSvg(o) {
  const r = (o.radius / 100) * 50; const bg = o.bg === 'transparent' ? '' : `<rect width="100" height="100" rx="${r}" fill="${o.bg}"/>`;
  // подбираем кегль как на canvas: по ширине и высоте глифов
  const c = document.createElement('canvas').getContext('2d'); c.font = `700 100px ${FONT}`; const m = c.measureText(o.text || ' ');
  const box = 100 - o.pad * 200; const hgt = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 100;
  const fs = 100 * Math.min(box / Math.max(1, m.width), box / hgt); const dy = ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2) * (fs / 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}<text x="50" y="${(50 + dy).toFixed(2)}" text-anchor="middle" font-family='${FONT}' font-weight="700" font-size="${fs.toFixed(2)}" fill="${o.fg}">${esc(o.text || ' ')}</text></svg>\n`;
}

function FaviconGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [src, setSrc] = useState(null); // { kind: 'image'|'svg'|'text', img?, svgText? }
  const [text, setText] = useState('V');
  const [pad, setPad] = useState(0.06);
  const [radius, setRadius] = useState(24);
  const [bg, setBg] = useState('transparent');
  const [fg, setFg] = useState('#ffffff');
  const [cover, setCover] = useState(false);
  const [appName, setAppName] = useState('My App');
  const [theme, setTheme] = useState('#6c5ce7');
  const [copied, setCopied] = useState('');
  const [previews, setPreviews] = useState({});

  function loadFile(file) {
    if (!file || !(file.type.startsWith('image/') || file.name.endsWith('.svg'))) return;
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = async () => { setSrc({ kind: isSvg ? 'svg' : 'image', img, svgText: isSvg ? await file.text() : null }); };
    img.src = url;
  }
  function makeText() { setSrc({ kind: 'text' }); if (bg === 'transparent') setBg(theme); }

  const opts = useMemo(() => (src ? { kind: src.kind, img: src.img, text, pad, radius, bg, fg, cover } : null), [src, text, pad, radius, bg, fg, cover]);

  useEffect(() => {
    if (!opts) return;
    const url = (c) => c.toDataURL('image/png');
    setPreviews({ i16: url(renderIcon(16, opts)), i32: url(renderIcon(32, opts)), apple: url(renderIcon(180, opts, { solid: true })), mask: url(renderIcon(192, opts, { solid: true, maskable: true })), i192: url(renderIcon(192, opts)) });
  }, [opts]);

  const svgText = src?.kind === 'svg' ? src.svgText : src?.kind === 'text' ? textSvg(opts) : null;
  const bgColor = bg === 'transparent' ? '#ffffff' : bg;
  const snippet = [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    svgText && '<link rel="icon" href="/icon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/manifest.webmanifest">',
    `<meta name="theme-color" content="${theme}">`,
  ].filter(Boolean).join('\n');
  const manifest = JSON.stringify({
    name: appName, short_name: appName.slice(0, 12), start_url: '/', display: 'standalone', theme_color: theme, background_color: bgColor,
    icons: [
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      { src: '/icon-mask.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  }, null, 2);

  async function zip() {
    const { zipSync, strToU8 } = await import('fflate');
    const ico = buildIco(await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await toBytes(renderIcon(s, opts)) }))));
    const files = {
      'favicon.ico': ico,
      'apple-touch-icon.png': await toBytes(renderIcon(180, opts, { solid: true })),
      'icon-192.png': await toBytes(renderIcon(192, opts)),
      'icon-512.png': await toBytes(renderIcon(512, opts)),
      'icon-mask.png': await toBytes(renderIcon(512, opts, { solid: true, maskable: true })),
      'manifest.webmanifest': strToU8(`${manifest}\n`),
      'head-snippet.html': strToU8(`${snippet}\n`),
    };
    if (svgText) files['icon.svg'] = strToU8(svgText);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' })); a.download = 'favicons.zip';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function copy(key, value) {
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1400); }).catch(() => {});
  }

  const range = (label, value, set, min, max, step, fmt) => (
    <label className="tool-field"><span className="tool-field-label">{label}: {fmt(value)}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} /></label>
  );

  return (
    <div className="tool-panel favicon-generator">
      {!src ? (
        <>
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
          <div className="tool-actions">
            <span className="tool-field-label">{t.orText}</span>
            <input type="text" className="wm-text-input" value={text} maxLength={3} onChange={(e) => setText(e.target.value)} style={{ width: 90 }} />
            <button type="button" className="tool-btn" onClick={makeText}>{t.make}</button>
          </div>
        </>
      ) : (
        <>
          <div className="fv-preview">
            <div className="fv-tab is-light"><img src={previews.i16} alt="" width="16" height="16" /><span>{appName}</span></div>
            <div className="fv-tab is-dark"><img src={previews.i16} alt="" width="16" height="16" /><span>{appName}</span></div>
            <div className="fv-home"><img src={previews.mask} alt="" style={{ clipPath: 'circle(50%)' }} /><span>{t.home}</span></div>
            <div className="fv-home"><img src={previews.apple} alt="" style={{ clipPath: 'inset(0 round 22%)' }} /><span>iOS</span></div>
            <div className="fv-home"><img src={previews.i192} alt="" /><span>192</span></div>
            <div className="fv-home"><img src={previews.i32} alt="" style={{ width: 32, height: 32, imageRendering: 'pixelated'}} /><span>32</span></div>
          </div>

          <div className="tool-controls">
            {src.kind === 'text' && (
              <>
                <label className="tool-field"><span className="tool-field-label">{t.textMode}</span><input type="text" className="wm-text-input" value={text} maxLength={3} onChange={(e) => setText(e.target.value)} style={{ width: 90 }} /></label>
                <label className="tool-field"><span className="tool-field-label">{t.fg}</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></label>
              </>
            )}
            <div className="tool-field"><span className="tool-field-label">{t.bg}</span>
              <div className="tool-actions">
                <label className="tool-check"><input type="checkbox" checked={bg === 'transparent'} onChange={(e) => setBg(e.target.checked ? 'transparent' : theme)} /> {t.transparent}</label>
                {bg !== 'transparent' && <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />}
              </div>
            </div>
            {range(t.pad, pad, setPad, 0, 0.3, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {range(t.radius, radius, setRadius, 0, 100, 1, (v) => `${v}%`)}
            {src.kind !== 'text' && (
              <div className="segmented">
                <button type="button" className={!cover ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setCover(false)}>{t.fit}</button>
                <button type="button" className={cover ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setCover(true)}>{t.cover}</button>
              </div>
            )}
          </div>

          <div className="tool-controls">
            <label className="tool-field"><span className="tool-field-label">{t.name}</span><input type="text" className="wm-text-input" value={appName} onChange={(e) => setAppName(e.target.value)} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.theme}</span><input type="color" value={theme} onChange={(e) => setTheme(e.target.value)} /></label>
          </div>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={zip}>{t.zip}</button>
            <button type="button" className="tool-btn ghost" onClick={() => setSrc(null)}>{t.change}</button>
          </div>
          {!svgText && <p className="tool-field-label">ℹ {t.noSvg}</p>}

          <div className="fv-code">
            <div className="fv-code-head">
              <span className="tool-field-label">{t.snippet}</span>
              <button type="button" className="tool-btn small" onClick={() => copy('snip', snippet)}>{copied === 'snip' ? `✓ ${t.copied}` : t.copy}</button>
            </div>
            <pre className="fv-pre">{snippet}</pre>
          </div>

          <div className="fv-code">
            <div className="fv-code-head">
              <span className="tool-field-label">{t.manifest}</span>
              <button type="button" className="tool-btn small" onClick={() => copy('man', manifest)}>{copied === 'man' ? `✓ ${t.copied}` : t.copy}</button>
            </div>
            <pre className="fv-pre">{manifest}</pre>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*,.svg" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.local}</p>
    </div>
  );
}

export default FaviconGenerator;
