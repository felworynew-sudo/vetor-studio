import { useCallback, useState } from 'react';

// Анализатор размытия: отсеивает смазанные кадры. Метрика — дисперсия Лапласиана
// (чем выше, тем резче). Пакетно, локально. Для фотографов.

const THRESHOLD = 90; // ниже — считаем размытым

const TEXT = {
  ru: {
    drop: 'Перетащите фотографии сюда или нажмите', hint: 'Можно много файлов — отсортируем от размытых к резким',
    analyze: 'Проанализировать', sharp: 'Резкое', blurry: 'Размытое', score: 'Резкость',
    empty: 'Пока нет файлов', clear: 'Очистить', processing: 'Анализ…',
    hint2: 'Порог — ориентир; для разных камер и сюжетов «резкость» отличается.',
  },
  en: {
    drop: 'Drop photos here or click', hint: 'Many files are fine — sorted blurry → sharp',
    analyze: 'Analyze', sharp: 'Sharp', blurry: 'Blurry', score: 'Sharpness',
    empty: 'No files yet', clear: 'Clear', processing: 'Analyzing…',
    hint2: 'The threshold is a guideline; “sharpness” varies by camera and scene.',
  },
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

function laplacianVariance(img) {
  const maxDim = 500;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(3, Math.round(img.naturalWidth * scale));
  const h = Math.max(3, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let sum = 0; let sumSq = 0; let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      sum += lap; sumSq += lap * lap; n += 1;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function BlurAnalyzer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, score: null }))]);
  }, []);

  async function analyzeAll() {
    setBusy(true);
    const scored = [];
    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { img, revoke } = await loadImage(item.file);
        const score = Math.round(laplacianVariance(img));
        revoke();
        scored.push({ ...item, score });
      } catch { scored.push({ ...item, score: -1 }); }
    }
    scored.sort((a, b) => (a.score) - (b.score)); // размытые сверху
    setItems(scored);
    setBusy(false);
  }

  return (
    <div className="tool-panel blur-analyzer">
      <button
        type="button"
        className="tool-dropzone"
        onClick={() => document.getElementById('blur-input')?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={analyzeAll} disabled={busy}>{busy ? t.processing : t.analyze}</button>
          <button type="button" className="tool-btn ghost" onClick={() => setItems([])} disabled={busy}>{t.clear}</button>
        </div>
      )}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className="convert-row">
            <span className="convert-name" title={item.name}>{item.name}</span>
            {item.score !== null && item.score >= 0 && (
              <span className={item.score < THRESHOLD ? 'cc-badge fail ba-badge' : 'cc-badge ok ba-badge'}>
                {item.score < THRESHOLD ? `⚠ ${t.blurry}` : `✓ ${t.sharp}`}
              </span>
            )}
            <span className="convert-sizes">{item.score !== null && item.score >= 0 ? `${t.score}: ${item.score}` : ''}</span>
          </li>
        ))}
      </ul>

      <input id="blur-input" type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">📷 {t.hint2}</p>
    </div>
  );
}

export default BlurAnalyzer;
