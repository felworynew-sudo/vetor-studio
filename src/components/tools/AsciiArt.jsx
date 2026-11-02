import { useEffect, useMemo, useRef, useState } from 'react';

// Генератор ASCII-арта: картинка → текст. Прозрачные области становятся пустыми
// (а не чёрным «@»), есть цветной режим (каждый символ — цвет своего пикселя),
// свой набор символов, контраст и тёмный/светлый фон. Экспорт: текст, HTML, PNG, SVG.
// Всё локально в <canvas>.

const RAMPS = {
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  standard: '@%#*+=-:. ',
  blocks: '█▓▒░ ',
  simple: '#+. ',
};

const TEXT = {
  ru: {
    drop: 'Загрузите изображение', hint: 'PNG, JPG, WebP — прозрачный фон сохраняется',
    width: 'Ширина (символов)', ramp: 'Набор', detailed: 'Детальный', standard: 'Стандарт', blocks: 'Блоки', simple: 'Простой', custom: 'Свой',
    customPh: 'От плотных к пустым, например: █▓▒░ ', customHint: 'Первый символ — самый тёмный участок, последний — самый светлый.',
    contrast: 'Контраст', bg: 'Фон', dark: 'Тёмный', light: 'Светлый', color: 'Цветной', invert: 'Инвертировать',
    change: 'Другое', copy: 'Копировать текст', copied: 'Скопировано', txt: '.txt', html: '.html', png: 'PNG', svg: 'SVG',
    hint2: 'Текст лучше смотрится моноширинным шрифтом; цвет сохраняется в HTML, PNG и SVG.',
  },
  en: {
    drop: 'Upload an image', hint: 'PNG, JPG, WebP — transparency is kept',
    width: 'Width (chars)', ramp: 'Charset', detailed: 'Detailed', standard: 'Standard', blocks: 'Blocks', simple: 'Simple', custom: 'Custom',
    customPh: 'Dense to empty, e.g. █▓▒░ ', customHint: 'The first char maps to the darkest area, the last to the lightest.',
    contrast: 'Contrast', bg: 'Background', dark: 'Dark', light: 'Light', color: 'Color', invert: 'Invert',
    change: 'Another', copy: 'Copy text', copied: 'Copied', txt: '.txt', html: '.html', png: 'PNG', svg: 'SVG',
    hint2: 'Text looks best in a monospace font; color is kept in HTML, PNG and SVG.',
  },
};

const BG = { dark: '#0d0d11', light: '#ffffff' };
const FG = { dark: '#e8e8f0', light: '#111111' };
const FONT = '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const ALPHA_CUT = 0.08; // почти прозрачные пиксели — пустое место

// Сетка символов: { w, h, chars: string[], rgb: Uint8ClampedArray (по 3 на клетку) }
function buildGrid(img, o) {
  const ramp = [...(o.ramp || ' ')];
  const aspect = img.naturalHeight / img.naturalWidth;
  const w = Math.max(10, Math.min(300, o.cols));
  const h = Math.max(1, Math.round(w * aspect * 0.5)); // символ примерно вдвое выше своей ширины
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const chars = new Array(w * h); const rgb = new Uint8ClampedArray(w * h * 3);
  const k = o.contrast / 100;
  for (let i = 0; i < w * h; i += 1) {
    const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2]; const a = data[i * 4 + 3] / 255;
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
    if (a < ALPHA_CUT) { chars[i] = ' '; continue; }
    let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum = Math.min(1, Math.max(0, (lum - 0.5) * k + 0.5));
    // плотный символ = «много краски»: на тёмном фоне это светлый участок, на светлом — тёмный
    let ink = o.bg === 'dark' ? lum : 1 - lum;
    if (o.invert) ink = 1 - ink;
    ink *= a; // полупрозрачные края — реже
    const idx = Math.min(ramp.length - 1, Math.round((1 - ink) * (ramp.length - 1)));
    chars[i] = ramp[idx];
  }
  return { w, h, chars, rgb };
}

const lineOf = (g, y) => g.chars.slice(y * g.w, (y + 1) * g.w).join('');
const toText = (g) => Array.from({ length: g.h }, (_, y) => lineOf(g, y).replace(/\s+$/, '')).join('\n');
const hex = (g, i) => `#${[g.rgb[i * 3], g.rgb[i * 3 + 1], g.rgb[i * 3 + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Строка разбивается на отрезки одного цвета: меньше тегов в HTML/SVG и в превью.
function runs(g, y, colored) {
  const out = [];
  for (let x = 0; x < g.w; x += 1) {
    const i = y * g.w + x; const ch = g.chars[i];
    const color = colored && ch !== ' ' ? hex(g, i) : null;
    const last = out[out.length - 1];
    if (last && (last.color === color || ch === ' ')) last.text += ch; else out.push({ color, text: ch });
  }
  return out;
}

function toHtml(g, o) {
  const body = Array.from({ length: g.h }, (_, y) => runs(g, y, o.color).map((r) => (r.color ? `<span style="color:${r.color}">${esc(r.text)}</span>` : esc(r.text))).join('')).join('\n');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>ASCII</title></head>\n<body style="margin:0;background:${BG[o.bg]}"><pre style="margin:0;padding:16px;font:10px/1.2 ${FONT.replace(/"/g, "'")};color:${FG[o.bg]}">${body}</pre></body></html>\n`;
}

function toSvg(g, o) {
  const cw = 6; const lh = 12; const W = g.w * cw + 32; const H = g.h * lh + 32;
  const lines = Array.from({ length: g.h }, (_, y) => {
    const spans = runs(g, y, o.color).map((r) => (r.color ? `<tspan fill="${r.color}">${esc(r.text)}</tspan>` : esc(r.text))).join('');
    return `<text x="16" y="${16 + (y + 1) * lh - 3}" textLength="${g.w * cw}" lengthAdjust="spacingAndGlyphs">${spans}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${BG[o.bg]}"/><g font-family="${FONT.replace(/"/g, "'")}" font-size="10" fill="${FG[o.bg]}" xml:space="preserve">${lines}</g></svg>`;
}

function toPng(g, o, scale = 2) {
  const fs = 10 * scale; const lh = 12 * scale; const pad = 16 * scale;
  const c = document.createElement('canvas'); const x = c.getContext('2d');
  x.font = `${fs}px ${FONT}`;
  const cw = x.measureText('M').width;
  c.width = Math.ceil(g.w * cw + pad * 2); c.height = g.h * lh + pad * 2;
  x.fillStyle = BG[o.bg]; x.fillRect(0, 0, c.width, c.height);
  x.font = `${fs}px ${FONT}`; x.textBaseline = 'top';
  for (let y = 0; y < g.h; y += 1) {
    let col = 0;
    runs(g, y, o.color).forEach((r) => {
      if (r.text.trim()) { x.fillStyle = r.color || FG[o.bg]; x.fillText(r.text, pad + col * cw, pad + y * lh); }
      col += [...r.text].length;
    });
  }
  return c;
}

function save(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function AsciiArt({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [img, setImg] = useState(null);
  const [cols, setCols] = useState(100);
  const [rampKey, setRampKey] = useState('standard');
  const [custom, setCustom] = useState('█▓▒░ ');
  const [contrast, setContrast] = useState(100);
  const [bg, setBg] = useState('dark');
  const [color, setColor] = useState(false);
  const [invert, setInvert] = useState(false);
  const [copied, setCopied] = useState(false);

  const o = { cols, ramp: rampKey === 'custom' ? custom : RAMPS[rampKey], contrast, bg, color, invert };
  const grid = useMemo(() => (img ? buildGrid(img, o) : null), [img, cols, rampKey, custom, contrast, bg, invert]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (grid ? Array.from({ length: grid.h }, (_, y) => runs(grid, y, color)) : []), [grid, color]);

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.src); }, [img]);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = URL.createObjectURL(file);
  }

  function copy() {
    if (grid) navigator.clipboard?.writeText(toText(grid)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  }

  return (
    <div className="tool-panel ascii-art">
      {!img ? (
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
            <label className="tool-field">
              <span className="tool-field-label">{t.width}: {cols}</span>
              <input type="range" min="30" max="240" value={cols} onChange={(e) => setCols(Number(e.target.value))} />
            </label>
            <label className="tool-field">
              <span className="tool-field-label">{t.contrast}: {contrast}%</span>
              <input type="range" min="50" max="250" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
            </label>
            <div className="tool-field">
              <span className="tool-field-label">{t.ramp}</span>
              <div className="segmented">
                {[...Object.keys(RAMPS), 'custom'].map((k) => (
                  <button key={k} type="button" className={k === rampKey ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setRampKey(k)}>{t[k]}</button>
                ))}
              </div>
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.bg}</span>
              <div className="segmented">
                {['dark', 'light'].map((k) => (
                  <button key={k} type="button" className={k === bg ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBg(k)}>{t[k]}</button>
                ))}
              </div>
            </div>
            <label className="wm-check" style={{ alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={color} onChange={(e) => setColor(e.target.checked)} />{t.color}
            </label>
            <label className="wm-check" style={{ alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />{t.invert}
            </label>
          </div>
          {rampKey === 'custom' && (
            <label className="tool-field ascii-custom">
              <input type="text" className="gg-stop-hex" value={custom} placeholder={t.customPh} spellCheck={false} onChange={(e) => setCustom(e.target.value || ' ')} />
              <span className="tool-local-note">{t.customHint}</span>
            </label>
          )}

          <pre className="ascii-out" style={{ background: BG[bg], color: FG[bg] }}>
            {preview.map((line, y) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={y}>{line.map((r, i) => (r.color ? <span key={i} style={{ color: r.color }}>{r.text}</span> : r.text))}{'\n'}</span> // eslint-disable-line react/no-array-index-key
            ))}
          </pre>

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
            <button type="button" className="tool-btn" onClick={() => save(new Blob([toText(grid)], { type: 'text/plain;charset=utf-8' }), 'ascii.txt')}>{t.txt}</button>
            <button type="button" className="tool-btn" onClick={() => save(new Blob([toHtml(grid, o)], { type: 'text/html;charset=utf-8' }), 'ascii.html')}>{t.html}</button>
            <button type="button" className="tool-btn" onClick={() => toPng(grid, o).toBlob((b) => save(b, 'ascii.png'), 'image/png')}>{t.png}</button>
            <button type="button" className="tool-btn" onClick={() => save(new Blob([toSvg(grid, o)], { type: 'image/svg+xml' }), 'ascii.svg')}>{t.svg}</button>
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
