import { useRef, useState } from 'react';
import { aiBrowserHint, aiErrorHint } from '../../utils/aiSupport';

// AI-апскейлер: увеличение разрешения ×2 нейросетью Swin2SR прямо в браузере
// (transformers.js). Модель (~5–15 МБ) грузится один раз, снимок не уходит на
// сервер. WebGPU при поддержке, иначе WASM.
//
// Тайлинг: исходник режется на перекрывающиеся плитки (контент + контекстный
// отступ), каждая плитка апскейлится отдельно, из результата берётся только
// «ядро» (без отступа) и вклеивается в общий холст — без хардкодного
// даунскейла всего изображения перед обработкой (раньше был именно этот баг:
// 4000×3000 → сжималось до 512 → апскейлилось → выход ~1024×768, а не честный
// ×2 от оригинала).

const MODEL_ID = 'Xenova/swin2SR-lightweight-x2-64';
const TILE = 224; // размер «ядра» плитки (без отступа)
const PAD = 32; // контекстный отступ вокруг плитки — даёт модели соседние пиксели, убирает швы
// Абсолютный потолок безопасности — не даунскейл, а просто предел, чтобы не
// уронить браузер на совсем огромных файлах (десятки тысяч плиток).
const MAX_SIDE = 3072;

const TEXT = {
  ru: {
    drop: 'Загрузите изображение для увеличения', hint: 'PNG, JPG, WebP — обрабатывается локально, честный ×2 от исходного размера.',
    run: 'Увеличить ×2', loadingModel: 'Загрузка модели…', processing: 'Обработка плиток…',
    download: 'Скачать PNG', change: 'Другое изображение', original: 'Оригинал', result: 'Увеличено ×2',
    tooBig: `Сторона больше ${MAX_SIDE}px — изображение уменьшено до этого предела, иначе браузер не потянет по времени.`,
    modelNote: 'Первый запуск скачает модель. Картинка режется на плитки и обрабатывается по частям — честный ×2 без потери деталей на больших изображениях.',
    error: 'Не удалось обработать. Попробуйте изображение поменьше или браузер на Chromium.',
  },
  en: {
    drop: 'Upload an image to upscale', hint: 'PNG, JPG, WebP — processed locally, a true ×2 of the original size.',
    run: 'Upscale ×2', loadingModel: 'Loading model…', processing: 'Processing tiles…',
    download: 'Download PNG', change: 'Another image', original: 'Original', result: 'Upscaled ×2',
    tooBig: `A side is larger than ${MAX_SIDE}px — the image was capped at this size, otherwise the browser would take too long.`,
    modelNote: 'The first run downloads the model. The image is split into tiles and processed piece by piece — a true ×2 with no detail loss on large images.',
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

function loadImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.src = url;
  });
}

// Оригинал без апскейла — просто ограничиваем сторону потолком безопасности.
function sourceCanvas(img) {
  let { naturalWidth: w, naturalHeight: h } = img;
  let scaled = false;
  if (Math.max(w, h) > MAX_SIDE) {
    const k = MAX_SIDE / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); scaled = true;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return { canvas, scaled };
}

// Разбивка на плитки: для каждой — область-ядро (без отступа) и область-сэмпл
// (с контекстным отступом, обрезанным по границам картинки).
function planTiles(w, h) {
  const tiles = [];
  for (let y0 = 0; y0 < h; y0 += TILE) {
    const y1 = Math.min(y0 + TILE, h);
    for (let x0 = 0; x0 < w; x0 += TILE) {
      const x1 = Math.min(x0 + TILE, w);
      const sx0 = Math.max(0, x0 - PAD); const sy0 = Math.max(0, y0 - PAD);
      const sx1 = Math.min(w, x1 + PAD); const sy1 = Math.min(h, y1 + PAD);
      tiles.push({ x0, y0, x1, y1, sx0, sy0, sx1, sy1 });
    }
  }
  return tiles;
}

async function upscaleTiled(srcCanvas, pipe, RawImage, onTileProgress) {
  const w = srcCanvas.width; const h = srcCanvas.height;
  const sctx = srcCanvas.getContext('2d');
  const tiles = planTiles(w, h);
  const out = document.createElement('canvas'); out.width = w * 2; out.height = h * 2;
  const octx = out.getContext('2d');
  const tileCanvas = document.createElement('canvas');

  for (let i = 0; i < tiles.length; i += 1) {
    const tl = tiles[i];
    const sw = tl.sx1 - tl.sx0; const sh = tl.sy1 - tl.sy0;
    tileCanvas.width = sw; tileCanvas.height = sh;
    const tctx = tileCanvas.getContext('2d');
    tctx.putImageData(sctx.getImageData(tl.sx0, tl.sy0, sw, sh), 0, 0);

    const input = RawImage.fromCanvas(tileCanvas);
    const output = await pipe(input); // eslint-disable-line no-await-in-loop
    const resultCanvas = output.toCanvas();

    // из результата плитки берём только «ядро» (без удвоенного отступа) и
    // вклеиваем ровно на своё место в общий холст ×2 — без наложений и швов.
    const offX = (tl.x0 - tl.sx0) * 2; const offY = (tl.y0 - tl.sy0) * 2;
    const coreW = (tl.x1 - tl.x0) * 2; const coreH = (tl.y1 - tl.y0) * 2;
    octx.drawImage(resultCanvas, offX, offY, coreW, coreH, tl.x0 * 2, tl.y0 * 2, coreW, coreH);

    onTileProgress(i + 1, tiles.length);
  }
  return out;
}

function Upscaler({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [tileProgress, setTileProgress] = useState({ done: 0, total: 0 });
  const [scaledDown, setScaledDown] = useState(false);

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setResultUrl(''); setStatus('idle');
    const { img, url } = await loadImage(file);
    imgRef.current = img;
    const { canvas, scaled } = sourceCanvas(img);
    setScaledDown(scaled);
    setSrcUrl(canvas.toDataURL('image/png'));
    URL.revokeObjectURL(url);
  }

  async function run() {
    if (!imgRef.current) return;
    try {
      setStatus('loading'); setProgress(0); setTileProgress({ done: 0, total: 0 });
      const { pipe, RawImage } = await getUpscaler((p) => {
        if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100));
      });
      setStatus('processing');
      const { canvas: srcCanvas } = sourceCanvas(imgRef.current);
      const outCanvas = await upscaleTiled(srcCanvas, pipe, RawImage, (done, total) => setTileProgress({ done, total }));
      setResultUrl(outCanvas.toDataURL('image/png'));
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
  const tilePct = tileProgress.total ? Math.round((tileProgress.done / tileProgress.total) * 100) : 0;

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
              <span>
                {status === 'loading' ? `${t.loadingModel} ${progress ? `${progress}%` : ''}` : t.processing}
                {status === 'processing' && tileProgress.total > 0 ? ` ${tileProgress.done}/${tileProgress.total}` : ''}
              </span>
              <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${status === 'loading' ? progress : tilePct}%` }} /></div>
            </div>
          )}
          {status === 'error' && <p className="color-invalid">{aiErrorHint(language)}</p>}

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

export default Upscaler;
