import { useEffect, useRef, useState } from 'react';
import { aiBrowserHint } from '../../utils/aiSupport';
import { guidedFilter } from '../../utils/guidedFilter';

// Вырезатель фона: сегментация в браузере через transformers.js. Модели на выбор:
// BiRefNet lite (MIT, лучшие края), MODNet (быстрые портреты), RMBG 1.4. Маска
// уточняется guided filter'ом по оригиналу (волосы, мех), дальше — жёсткость края,
// замена фона и ручная кисть «стереть/вернуть». Изображение НЕ уходит на сервер.

const TEXT = {
  ru: {
    drop: 'Загрузите фото (лучше с человеком или объектом)', hint: 'PNG, JPG, WebP — обрабатывается локально',
    run: 'Убрать фон', loadingModel: 'Загрузка модели…', processing: 'Обработка…',
    download: 'Скачать PNG', change: 'Другое фото', modelNote: 'Модель скачивается один раз и кешируется браузером. Дальше — без интернета.',
    refine: 'Уточнить края по оригиналу (волосы, мех)', hardness: 'Жёсткость края', bg: 'Фон',
    bgT: 'Прозрачный', bgW: 'Белый', bgC: 'Цвет', bgB: 'Размытый оригинал', resetEdits: 'Правки кистью сбросятся',
    error: 'Не удалось обработать. Попробуйте другое изображение или браузер на Chromium.',
    errorHeavy: 'BiRefNet не поместился в память браузера (нужен WebGPU). Выберите MODNet или откройте страницу в Chrome/Edge с поддержкой WebGPU.',
    noGpu: 'WebGPU недоступен — BiRefNet будет работать медленно и может не хватить памяти.',
    original: 'Оригинал', result: 'Без фона', model: 'Модель',
    brush: 'Кисть', erase: 'Стереть', restore: 'Вернуть', size: 'Размер',
    editHint: 'Рисуйте по картинке: «Стереть» убирает лишнее, «Вернуть» возвращает случайно срезанное.',
  },
  en: {
    drop: 'Upload a photo (a person or object works best)', hint: 'PNG, JPG, WebP — processed locally',
    run: 'Remove background', loadingModel: 'Loading model…', processing: 'Processing…',
    download: 'Download PNG', change: 'Another photo', modelNote: 'The model downloads once and is cached by the browser. After that it works offline.',
    refine: 'Refine edges from the original (hair, fur)', hardness: 'Edge hardness', bg: 'Background',
    bgT: 'Transparent', bgW: 'White', bgC: 'Color', bgB: 'Blurred original', resetEdits: 'Brush edits will be reset',
    error: 'Could not process. Try another image or a Chromium browser.',
    errorHeavy: 'BiRefNet did not fit into browser memory (WebGPU needed). Pick MODNet or open the page in Chrome/Edge with WebGPU.',
    noGpu: 'WebGPU is unavailable — BiRefNet will be slow and may run out of memory.',
    original: 'Original', result: 'No background', model: 'Model',
    brush: 'Brush', erase: 'Erase', restore: 'Restore', size: 'Size',
    editHint: 'Paint over the image: “Erase” removes leftovers, “Restore” brings back accidentally cut parts.',
  },
};

export const MODELS = [
  {
    id: 'onnx-community/BiRefNet_lite-ONNX', input: 'input_image', output: 'output_image', sigmoid: true, dtype: 'fp32',
    ru: 'BiRefNet — лучшие края, любые объекты (~220 МБ)', en: 'BiRefNet — best edges, any subject (~220 MB)',
  },
  { id: 'Xenova/modnet', input: 'input', ru: 'MODNet — быстро, портреты и люди (~25 МБ)', en: 'MODNet — fast, portraits & people (~25 MB)' },
  { id: 'briaai/RMBG-1.4', input: 'input', ru: 'RMBG 1.4 — универсальная (некоммерческая лицензия)', en: 'RMBG 1.4 — general (non-commercial license)' },
];

// Кэшируем модели между открытиями тула в рамках сессии (по id).
const modelCache = {};
async function getModel(spec, onProgress) {
  const modelId = spec.id;
  if (modelCache[modelId]) return modelCache[modelId];
  modelCache[modelId] = (async () => {
    const lib = await import('@huggingface/transformers');
    const { AutoModel, AutoProcessor, env } = lib;
    env.allowLocalModels = false;
    let device = 'wasm';
    try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) device = 'webgpu'; } catch { /* wasm */ }
    const opts = { device, progress_callback: onProgress };
    if (spec.dtype) opts.dtype = spec.dtype;
    const model = await AutoModel.from_pretrained(modelId, opts);
    const processor = await AutoProcessor.from_pretrained(modelId);
    return { model, processor, RawImage: lib.RawImage };
  })().catch((e) => { delete modelCache[modelId]; throw e; });
  return modelCache[modelId];
}

const WORK_MAX = 2048; // guided filter считаем не выше этого разрешения — по памяти/скорости

// Из «сырой» маски модели собираем итоговый вырез: guided filter + жёсткость края.
function composeCutout(base, { refine, hardness }) {
  const { origCanvas, mask, w, h } = base;
  let alpha = mask;
  if (refine) {
    const s = Math.min(1, WORK_MAX / Math.max(w, h));
    const ww = Math.max(1, Math.round(w * s)); const hh = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas'); c.width = ww; c.height = hh;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(origCanvas, 0, 0, ww, hh);
    const g = cx.getImageData(0, 0, ww, hh).data;
    const guide = new Float32Array(ww * hh);
    for (let i = 0; i < guide.length; i += 1) guide[i] = (0.299 * g[i * 4] + 0.587 * g[i * 4 + 1] + 0.114 * g[i * 4 + 2]) / 255;
    // Маску кладём в альфу полноразмерного canvas и масштабируем к рабочему размеру.
    const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
    const mctx = mc.getContext('2d', { willReadFrequently: true });
    const mimg = mctx.createImageData(w, h);
    for (let i = 0; i < mask.length; i += 1) mimg.data[i * 4 + 3] = mask[i];
    mctx.putImageData(mimg, 0, 0);
    cx.clearRect(0, 0, ww, hh); cx.drawImage(mc, 0, 0, ww, hh);
    const md = cx.getImageData(0, 0, ww, hh).data;
    const pm = new Float32Array(ww * hh);
    for (let i = 0; i < pm.length; i += 1) pm[i] = md[i * 4 + 3] / 255;
    const q = guidedFilter(guide, pm, ww, hh, Math.max(3, Math.round(Math.max(ww, hh) / 320)), 2e-3);
    const qi = cx.createImageData(ww, hh);
    for (let i = 0; i < q.length; i += 1) qi.data[i * 4 + 3] = Math.round(q[i] * 255);
    cx.putImageData(qi, 0, 0);
    mctx.clearRect(0, 0, w, h); mctx.imageSmoothingQuality = 'high'; mctx.drawImage(c, 0, 0, w, h);
    const up = mctx.getImageData(0, 0, w, h).data;
    // Фильтр размазывает по фону «дымку» из почти нулевой альфы — отсекаем её:
    // уверенный фон/объект исходной маски остаются 0/255, уточняется только кромка.
    alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < alpha.length; i += 1) {
      const q = up[i * 4 + 3]; const m = mask[i];
      if (m < 8 && q < 40) alpha[i] = 0;
      else if (m > 247 && q > 215) alpha[i] = 255;
      else alpha[i] = q < 10 ? 0 : q > 245 ? 255 : q;
    }
  }
  const k = 1 + hardness / 12;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(origCanvas, 0, 0);
  const px = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < alpha.length; i += 1) {
    px.data[i * 4 + 3] = hardness
      ? Math.round(Math.max(0, Math.min(1, (alpha[i] / 255 - 0.5) * k + 0.5)) * 255)
      : alpha[i];
  }
  ctx.putImageData(px, 0, 0);
  return out;
}

function BackgroundRemover({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | processing | done | error
  const [progress, setProgress] = useState(0);
  // BiRefNet на WASM (без WebGPU) упирается в память вкладки — там по умолчанию MODNet.
  const [modelId, setModelId] = useState(MODELS[1].id);
  const [hasGpu, setHasGpu] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (navigator.gpu && await navigator.gpu.requestAdapter() && alive) { setHasGpu(true); setModelId(MODELS[0].id); }
      } catch { /* нет WebGPU */ }
    })();
    return () => { alive = false; };
  }, []);
  const [brushMode, setBrushMode] = useState('erase'); // erase | restore
  const [brushSize, setBrushSize] = useState(40);
  const [cursor, setCursor] = useState({ x: 0, y: 0, on: false }); // прицел кисти
  const [refine, setRefine] = useState(true);
  const [hardness, setHardness] = useState(0);
  const [bgMode, setBgMode] = useState('transparent');
  const [bgColor, setBgColor] = useState('#ffffff');
  const baseRef = useRef(null); // { origCanvas, mask, w, h } — сырая маска модели

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

  // Смена уточнения/жёсткости — пересобираем вырез из сырой маски (правки кистью сбрасываются).
  useEffect(() => {
    if (status !== 'done' || !baseRef.current || !editCanvasRef.current) return;
    const cut = composeCutout(baseRef.current, { refine, hardness });
    const ctx = editCanvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, cut.width, cut.height);
    ctx.drawImage(cut, 0, 0);
  }, [refine, hardness]); // eslint-disable-line react-hooks/exhaustive-deps

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
  function onPointerMove(e) {
    setCursor({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, on: true });
    if (painting.current) paintTo(canvasPoint(e));
  }
  function onPointerUp() { painting.current = false; lastPt.current = null; }
  function onPointerLeaveCanvas() { painting.current = false; lastPt.current = null; setCursor((c) => ({ ...c, on: false })); }

  async function run() {
    if (!srcUrl) return;
    const spec = MODELS.find((m) => m.id === modelId) || MODELS[0];
    try {
      setStatus('loading');
      setProgress(0);
      const { model, processor, RawImage } = await getModel(spec, (p) => {
        if (p && p.status === 'progress' && p.total) {
          setProgress(Math.round((p.loaded / p.total) * 100));
        }
      });

      setStatus('processing');
      const image = await RawImage.fromURL(srcUrl);
      const { pixel_values } = await processor(image);
      const out = await model({ [spec.input]: pixel_values });
      // Разные модели возвращают маску под разными ключами — берём нужный или первый тензор.
      let tensor = (spec.output && out[spec.output]) || out.output || out.last_hidden_state || Object.values(out)[0];
      tensor = tensor[0];
      if (spec.sigmoid) tensor = tensor.sigmoid();
      const maskImg = await RawImage.fromTensor(tensor.mul(255).to('uint8')).resize(image.width, image.height);

      const bmp = await createImageBitmap(await (await fetch(srcUrl)).blob());
      const origCanvas = document.createElement('canvas');
      origCanvas.width = image.width; origCanvas.height = image.height;
      origCanvas.getContext('2d').drawImage(bmp, 0, 0);
      const mask = new Uint8ClampedArray(image.width * image.height);
      const ch = maskImg.channels || 1;
      for (let i = 0; i < mask.length; i += 1) mask[i] = maskImg.data[i * ch];
      baseRef.current = { origCanvas, mask, w: image.width, h: image.height };

      const resultCanvas = composeCutout(baseRef.current, { refine, hardness });
      pendingRef.current = { resultCanvas, origCanvas };
      setResultUrl('ready');
      setStatus('done');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  function download() {
    const cut = editCanvasRef.current;
    if (!cut) return;
    let out = cut;
    if (bgMode !== 'transparent') {
      out = document.createElement('canvas'); out.width = cut.width; out.height = cut.height;
      const ctx = out.getContext('2d');
      if (bgMode === 'blur' && origCanvasRef.current) {
        ctx.filter = `blur(${Math.round(Math.max(cut.width, cut.height) / 80)}px)`;
        ctx.drawImage(origCanvasRef.current, 0, 0);
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = bgMode === 'white' ? '#ffffff' : bgColor;
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.drawImage(cut, 0, 0);
    }
    out.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = bgMode === 'transparent' ? 'no-bg.png' : 'new-bg.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
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
                <div
                  className={bgMode === 'transparent' ? 'bgr-checker bgr-edit' : 'bgr-edit bgr-solid'}
                  style={bgMode === 'white' ? { background: '#fff' } : bgMode === 'color' ? { background: bgColor } : undefined}
                >
                  {bgMode === 'blur' && <img src={srcUrl} alt="" className="bgr-blur-bg" aria-hidden="true" />}
                  <canvas
                    ref={editCanvasRef}
                    className={`bgr-canvas mode-${brushMode}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerLeaveCanvas}
                  />
                  {cursor.on && (
                    <span
                      className={`bgr-cursor mode-${brushMode}`}
                      style={{ left: cursor.x, top: cursor.y, width: brushSize, height: brushSize }}
                      aria-hidden="true"
                    />
                  )}
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

          {status === 'done' && (
            <div className="bgr-brush">
              <label className="tool-check" title={t.resetEdits}>
                <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} /> {t.refine}
              </label>
              <div className="tool-field">
                <span className="tool-field-label">{t.hardness}: {hardness}</span>
                <input type="range" min="0" max="100" value={hardness} onChange={(e) => setHardness(Number(e.target.value))} title={t.resetEdits} />
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.bg}</span>
                <div className="segmented">
                  {[['transparent', t.bgT], ['white', t.bgW], ['color', t.bgC], ['blur', t.bgB]].map(([id, label]) => (
                    <button key={id} type="button" className={bgMode === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setBgMode(id)}>{label}</button>
                  ))}
                </div>
                {bgMode === 'color' && <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />}
              </div>
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

          {status === 'error' && <p className="color-invalid">{modelId === MODELS[0].id && !hasGpu ? t.errorHeavy : t.error}</p>}
          {!busy && status !== 'done' && modelId === MODELS[0].id && !hasGpu && <p className="tool-local-note aid-warn">⚠️ {t.noGpu}</p>}

          <div className="tool-actions">
            {status !== 'done' && <button type="button" className="tool-btn primary" onClick={run} disabled={busy}>{busy ? '…' : t.run}</button>}
            {status === 'done' && <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>}
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
