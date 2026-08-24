import { useCallback, useRef, useState } from 'react';

// Smart Crop: ИИ находит главный объект/лицо и кадрирует под нужный формат
// (квадрат, сторис, широкий, аватар-круг) без обрезки важного. Пакетно, локально
// (transformers.js object-detection). Модель скачивается один раз.

const ASPECTS = [
  { id: 'square', ru: 'Квадрат 1:1', en: 'Square 1:1', w: 1, h: 1 },
  { id: 'story', ru: 'Сторис 9:16', en: 'Story 9:16', w: 9, h: 16 },
  { id: 'wide', ru: 'Широкий 16:9', en: 'Wide 16:9', w: 16, h: 9 },
  { id: 'avatar', ru: 'Аватар (круг)', en: 'Avatar (circle)', w: 1, h: 1, circle: true },
];

const TEXT = {
  ru: {
    drop: 'Перетащите фото сюда или нажмите', hint: 'Можно несколько файлов — обрабатываются локально',
    aspect: 'Формат', process: 'Кадрировать всё', loadingModel: 'Загрузка модели…', processing: 'Обработка…',
    download: 'Скачать', downloadAll: 'Скачать всё', clear: 'Очистить', empty: 'Пока нет файлов',
    note: 'ИИ определяет главный объект (лицо/человека) и центрирует кадр. Первый запуск скачает модель (~40 МБ).',
    error: 'Не удалось обработать. Попробуйте другой файл или браузер на Chromium.',
  },
  en: {
    drop: 'Drop photos here or click', hint: 'Several files are fine — processed locally',
    aspect: 'Aspect', process: 'Crop all', loadingModel: 'Loading model…', processing: 'Processing…',
    download: 'Download', downloadAll: 'Download all', clear: 'Clear', empty: 'No files yet',
    note: 'The AI finds the main subject (face/person) and centers the crop. The first run downloads the model (~40 MB).',
    error: 'Could not process. Try another file or a Chromium browser.',
  },
};

let detectorPromise = null;
async function getDetector(onProgress) {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const lib = await import('@huggingface/transformers');
    lib.env.allowLocalModels = false;
    let device;
    try { device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm'; } catch { device = 'wasm'; }
    return lib.pipeline('object-detection', 'Xenova/detr-resnet-50', { device, progress_callback: onProgress });
  })();
  return detectorPromise;
}

// Выбираем главный объект: приоритет person, иначе самый уверенный.
function pickSubject(dets, W, H) {
  if (!dets || !dets.length) return { xmin: W * 0.2, ymin: H * 0.2, xmax: W * 0.8, ymax: H * 0.8 };
  const persons = dets.filter((d) => d.label === 'person');
  const pool = persons.length ? persons : dets;
  const best = pool.reduce((a, b) => (b.score > a.score ? b : a));
  return best.box;
}

function cropToAspect(img, box, aspect) {
  const W = img.naturalWidth; const H = img.naturalHeight;
  const cx = (box.xmin + box.xmax) / 2;
  let cy = (box.ymin + box.ymax) / 2;
  const boxW = box.xmax - box.xmin; const boxH = box.ymax - box.ymin;
  const ar = aspect.w / aspect.h;

  if (aspect.circle) {
    // Аватар: фокус на верхней части (лицо), квадрат вокруг головы.
    cy = box.ymin + boxH * 0.32;
    let size = Math.max(boxW, boxH * 0.55) * 1.7;
    size = Math.min(size, W, H);
    let x = cx - size / 2; let y = cy - size / 2;
    x = Math.max(0, Math.min(W - size, x)); y = Math.max(0, Math.min(H - size, y));
    return { x, y, w: size, h: size, circle: true };
  }

  // Прямоугольник нужного соотношения, вмещающий объект с запасом.
  let cw = boxW * 1.5; let ch = cw / ar;
  if (ch < boxH * 1.3) { ch = boxH * 1.3; cw = ch * ar; }
  cw = Math.min(cw, W); ch = Math.min(ch, H);
  if (cw / ch > ar) cw = ch * ar; else ch = cw / ar;
  let x = cx - cw / 2; let y = cy - ch / 2;
  x = Math.max(0, Math.min(W - cw, x)); y = Math.max(0, Math.min(H - ch, y));
  return { x, y, w: cw, h: ch, circle: false };
}

function render(img, crop) {
  const out = document.createElement('canvas');
  const size = Math.round(Math.min(1600, crop.w));
  out.width = crop.circle ? size : Math.round(size);
  out.height = crop.circle ? size : Math.round(size * (crop.h / crop.w));
  const ctx = out.getContext('2d');
  if (crop.circle) {
    ctx.save();
    ctx.beginPath(); ctx.arc(out.width / 2, out.height / 2, out.width / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
    ctx.restore();
  } else {
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  }
  return out;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

function SmartCrop({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [aspectId, setAspectId] = useState('square');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, outUrl: '', outName: '', status: 'idle' }))]);
  }, []);

  async function processAll() {
    const aspect = ASPECTS.find((a) => a.id === aspectId);
    try {
      setStatus('loading'); setProgress(0);
      const detector = await getDetector((p) => { if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100)); });
      setStatus('processing');
      for (const item of items) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const { img, revoke } = await loadImage(item.file);
          // eslint-disable-next-line no-await-in-loop
          const dets = await detector(item.file ? URL.createObjectURL(item.file) : img.src, { threshold: 0.5 });
          const box = pickSubject(dets, img.naturalWidth, img.naturalHeight);
          const crop = cropToAspect(img, box, aspect);
          const canvas = render(img, crop);
          revoke();
          // eslint-disable-next-line no-await-in-loop
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
          const base = item.name.replace(/\.[^.]+$/, '');
          const outUrl = URL.createObjectURL(blob);
          setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, outUrl, outName: `${base}-${aspect.id}.png`, status: 'done' } : it)));
        } catch {
          setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
        }
      }
      setStatus('done');
    } catch (e) {
      console.error(e); setStatus('error');
    }
  }

  function download(item) {
    const a = document.createElement('a');
    a.href = item.outUrl; a.download = item.outName;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const busy = status === 'loading' || status === 'processing';
  const doneItems = items.filter((it) => it.status === 'done');

  return (
    <div className="tool-panel smart-crop">
      <div className="tool-field">
        <span className="tool-field-label">{t.aspect}</span>
        <div className="segmented">
          {ASPECTS.map((a) => (
            <button key={a.id} type="button" className={a.id === aspectId ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setAspectId(a.id)}>{a[language] || a.ru}</button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="tool-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {busy && (
        <div className="bgr-progress">
          <span>{status === 'loading' ? `${t.loadingModel} ${progress ? `${progress}%` : ''}` : t.processing}</span>
          <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${status === 'loading' ? progress : 100}%` }} /></div>
        </div>
      )}
      {status === 'error' && <p className="color-invalid">{t.error}</p>}

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={processAll} disabled={busy}>{busy ? '…' : t.process}</button>
          {doneItems.length > 0 && <button type="button" className="tool-btn" onClick={() => doneItems.forEach((it, i) => setTimeout(() => download(it), i * 250))}>{t.downloadAll} ({doneItems.length})</button>}
          <button type="button" className="tool-btn ghost" onClick={() => setItems([])} disabled={busy}>{t.clear}</button>
        </div>
      )}

      <div className="sc-grid">
        {doneItems.map((it) => (
          <button key={it.id} type="button" className="sc-item" onClick={() => download(it)} title={t.download}>
            <img src={it.outUrl} alt={it.name} className={aspectId === 'avatar' ? 'sc-thumb circle' : 'sc-thumb'} />
          </button>
        ))}
      </div>

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.filter((it) => it.status !== 'done').map((item) => (
          <li key={item.id} className={`convert-row status-${item.status}`}>
            <span className="convert-name">{item.name}</span>
            <span />
            {item.status === 'error' ? <span className="convert-error">⚠</span> : <span className="convert-pending">•</span>}
          </li>
        ))}
      </ul>

      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default SmartCrop;
