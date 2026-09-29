import { useRef, useState } from 'react';
import { aiBrowserHint, aiErrorHint } from '../../utils/aiSupport';
import CompareSlider from './shared/CompareSlider';

// AI-апскейлер с выбором модели (идея model abstraction из UpscalerJS): фото ×2/×4,
// иллюстрации/аниме ×2/×4 (APISR), быстрый ×2 и пиксель-арт без нейросети (Scale2x).
// Прямо в браузере через transformers.js, WebGPU при поддержке, иначе WASM.
//
// Тайлинг: исходник режется на перекрывающиеся плитки (ядро + контекстный отступ),
// из результата каждой берётся только ядро — без швов и без даунскейла оригинала.
// Между плитками отдаём управление браузеру: работает отмена и не виснет вкладка.

const MODELS = [
  { id: 'photo2', repo: 'Xenova/swin2SR-classical-sr-x2-64', scale: 2, mb: 54, ru: 'Фото ×2', en: 'Photo ×2', dru: 'Swin2SR classical — максимум деталей для чистых фото.', den: 'Swin2SR classical — most detail for clean photos.' },
  { id: 'photo4', repo: 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr', scale: 4, mb: 53, ru: 'Фото ×4 (шум, JPEG)', en: 'Photo ×4 (noise, JPEG)', dru: 'Swin2SR real-world — для сжатых, шумных, «живых» снимков.', den: 'Swin2SR real-world — for compressed, noisy, real-life shots.' },
  { id: 'illus2', repo: 'Xenova/2x_APISR_RRDB_GAN_generator-onnx', scale: 2, mb: 18, ru: 'Иллюстрация ×2', en: 'Illustration ×2', dru: 'APISR — рисунки, аниме, комиксы: чистые линии без «мыла».', den: 'APISR — drawings, anime, comics: clean lines, no blur.' },
  { id: 'illus4', repo: 'Xenova/4x_APISR_GRL_GAN_generator-onnx', scale: 4, mb: 7, ru: 'Иллюстрация ×4', en: 'Illustration ×4', dru: 'APISR GRL ×4 — для маленьких артов и иконок.', den: 'APISR GRL ×4 — for small artwork and icons.' },
  { id: 'fast2', repo: 'Xenova/swin2SR-lightweight-x2-64', scale: 2, mb: 8, ru: 'Быстрый ×2', en: 'Fast ×2', dru: 'Лёгкая Swin2SR — быстро, для слабых устройств.', den: 'Lightweight Swin2SR — fast, for weaker devices.' },
  { id: 'pixel', repo: null, scale: 0, mb: 0, ru: 'Пиксель-арт', en: 'Pixel art', dru: 'Без нейросети: Scale2x/EPX сохраняет чёткие пиксели и сглаживает диагонали.', den: 'No neural net: Scale2x/EPX keeps crisp pixels and smooths diagonals.' },
];

const TILE = { 2: 224, 4: 160 };
const PAD = 24;
// Предел входа: чтобы результат не превышал ~8–12k по стороне и не уронил вкладку.
const MAX_IN = { 2: 3072, 4: 2048, 8: 1024 };

const TEXT = {
  ru: {
    drop: 'Загрузите изображение для увеличения', hint: 'PNG, JPG, WebP — обрабатывается локально, честное увеличение от исходного размера.',
    model: 'Модель', factor: 'Увеличение', run: 'Увеличить', cancel: 'Отменить', loadingModel: 'Загрузка модели…', warmup: 'Прогрев модели…',
    processing: 'Плитки', download: 'Скачать PNG', change: 'Другое изображение', original: 'Оригинал', result: 'Результат',
    tooBig: (m) => `Сторона больше ${m}px — вход уменьшен до этого предела, иначе браузер не потянет.`,
    note: 'Модель скачивается один раз и кешируется. Картинка режется на плитки с перекрытием — без швов и потери деталей на больших изображениях.',
    size: (w, h) => `${w}×${h} px`, cancelled: 'Отменено.',
  },
  en: {
    drop: 'Upload an image to upscale', hint: 'PNG, JPG, WebP — processed locally, a true upscale of the original size.',
    model: 'Model', factor: 'Scale', run: 'Upscale', cancel: 'Cancel', loadingModel: 'Loading model…', warmup: 'Warming up…',
    processing: 'Tiles', download: 'Download PNG', change: 'Another image', original: 'Original', result: 'Result',
    tooBig: (m) => `A side is larger than ${m}px — the input was capped, otherwise the browser would struggle.`,
    note: 'The model downloads once and is cached. The image is split into overlapping tiles — no seams and no detail loss on large images.',
    size: (w, h) => `${w}×${h} px`, cancelled: 'Cancelled.',
  },
};

const pipes = new Map();
function getPipe(model, onProgress) {
  if (pipes.has(model.id)) return pipes.get(model.id);
  const p = (async () => {
    const lib = await import('@huggingface/transformers');
    lib.env.allowLocalModels = false;
    let device = 'wasm';
    try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) device = 'webgpu'; } catch { /* wasm */ }
    // fp32 явно: квантованные веса заметно портят мелкие детали апскейла.
    const pipe = await lib.pipeline('image-to-image', model.repo, { device, dtype: 'fp32', progress_callback: onProgress });
    return { pipe, RawImage: lib.RawImage, fresh: true };
  })().catch((e) => { pipes.delete(model.id); throw e; });
  pipes.set(model.id, p);
  return p;
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

function sourceCanvas(img, scale) {
  const max = MAX_IN[scale] || 3072;
  let { naturalWidth: w, naturalHeight: h } = img;
  let capped = 0;
  if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); capped = max; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return { canvas: c, capped };
}

function planTiles(w, h, tile) {
  const tiles = [];
  for (let y0 = 0; y0 < h; y0 += tile) {
    const y1 = Math.min(y0 + tile, h);
    for (let x0 = 0; x0 < w; x0 += tile) {
      const x1 = Math.min(x0 + tile, w);
      tiles.push({ x0, y0, x1, y1, sx0: Math.max(0, x0 - PAD), sy0: Math.max(0, y0 - PAD), sx1: Math.min(w, x1 + PAD), sy1: Math.min(h, y1 + PAD) });
    }
  }
  return tiles;
}

async function upscaleTiled(src, { pipe, RawImage }, scale, onTile, signal) {
  const w = src.width; const h = src.height;
  const sctx = src.getContext('2d');
  const tiles = planTiles(w, h, TILE[scale]);
  const out = document.createElement('canvas'); out.width = w * scale; out.height = h * scale;
  const octx = out.getContext('2d');
  const tc = document.createElement('canvas');
  for (let i = 0; i < tiles.length; i += 1) {
    if (signal.cancelled) throw new Error('cancelled');
    const tl = tiles[i];
    const sw = tl.sx1 - tl.sx0; const sh = tl.sy1 - tl.sy0;
    tc.width = sw; tc.height = sh;
    tc.getContext('2d').putImageData(sctx.getImageData(tl.sx0, tl.sy0, sw, sh), 0, 0);
    const res = (await pipe(RawImage.fromCanvas(tc))).toCanvas(); // eslint-disable-line no-await-in-loop
    // Реальный коэффициент модели берём из выхода (на случай паддинга внутри модели).
    const k = Math.round(res.width / sw) || scale;
    const offX = (tl.x0 - tl.sx0) * k; const offY = (tl.y0 - tl.sy0) * k;
    const cw = (tl.x1 - tl.x0) * k; const ch = (tl.y1 - tl.y0) * k;
    octx.drawImage(res, offX, offY, cw, ch, tl.x0 * scale, tl.y0 * scale, (tl.x1 - tl.x0) * scale, (tl.y1 - tl.y0) * scale);
    onTile(i + 1, tiles.length);
    await nextFrame(); // eslint-disable-line no-await-in-loop
  }
  return out;
}

// Scale2x (EPX, Andrea Mazzoleni): каждый пиксель → 2×2 с учётом соседей.
function scale2x(src) {
  const w = src.width; const h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new ImageData(w * 2, h * 2);
  const d = new Uint32Array(out.data.buffer);
  const p = new Uint32Array(s.buffer.slice(0));
  const at = (x, y) => p[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const P = at(x, y); const A = at(x, y - 1); const B = at(x + 1, y); const C = at(x - 1, y); const D = at(x, y + 1);
      let e0 = P; let e1 = P; let e2 = P; let e3 = P;
      if (A !== D && C !== B) {
        if (C === A) e0 = A;
        if (A === B) e1 = B;
        if (D === C) e2 = C;
        if (B === D) e3 = D;
      }
      const o = y * 2 * w * 2 + x * 2;
      d[o] = e0; d[o + 1] = e1; d[o + w * 2] = e2; d[o + w * 2 + 1] = e3;
    }
  }
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

function Upscaler({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const signalRef = useRef({ cancelled: false });
  const [srcUrl, setSrcUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [resultSize, setResultSize] = useState(null);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [tiles, setTiles] = useState({ done: 0, total: 0 });
  const [modelId, setModelId] = useState('photo2');
  const [pixelFactor, setPixelFactor] = useState(4);
  const [capped, setCapped] = useState(0);
  const model = MODELS.find((m) => m.id === modelId);
  const scale = model.scale || pixelFactor;

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; });
    imgRef.current = img;
    setSrcUrl(url); setResultUrl(''); setResultSize(null); setStatus('idle'); setCapped(0);
  }

  async function run() {
    if (!imgRef.current) return;
    const signal = { cancelled: false };
    signalRef.current = signal;
    try {
      setResultUrl(''); setTiles({ done: 0, total: 0 });
      let out;
      if (!model.repo) {
        setStatus('processing');
        const { canvas, capped: cap } = sourceCanvas(imgRef.current, pixelFactor);
        setCapped(cap);
        out = canvas;
        for (let f = 1; f < pixelFactor; f *= 2) { out = scale2x(out); await nextFrame(); } // eslint-disable-line no-await-in-loop
      } else {
        setStatus('loading'); setProgress(0);
        const pipeObj = await getPipe(model, (p) => { if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100)); });
        if (pipeObj.fresh) {
          // Прогрев: первая инференция компилирует шейдеры/граф — делаем её на крошечной картинке.
          setStatus('warmup');
          const tiny = document.createElement('canvas'); tiny.width = 16; tiny.height = 16;
          await pipeObj.pipe(pipeObj.RawImage.fromCanvas(tiny));
          pipeObj.fresh = false;
        }
        setStatus('processing');
        const { canvas, capped: cap } = sourceCanvas(imgRef.current, model.scale);
        setCapped(cap);
        out = await upscaleTiled(canvas, pipeObj, model.scale, (done, total) => setTiles({ done, total }), signal);
      }
      if (signal.cancelled) throw new Error('cancelled');
      const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
      setResultUrl(URL.createObjectURL(blob));
      setResultSize({ w: out.width, h: out.height });
      setStatus('done');
    } catch (e) {
      if (e.message === 'cancelled') { setStatus('cancelled'); return; }
      console.error(e);
      setStatus('error');
    }
  }

  function download() {
    const a = document.createElement('a');
    a.href = resultUrl; a.download = `upscaled-x${scale}-${modelId}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const busy = status === 'loading' || status === 'processing' || status === 'warmup';
  const tilePct = tiles.total ? Math.round((tiles.done / tiles.total) * 100) : 0;
  const img = imgRef.current;

  return (
    <div className="tool-panel bg-remover upscaler">
      <div className="tool-field">
        <span className="tool-field-label">{t.model}</span>
        <div className="up-models">
          {MODELS.map((m) => (
            <button key={m.id} type="button" className={m.id === modelId ? 'up-model is-active' : 'up-model'} onClick={() => setModelId(m.id)} disabled={busy}>
              <b>{m[language] || m.ru}</b>
              <span>{language === 'en' ? m.den : m.dru}</span>
              {m.mb > 0 && <em>{m.mb} MB</em>}
            </button>
          ))}
        </div>
      </div>
      {!model.repo && (
        <div className="tool-field">
          <span className="tool-field-label">{t.factor}</span>
          <div className="segmented">
            {[2, 4, 8].map((f) => (
              <button key={f} type="button" className={pixelFactor === f ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setPixelFactor(f)}>×{f}</button>
            ))}
          </div>
        </div>
      )}

      {!srcUrl ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          {capped > 0 && <p className="tool-local-note">⚠️ {t.tooBig(capped)}</p>}
          {resultUrl ? (
            <CompareSlider before={srcUrl} after={resultUrl} language={language} beforeLabel={`${t.original} ${img ? t.size(img.naturalWidth, img.naturalHeight) : ''}`} afterLabel={`${t.result} ${resultSize ? t.size(resultSize.w, resultSize.h) : ''}`} pixelated={!model.repo} />
          ) : (
            <div className="bgr-compare"><div className="bgr-cell"><span className="bgr-cap">{t.original} {img ? t.size(img.naturalWidth, img.naturalHeight) : ''}</span><img src={srcUrl} alt="" className="bgr-img" /></div></div>
          )}

          {busy && (
            <div className="bgr-progress">
              <span>
                {status === 'loading' && `${t.loadingModel} ${progress ? `${progress}%` : ''}`}
                {status === 'warmup' && t.warmup}
                {status === 'processing' && `${t.processing} ${tiles.total ? `${tiles.done}/${tiles.total}` : '…'}`}
              </span>
              <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${status === 'loading' ? progress : tilePct}%` }} /></div>
            </div>
          )}
          {status === 'error' && <p className="color-invalid">{aiErrorHint(language)}</p>}
          {status === 'cancelled' && <p className="tool-local-note">{t.cancelled}</p>}

          <div className="tool-actions">
            {!busy && <button type="button" className="tool-btn primary" onClick={run}>{t.run} ×{scale}</button>}
            {busy && <button type="button" className="tool-btn" onClick={() => { signalRef.current.cancelled = true; }}>{t.cancel}</button>}
            {resultUrl && <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>}
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()} disabled={busy}>{t.change}</button>
          </div>
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      {aiBrowserHint(language) && <p className="tool-local-note aid-warn">⚠️ {aiBrowserHint(language)}</p>}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Upscaler;
