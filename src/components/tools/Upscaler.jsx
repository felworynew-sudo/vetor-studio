import { useRef, useState } from 'react';

// AI-апскейлер: увеличение разрешения ×2 нейросетью Swin2SR прямо в браузере
// (transformers.js). Модель (~5–15 МБ) грузится один раз, снимок не уходит на
// сервер. WebGPU при поддержке, иначе WASM.

const MODEL_ID = 'Xenova/swin2SR-lightweight-x2-64';
const MAX_SIDE = 1024; // выше — очень медленно/тяжело для браузера

const TEXT = {
  ru: {
    drop: 'Загрузите изображение для увеличения', hint: 'PNG, JPG, WebP — обрабатывается локально. Лучше до 1024px по стороне.',
    run: 'Увеличить ×2', loadingModel: 'Загрузка модели…', processing: 'Обработка (может занять время)…',
    download: 'Скачать PNG', change: 'Другое изображение', original: 'Оригинал', result: 'Увеличено ×2',
    tooBig: `Сторона больше ${MAX_SIDE}px — изображение сначала уменьшено, иначе браузер не потянет.`,
    modelNote: 'Первый запуск скачает модель. Апскейл нейросетью медленнее обычного, но качественнее.',
    error: 'Не удалось обработать. Попробуйте изображение поменьше или браузер на Chromium.',
  },
  en: {
    drop: 'Upload an image to upscale', hint: 'PNG, JPG, WebP — processed locally. Up to 1024px per side is best.',
    run: 'Upscale ×2', loadingModel: 'Loading model…', processing: 'Processing (may take a while)…',
    download: 'Download PNG', change: 'Another image', original: 'Original', result: 'Upscaled ×2',
    tooBig: `A side is larger than ${MAX_SIDE}px — the image was downscaled first, otherwise the browser can’t handle it.`,
    modelNote: 'The first run downloads the model. Neural upscaling is slower than plain resizing, but higher quality.',
    error: 'Could not process. Try a smaller image or a Chromium browser.',
  },
};

let pipePromise = null;
async function getUpscaler(onProgress) {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    const lib = await import('@huggingface/transformers');
    lib.env.allowLocalModels = false;
    let device;
    try { device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm'; } catch { device = 'wasm'; }
    const pipe = await lib.pipeline('image-to-image', MODEL_ID, { device, progress_callback: onProgress });
    return { pipe, RawImage: lib.RawImage };
  })();
  return pipePromise;
}

function LoadToDataURL(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      let scaled = false;
      if (Math.max(w, h) > MAX_SIDE) {
        const k = MAX_SIDE / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); scaled = true;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL('image/png'), scaled });
    };
    img.src = url;
  });
}

function Upscaler({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [scaledDown, setScaledDown] = useState(false);

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setResultUrl(''); setStatus('idle');
    const { dataUrl, scaled } = await LoadToDataURL(file);
    setScaledDown(scaled);
    setSrcUrl(dataUrl);
  }

  async function run() {
    if (!srcUrl) return;
    try {
      setStatus('loading'); setProgress(0);
      const { pipe, RawImage } = await getUpscaler((p) => {
        if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100));
      });
      setStatus('processing');
      const input = await RawImage.fromURL(srcUrl);
      const output = await pipe(input);
      const outCanvas = output.toCanvas();
      const c = document.createElement('canvas');
      c.width = output.width; c.height = output.height;
      c.getContext('2d').drawImage(outCanvas, 0, 0);
      setResultUrl(c.toDataURL('image/png'));
      setStatus('done');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  function download() {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl; a.download = 'upscaled.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const busy = status === 'loading' || status === 'processing';

  return (
    <div className="tool-panel bg-remover upscaler">
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
          {scaledDown && <p className="tool-local-note">⚠️ {t.tooBig}</p>}
          <div className="bgr-compare">
            <div className="bgr-cell">
              <span className="bgr-cap">{t.original}</span>
              <img src={srcUrl} alt="" className="bgr-img" />
            </div>
            {resultUrl && (
              <div className="bgr-cell">
                <span className="bgr-cap">{t.result}</span>
                <img src={resultUrl} alt="" className="bgr-img" />
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

export default Upscaler;
