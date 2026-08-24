import { useEffect, useRef, useState } from 'react';
import { aiBrowserHint } from '../../utils/aiSupport';

// Вырезатель фона: сегментация в браузере через transformers.js (модель MODNet).
// Модель (~25 МБ) скачивается один раз при первом запуске и работает локально —
// изображение НЕ уходит на сервер. WebGPU при поддержке, иначе WASM.

const TEXT = {
  ru: {
    drop: 'Загрузите фото (лучше с человеком или объектом)', hint: 'PNG, JPG, WebP — обрабатывается локально',
    run: 'Убрать фон', loadingModel: 'Загрузка модели…', processing: 'Обработка…',
    download: 'Скачать PNG', change: 'Другое фото', modelNote: 'Первый запуск скачает модель (~25 МБ). Дальше — мгновенно и без интернета.',
    error: 'Не удалось обработать. Попробуйте другое изображение или браузер на Chromium.',
    original: 'Оригинал', result: 'Без фона', model: 'Модель',
    brush: 'Кисть', erase: 'Стереть', restore: 'Вернуть', size: 'Размер',
    editHint: 'Рисуйте по картинке: «Стереть» убирает лишнее, «Вернуть» возвращает случайно срезанное.',
  },
  en: {
    drop: 'Upload a photo (a person or object works best)', hint: 'PNG, JPG, WebP — processed locally',
    run: 'Remove background', loadingModel: 'Loading model…', processing: 'Processing…',
    download: 'Download PNG', change: 'Another photo', modelNote: 'The first run downloads the model (~25 MB). After that it is instant and offline.',
    error: 'Could not process. Try another image or a Chromium browser.',
    original: 'Original', result: 'No background', model: 'Model',
    brush: 'Brush', erase: 'Erase', restore: 'Restore', size: 'Size',
    editHint: 'Paint over the image: “Erase” removes leftovers, “Restore” brings back accidentally cut parts.',
  },
};

export const MODELS = [
  { id: 'Xenova/modnet', ru: 'MODNet — портреты и люди', en: 'MODNet — portraits & people' },
  { id: 'briaai/RMBG-1.4', ru: 'RMBG 1.4 — универсальная', en: 'RMBG 1.4 — general purpose' },
];

// Кэшируем модели между открытиями тула в рамках сессии (по id).
const modelCache = {};
async function getModel(modelId, onProgress) {
  if (modelCache[modelId]) return modelCache[modelId];
  modelCache[modelId] = (async () => {
    const lib = await import('@huggingface/transformers');
    const { AutoModel, AutoProcessor, env } = lib;
    env.allowLocalModels = false;
    let device;
    try {
      device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
    } catch { device = 'wasm'; }
    const model = await AutoModel.from_pretrained(modelId, { device, progress_callback: onProgress });
    const processor = await AutoProcessor.from_pretrained(modelId);
    return { model, processor, RawImage: lib.RawImage };
  })();
  return modelCache[modelId];
}

function BackgroundRemover({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | processing | done | error
  const [progress, setProgress] = useState(0);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [brushMode, setBrushMode] = useState('erase'); // erase | restore
  const [brushSize, setBrushSize] = useState(40);

  const editCanvasRef = useRef(null);
  const origCanvasRef = useRef(null); // офскрин с оригиналом (для «вернуть»)
  const pendingRef = useRef(null); // { resultCanvas, origCanvas }
  const painting = useRef(false);
  const lastPt = useRef(null);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setResultUrl('');
    setStatus('idle');
    setSrcUrl(URL.createObjectURL(file));
  }

  // Когда результат готов, переносим его на видимый canvas редактора.
  useEffect(() => {
    if (status !== 'done' || !pendingRef.current) return;
    const edit = editCanvasRef.current;
    if (!edit) return;
    const { resultCanvas, origCanvas } = pendingRef.current;
    edit.width = resultCanvas.width; edit.height = resultCanvas.height;
    edit.getContext('2d').drawImage(resultCanvas, 0, 0);
    origCanvasRef.current = origCanvas;
  }, [status]);

  // --- Кисть ---
  function canvasPoint(e) {
    const c = editCanvasRef.current;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  }
  function stamp(x, y) {
    const c = editCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const r = brushSize * (c.width / c.getBoundingClientRect().width) / 2;
    if (brushMode === 'erase') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      const orig = origCanvasRef.current;
      if (!orig) return;
      const size = Math.ceil(r * 2);
      const s = document.createElement('canvas'); s.width = size; s.height = size;
      const sctx = s.getContext('2d');
      sctx.drawImage(orig, x - r, y - r, size, size, 0, 0, size, size);
      sctx.globalCompositeOperation = 'destination-in';
      const g = sctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, size, size);
      ctx.drawImage(s, x - r, y - r);
    }
  }
  function paintTo(pt) {
    const last = lastPt.current;
    if (last) {
      const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
      const steps = Math.max(1, Math.floor(dist / 4));
      for (let i = 1; i <= steps; i += 1) stamp(last.x + (pt.x - last.x) * (i / steps), last.y + (pt.y - last.y) * (i / steps));
    } else {
      stamp(pt.x, pt.y);
    }
    lastPt.current = pt;
  }
  function onPointerDown(e) { painting.current = true; lastPt.current = null; e.currentTarget.setPointerCapture?.(e.pointerId); paintTo(canvasPoint(e)); }
  function onPointerMove(e) { if (painting.current) paintTo(canvasPoint(e)); }
  function onPointerUp() { painting.current = false; lastPt.current = null; }

  async function run() {
    if (!srcUrl) return;
    try {
      setStatus('loading');
      setProgress(0);
      const { model, processor, RawImage } = await getModel(modelId, (p) => {
        if (p && p.status === 'progress' && p.total) {
          setProgress(Math.round((p.loaded / p.total) * 100));
        }
      });

      setStatus('processing');
      const image = await RawImage.fromURL(srcUrl);
      const { pixel_values } = await processor(image);
      const out = await model({ input: pixel_values });
      // Разные модели возвращают маску под разными ключами — берём первый тензор.
      const tensor = out.output ?? out.last_hidden_state ?? Object.values(out)[0];
      const maskData = tensor[0].mul(255).to('uint8');
      const mask = await RawImage.fromTensor(maskData).resize(image.width, image.height);

      const bmp = await createImageBitmap(await (await fetch(srcUrl)).blob());
      // Оригинал (для кисти «вернуть»).
      const origCanvas = document.createElement('canvas');
      origCanvas.width = image.width; origCanvas.height = image.height;
      origCanvas.getContext('2d').drawImage(bmp, 0, 0);
      // Результат: оригинал + альфа из маски.
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = image.width; resultCanvas.height = image.height;
      const ctx = resultCanvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height);
      for (let i = 0; i < mask.data.length; i += 1) {
        pixels.data[i * 4 + 3] = mask.data[i];
      }
      ctx.putImageData(pixels, 0, 0);
      pendingRef.current = { resultCanvas, origCanvas };
      setResultUrl(resultCanvas.toDataURL('image/png'));
      setStatus('done');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  function download() {
    const url = editCanvasRef.current ? editCanvasRef.current.toDataURL('image/png') : resultUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = 'no-bg.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const busy = status === 'loading' || status === 'processing';

  return (
    <div className="tool-panel bg-remover">
      {!srcUrl ? (
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
          <div className="bgr-compare">
            <div className="bgr-cell">
              <span className="bgr-cap">{t.original}</span>
              <img src={srcUrl} alt="" className="bgr-img" />
            </div>
            {status === 'done' && (
              <div className="bgr-cell">
                <span className="bgr-cap">{t.result}</span>
                <div className="bgr-checker bgr-edit">
                  <canvas
                    ref={editCanvasRef}
                    className={`bgr-canvas mode-${brushMode}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                  />
                </div>
              </div>
            )}
          </div>

          {status === 'done' && (
            <div className="bgr-brush">
              <div className="tool-field">
                <span className="tool-field-label">{t.brush}</span>
                <div className="segmented">
                  <button type="button" className={brushMode === 'erase' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBrushMode('erase')}>🩹 {t.erase}</button>
                  <button type="button" className={brushMode === 'restore' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBrushMode('restore')}>↩️ {t.restore}</button>
                </div>
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.size}: {brushSize}px</span>
                <input type="range" min="8" max="120" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
              </div>
              <span className="bgr-brush-hint">{t.editHint}</span>
            </div>
          )}

          {!busy && status !== 'done' && (
            <div className="tool-field bgr-model">
              <span className="tool-field-label">{t.model}</span>
              <select className="cb-select" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m[language] || m.ru}</option>)}
              </select>
            </div>
          )}

          {busy && (
            <div className="bgr-progress">
              <span>{status === 'loading' ? `${t.loadingModel} ${progress ? `${progress}%` : ''}` : t.processing}</span>
              <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${status === 'loading' ? progress : 100}%` }} /></div>
            </div>
          )}

          {status === 'error' && <p className="color-invalid">{t.error}</p>}

          <div className="tool-actions">
            {status !== 'done' && <button type="button" className="tool-btn primary" onClick={run} disabled={busy}>{busy ? '…' : t.run}</button>}
            {resultUrl && <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>}
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()} disabled={busy}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      {aiBrowserHint(language) && <p className="tool-local-note aid-warn">⚠️ {aiBrowserHint(language)}</p>}
      <p className="tool-local-note">🔒 {t.modelNote}</p>
    </div>
  );
}

export default BackgroundRemover;
