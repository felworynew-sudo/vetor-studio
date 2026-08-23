import { useRef, useState } from 'react';

// Вырезатель фона: сегментация в браузере через transformers.js (модель MODNet).
// Модель (~25 МБ) скачивается один раз при первом запуске и работает локально —
// изображение НЕ уходит на сервер. WebGPU при поддержке, иначе WASM.

const TEXT = {
  ru: {
    drop: 'Загрузите фото (лучше с человеком или объектом)', hint: 'PNG, JPG, WebP — обрабатывается локально',
    run: 'Убрать фон', loadingModel: 'Загрузка модели…', processing: 'Обработка…',
    download: 'Скачать PNG', change: 'Другое фото', modelNote: 'Первый запуск скачает модель (~25 МБ). Дальше — мгновенно и без интернета.',
    error: 'Не удалось обработать. Попробуйте другое изображение или браузер на Chromium.',
    original: 'Оригинал', result: 'Без фона',
  },
  en: {
    drop: 'Upload a photo (a person or object works best)', hint: 'PNG, JPG, WebP — processed locally',
    run: 'Remove background', loadingModel: 'Loading model…', processing: 'Processing…',
    download: 'Download PNG', change: 'Another photo', modelNote: 'The first run downloads the model (~25 MB). After that it is instant and offline.',
    error: 'Could not process. Try another image or a Chromium browser.',
    original: 'Original', result: 'No background',
  },
};

// Кэшируем модель между открытиями тула в рамках сессии.
let modelPromise = null;
async function getModel(onProgress) {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    const { AutoModel, AutoProcessor, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    let device;
    try {
      device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
    } catch { device = 'wasm'; }
    const model = await AutoModel.from_pretrained('Xenova/modnet', { device, progress_callback: onProgress });
    const processor = await AutoProcessor.from_pretrained('Xenova/modnet');
    const lib = await import('@huggingface/transformers');
    return { model, processor, RawImage: lib.RawImage };
  })();
  return modelPromise;
}

function BackgroundRemover({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | processing | done | error
  const [progress, setProgress] = useState(0);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setResultUrl('');
    setStatus('idle');
    setSrcUrl(URL.createObjectURL(file));
  }

  async function run() {
    if (!srcUrl) return;
    try {
      setStatus('loading');
      setProgress(0);
      const { model, processor, RawImage } = await getModel((p) => {
        if (p && p.status === 'progress' && p.total) {
          setProgress(Math.round((p.loaded / p.total) * 100));
        }
      });

      setStatus('processing');
      const image = await RawImage.fromURL(srcUrl);
      const { pixel_values } = await processor(image);
      const { output } = await model({ input: pixel_values });
      const maskData = output[0].mul(255).to('uint8');
      const mask = await RawImage.fromTensor(maskData).resize(image.width, image.height);

      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      const bmp = await createImageBitmap(await (await fetch(srcUrl)).blob());
      ctx.drawImage(bmp, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height);
      for (let i = 0; i < mask.data.length; i += 1) {
        pixels.data[i * 4 + 3] = mask.data[i];
      }
      ctx.putImageData(pixels, 0, 0);
      setResultUrl(canvas.toDataURL('image/png'));
      setStatus('done');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  function download() {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl; a.download = 'no-bg.png';
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
            {resultUrl && (
              <div className="bgr-cell">
                <span className="bgr-cap">{t.result}</span>
                <div className="bgr-checker"><img src={resultUrl} alt="" className="bgr-img" /></div>
              </div>
            )}
          </div>

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
      <p className="tool-local-note">🔒 {t.modelNote}</p>
    </div>
  );
}

export default BackgroundRemover;
