import { useEffect, useRef, useState } from 'react';
import CompareSlider from './shared/CompareSlider';
import { applyTransfer, makeTransfer } from '../../utils/colorTransfer';
import { buildLut, downloadText, writeCube } from '../../utils/lut';

// Перенос палитры: цветовой характер фото-референса (B) переносится на ваше фото (A).
// Два метода в OKLab (Reinhard и гистограммы), сохранение яркости, сила эффекта.
// Результат — PNG и LUT .cube, чтобы повторить «грейд» в видео и Lightroom.

const TEXT = {
  ru: {
    photo: 'Ваше фото', ref: 'Референс (откуда взять цвет)', drop: 'Перетащите или нажмите', method: 'Метод',
    reinhard: 'Мягкий (среднее и разброс)', histogram: 'Точный (гистограммы)', keepLuma: 'Сохранить яркость и контраст оригинала', mix: 'Сила',
    download: 'Скачать PNG', cube: 'LUT .cube', before: 'Оригинал', after: 'С цветом референса', swap: 'Поменять местами',
    note: 'Всё локально. «Мягкий» переносит общий тон и насыщенность, «точный» — ещё и кривые. LUT повторит перенос в Premiere, DaVinci, Lightroom.',
  },
  en: {
    photo: 'Your photo', ref: 'Reference (where the color comes from)', drop: 'Drop or click', method: 'Method',
    reinhard: 'Soft (mean and spread)', histogram: 'Precise (histograms)', keepLuma: 'Keep the original brightness and contrast', mix: 'Strength',
    download: 'Download PNG', cube: 'LUT .cube', before: 'Original', after: 'With reference color', swap: 'Swap',
    note: 'All local. “Soft” transfers overall tone and saturation, “precise” also the curves. The LUT repeats the transfer in Premiere, DaVinci, Lightroom.',
  },
};

function readData(img, max = 1600) {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, c.width, c.height);
  return { c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) };
}

function Drop({ label, url, onFile, t }) {
  const ref = useRef(null);
  return (
    <button type="button" className="pt-drop" onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
      {url ? <img src={url} alt="" /> : <span>{t.drop}</span>}
      <em>{label}</em>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
    </button>
  );
}

function PaletteTransfer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [a, setA] = useState(null); // { url, img }
  const [b, setB] = useState(null);
  const [method, setMethod] = useState('reinhard');
  const [keepLuma, setKeepLuma] = useState(false);
  const [mix, setMix] = useState(1);
  const [outUrl, setOutUrl] = useState('');
  const fnRef = useRef(null);

  const load = (set) => (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => set({ url, img }); img.src = url;
  };

  useEffect(() => {
    if (!a || !b) return undefined;
    const timer = setTimeout(() => {
      const src = readData(a.img); const ref = readData(b.img, 600);
      const fn = makeTransfer(src.data, ref.data, { method, keepLuma });
      fnRef.current = fn;
      src.ctx.putImageData(applyTransfer(src.data, fn, mix), 0, 0);
      src.c.toBlob((blob) => setOutUrl((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(blob); }), 'image/png');
    }, 150);
    return () => clearTimeout(timer);
  }, [a, b, method, keepLuma, mix]);

  function download() {
    const src = readData(a.img, 99999);
    src.ctx.putImageData(applyTransfer(src.data, fnRef.current, mix), 0, 0);
    src.c.toBlob((blob) => { const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'palette-transfer.png'; document.body.appendChild(el); el.click(); el.remove(); }, 'image/png');
  }
  function exportCube() {
    const fn = fnRef.current; if (!fn) return;
    const lut = buildLut(([r, g, bl]) => {
      const v = fn(r * 255, g * 255, bl * 255);
      return [r + (v[0] / 255 - r) * mix, g + (v[1] / 255 - g) * mix, bl + (v[2] / 255 - bl) * mix];
    });
    downloadText(writeCube(lut, 'Vetor Palette Transfer'), 'palette-transfer.cube');
  }

  return (
    <div className="tool-panel palette-transfer">
      <div className="pt-inputs">
        <Drop label={`A · ${t.photo}`} url={a?.url} onFile={load(setA)} t={t} />
        <button type="button" className="tool-btn small" onClick={() => { const x = a; setA(b); setB(x); }} title={t.swap}>⇄</button>
        <Drop label={`B · ${t.ref}`} url={b?.url} onFile={load(setB)} t={t} />
      </div>
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.method}</span>
          <div className="segmented">
            <button type="button" className={method === 'reinhard' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMethod('reinhard')}>{t.reinhard}</button>
            <button type="button" className={method === 'histogram' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMethod('histogram')}>{t.histogram}</button>
          </div>
        </div>
        <label className="tool-field"><span className="tool-field-label">{t.mix}: {Math.round(mix * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix} onChange={(e) => setMix(Number(e.target.value))} /></label>
        <label className="tool-check"><input type="checkbox" checked={keepLuma} onChange={(e) => setKeepLuma(e.target.checked)} /> {t.keepLuma}</label>
      </div>
      {outUrl && a && (
        <>
          <CompareSlider before={a.url} after={outUrl} language={language} beforeLabel={t.before} afterLabel={t.after} />
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>
            <button type="button" className="tool-btn" onClick={exportCube}>{t.cube}</button>
          </div>
        </>
      )}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default PaletteTransfer;
