import { useCallback, useEffect, useRef, useState } from 'react';

// Симулятор дальтонизма: как макет видят люди с разными типами цветовосприятия.
// Стандартные матрицы трансформации, применяются к пикселям в <canvas>. Локально.

const TYPES = [
  { id: 'normal', ru: 'Обычное зрение', en: 'Normal vision' },
  { id: 'protanopia', ru: 'Протанопия (нет красного)', en: 'Protanopia (no red)' },
  { id: 'deuteranopia', ru: 'Дейтеранопия (нет зелёного)', en: 'Deuteranopia (no green)' },
  { id: 'tritanopia', ru: 'Тританопия (нет синего)', en: 'Tritanopia (no blue)' },
  { id: 'achromatopsia', ru: 'Ахроматопсия (ч/б)', en: 'Achromatopsia (grayscale)' },
];

// Матрицы (r,g,b коэффициенты) — распространённые аппроксимации.
const MATRICES = {
  protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  achromatopsia: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
};

const TEXT = {
  ru: { drop: 'Загрузите изображение макета', hint: 'PNG, JPG, WebP — обрабатывается локально', type: 'Тип зрения', change: 'Другое изображение' },
  en: { drop: 'Upload a design image', hint: 'PNG, JPG, WebP — processed locally', type: 'Vision type', change: 'Another image' },
};

function ColorblindSimulator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [type, setType] = useState('deuteranopia');
  const [hasImage, setHasImage] = useState(false);

  const render = useCallback((simType) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const maxW = 900;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (simType === 'normal') return;
    const m = MATRICES[simType];
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
      d[i] = Math.min(255, r * m[0] + g * m[1] + b * m[2]);
      d[i + 1] = Math.min(255, r * m[3] + g * m[4] + b * m[5]);
      d[i + 2] = Math.min(255, r * m[6] + g * m[7] + b * m[8]);
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  useEffect(() => {
    if (hasImage) render(type);
  }, [type, hasImage, render]);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setHasImage(true);
      render(type);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <div className="tool-panel colorblind-sim">
      {hasImage && (
        <div className="tool-field">
          <span className="tool-field-label">{t.type}</span>
          <select className="cb-select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((v) => <option key={v.id} value={v.id}>{v[language] || v.ru}</option>)}
          </select>
        </div>
      )}

      {!hasImage ? (
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
        <div className="cb-canvas-wrap">
          <canvas ref={canvasRef} className="cb-canvas" />
          <button type="button" className="tool-btn small cb-change" onClick={() => inputRef.current?.click()}>
            {t.change}
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }}
      />
      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default ColorblindSimulator;
