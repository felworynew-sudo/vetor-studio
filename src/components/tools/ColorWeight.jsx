import { useRef, useState } from 'react';

// Анализатор цветового веса: показывает процентное соотношение доминирующих
// цветов на макете — для проверки правила 60-30-10. Локально в <canvas>.

const TEXT = {
  ru: {
    drop: 'Загрузите макет или изображение', hint: 'PNG, JPG, WebP — обрабатывается локально',
    change: 'Другое изображение', dominant: 'Доминанта', secondary: 'Дополнительный', accent: 'Акцент',
    rule: 'Правило 60-30-10: ~60% основной фон, ~30% дополнительный, ~10% акцент.', copied: 'Скопировано',
  },
  en: {
    drop: 'Upload a design or image', hint: 'PNG, JPG, WebP — processed locally',
    change: 'Another image', dominant: 'Dominant', secondary: 'Secondary', accent: 'Accent',
    rule: 'The 60-30-10 rule: ~60% main, ~30% secondary, ~10% accent.', copied: 'Copied',
  },
};

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function analyze(img, groups = 6) {
  const canvas = document.createElement('canvas');
  const maxDim = 200;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const buckets = new Map();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue;
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5); // 3 бита на канал
    const bk = buckets.get(key);
    if (bk) { bk.r += r; bk.g += g; bk.b += b; bk.n += 1; } else buckets.set(key, { r, g, b, n: 1 });
    total += 1;
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, groups);
  const shown = sorted.reduce((s, x) => s + x.n, 0);
  return sorted.map((bk) => ({
    hex: toHex(Math.round(bk.r / bk.n), Math.round(bk.g / bk.n), Math.round(bk.b / bk.n)),
    pct: Math.round((bk.n / shown) * 100),
  }));
}

function ColorWeight({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [preview, setPreview] = useState('');
  const [colors, setColors] = useState([]);
  const [copied, setCopied] = useState('');

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setPreview(url); setColors(analyze(img)); };
    img.src = url;
  }
  function copy(hex) {
    if (navigator.clipboard) navigator.clipboard.writeText(hex).then(() => { setCopied(hex); setTimeout(() => setCopied(''), 1200); }).catch(() => {});
  }

  const roleFor = (i) => (i === 0 ? t.dominant : i === 1 ? t.secondary : i === 2 ? t.accent : '');

  return (
    <div className="tool-panel color-weight">
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
          <div className="pe-top">
            <img src={preview} alt="" className="pe-preview" />
            <button type="button" className="tool-btn small" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>

          <div className="cw-bar">
            {colors.map((c) => (
              <span key={c.hex} className="cw-bar-seg" style={{ width: `${c.pct}%`, background: c.hex }} title={`${c.hex} ${c.pct}%`} />
            ))}
          </div>

          <ul className="cw-list">
            {colors.map((c, i) => (
              <li key={c.hex} className="cw-row">
                <span className="cw-swatch" style={{ background: c.hex }} />
                <button type="button" className="cw-hex" onClick={() => copy(c.hex)}>{copied === c.hex ? `✓ ${t.copied}` : c.hex.toUpperCase()}</button>
                <span className="cw-role">{roleFor(i)}</span>
                <span className="cw-pct">{c.pct}%</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">📊 {t.rule}</p>
    </div>
  );
}

export default ColorWeight;
