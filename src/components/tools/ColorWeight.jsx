import { useRef, useState } from 'react';
import { dominantColors, imageToData } from '../../utils/quantize';

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

function analyze(img, groups = 6) {
  return dominantColors(imageToData(img, 220), groups, { mergeDist: 46 });
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
