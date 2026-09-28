import { useCallback, useEffect, useRef, useState } from 'react';

// Симулятор дальтонизма: как макет видят люди с разными типами цветовосприятия.
// Физиологически точная модель Machado/Oliveira/Fernandes (2009) — те же матрицы,
// что использует эмуляция цветовых нарушений в Chrome DevTools. Матрицы работают
// в ЛИНЕЙНОМ RGB (не в sRGB напрямую, как в наивных аппроксимациях), поэтому
// перед применением идёт гамма-декодирование, после — обратное гамма-кодирование.

const TYPES = [
  { id: 'normal', ru: 'Обычное зрение', en: 'Normal vision' },
  { id: 'protanopia', ru: 'Протанопия (нет красного)', en: 'Protanopia (no red)' },
  { id: 'deuteranopia', ru: 'Дейтеранопия (нет зелёного)', en: 'Deuteranopia (no green)' },
  { id: 'tritanopia', ru: 'Тританопия (нет синего)', en: 'Tritanopia (no blue)' },
  { id: 'achromatopsia', ru: 'Ахроматопсия (ч/б)', en: 'Achromatopsia (grayscale)' },
];

// Матрицы Machado et al. 2009, severity = 1.0 (полная форма), применяются к
// линейному RGB.
const MATRICES = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
};

// Коэффициенты линейной светимости (Rec.709/sRGB) — ахроматопсия воспринимает
// именно яркость, поэтому ч/б-конверсия тоже идёт через линейное пространство.
const LUMA = [0.2126, 0.7152, 0.0722];

const GAMMA_DECODE = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  GAMMA_DECODE[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(v) {
  const cv = v < 0 ? 0 : v > 1 ? 1 : v;
  const c = cv <= 0.0031308 ? cv * 12.92 : 1.055 * cv ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

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
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    if (simType === 'achromatopsia') {
      for (let i = 0; i < d.length; i += 4) {
        const r = GAMMA_DECODE[d[i]]; const g = GAMMA_DECODE[d[i + 1]]; const b = GAMMA_DECODE[d[i + 2]];
        const y = linearToSrgbByte(r * LUMA[0] + g * LUMA[1] + b * LUMA[2]);
        d[i] = y; d[i + 1] = y; d[i + 2] = y;
      }
    } else {
      const m = MATRICES[simType];
      for (let i = 0; i < d.length; i += 4) {
        const r = GAMMA_DECODE[d[i]]; const g = GAMMA_DECODE[d[i + 1]]; const b = GAMMA_DECODE[d[i + 2]];
        d[i] = linearToSrgbByte(r * m[0] + g * m[1] + b * m[2]);
        d[i + 1] = linearToSrgbByte(r * m[3] + g * m[4] + b * m[5]);
        d[i + 2] = linearToSrgbByte(r * m[6] + g * m[7] + b * m[8]);
      }
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
