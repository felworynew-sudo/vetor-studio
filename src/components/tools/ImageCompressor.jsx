import { useCallback, useEffect, useRef, useState } from 'react';
import CompareSlider from './shared/CompareSlider';

// Компрессор изображений на кодеках Squoosh (jSquash, Apache-2.0): MozJPEG, WebP,
// AVIF и OxiPNG вместо браузерного canvas.toBlob — те же файлы получаются заметно
// легче. Режимы: «до N КБ» (бинарный поиск качества, при необходимости уменьшение
// размера) и фиксированное качество. «Авто» пробует форматы и берёт лучший.
// Кодирование в Web Worker, пакетно, ZIP, сравнение до/после. Всё локально.

const FORMATS = [
  { id: 'auto', label: 'Авто', en: 'Auto', ext: '' },
  { id: 'avif', label: 'AVIF', ext: 'avif', mime: 'image/avif' },
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp' },
  { id: 'jpeg', label: 'MozJPEG', ext: 'jpg', mime: 'image/jpeg' },
  { id: 'png', label: 'PNG (OxiPNG)', ext: 'png', mime: 'image/png' },
];
const MAX_SIDES = [0, 3840, 2560, 1920, 1280, 800];

const TEXT = {
  ru: {
    drop: 'Перетащите изображения или нажмите', hint: 'PNG, JPG, WebP, AVIF — можно несколько сразу',
    mode: 'Режим', target: 'До размера', quality: 'Качество', targetKb: 'Целевой размер', qual: 'Качество',
    format: 'Формат', resize: 'Макс. сторона', orig: 'как есть', run: 'Сжать', processing: 'Сжатие…', download: 'Скачать', downloadZip: 'Скачать ZIP',
    clear: 'Очистить', empty: 'Пока нет файлов', tooSmall: 'не удалось уложиться — минимально возможный', compare: 'Сравнить',
    pngLossless: 'PNG сжимается без потерь — целевой размер не применяется, используйте «Качество» (уровень оптимизации).',
    note: 'Кодеки Squoosh работают прямо в браузере, файлы не уходят на сервер. AVIF — самый лёгкий, но кодируется дольше. Прозрачность сохраняется в AVIF, WebP и PNG.',
  },
  en: {
    drop: 'Drop images or click', hint: 'PNG, JPG, WebP, AVIF — several at once are fine',
    mode: 'Mode', target: 'Target size', quality: 'Quality', targetKb: 'Target size', qual: 'Quality',
    format: 'Format', resize: 'Max side', orig: 'original', run: 'Compress', processing: 'Compressing…', download: 'Download', downloadZip: 'Download ZIP',
    clear: 'Clear', empty: 'No files yet', tooSmall: 'could not reach target — smallest possible', compare: 'Compare',
    pngLossless: 'PNG is lossless — target size does not apply; use “Quality” (optimization level).',
    note: 'Squoosh codecs run right in your browser, nothing is uploaded. AVIF is the smallest but slower to encode. Transparency is kept in AVIF, WebP and PNG.',
  },
};

const fmtBytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);

let worker = null; let seq = 0; const pending = new Map();
function encodeInWorker(imageData, format, quality) {
  if (!worker) {
    worker = new Worker(new URL('../../workers/codecWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.buffer); };
  }
  seq += 1; const id = seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, imageData, format, quality }); });
}

async function decodeToImageData(file, maxSide, flatten) {
  const bmp = await createImageBitmap(file);
  let w = bmp.width; let h = bmp.height;
  if (maxSide && Math.max(w, h) > maxSide) { const k = maxSide / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  if (flatten) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return ctx.getImageData(0, 0, w, h);
}

function scaleImageData(src, k) {
  const c = new OffscreenCanvas(src.width, src.height); c.getContext('2d').putImageData(src, 0, 0);
  const w = Math.max(1, Math.round(src.width * k)); const h = Math.max(1, Math.round(src.height * k));
  const d = new OffscreenCanvas(w, h); const ctx = d.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Максимальное качество, при котором файл влезает в лимит; иначе уменьшаем размер.
async function fitTarget(data0, format, targetBytes) {
  let data = data0;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    let lo = 5; let hi = 95;
    const minBuf = await encodeInWorker(data, format, lo); // eslint-disable-line no-await-in-loop
    if (minBuf.byteLength <= targetBytes) {
      let best = minBuf; let bestQ = lo;
      for (let s = 0; s < 6; s += 1) {
        const mid = Math.round((lo + hi) / 2);
        const buf = await encodeInWorker(data, format, mid); // eslint-disable-line no-await-in-loop
        if (buf.byteLength <= targetBytes) { best = buf; bestQ = mid; lo = mid; } else hi = mid;
        if (hi - lo <= 2) break;
      }
      return { buffer: best, quality: bestQ, width: data.width, warn: false };
    }
    if (attempt === 6) return { buffer: minBuf, quality: lo, width: data.width, warn: true };
    data = scaleImageData(data, 0.8);
  }
  return null;
}

// PSNR результата относительно исходника (на уменьшенной копии) — объективная мера
// искажений, одинаковая для всех кодеков: номера «качества» у AVIF/WebP/JPEG несопоставимы.
async function psnr(ref, buffer, mime) {
  const bmp = await createImageBitmap(new Blob([buffer], { type: mime }));
  const k = Math.min(1, 512 / Math.max(ref.width, ref.height));
  const w = Math.max(1, Math.round(ref.width * k)); const h = Math.max(1, Math.round(ref.height * k));
  const a = new OffscreenCanvas(ref.width, ref.height); a.getContext('2d').putImageData(ref, 0, 0);
  const ca = new OffscreenCanvas(w, h); const xa = ca.getContext('2d'); xa.drawImage(a, 0, 0, w, h);
  const cb = new OffscreenCanvas(w, h); const xb = cb.getContext('2d'); xb.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const da = xa.getImageData(0, 0, w, h).data; const db = xb.getImageData(0, 0, w, h).data;
  let se = 0;
  for (let i = 0; i < da.length; i += 4) { for (let c = 0; c < 3; c += 1) { const d = da[i + c] - db[i + c]; se += d * d; } }
  const mse = se / (w * h * 3);
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

function ImageCompressor({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('target');
  const [targetKb, setTargetKb] = useState(200);
  const [quality, setQuality] = useState(75);
  const [format, setFormat] = useState('auto');
  const [maxSide, setMaxSide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [compareId, setCompareId] = useState('');
  const itemsRef = useRef(items); itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((it) => { if (it.outUrl) URL.revokeObjectURL(it.outUrl); if (it.inUrl) URL.revokeObjectURL(it.inUrl); }), []);

  const addFiles = useCallback((list) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, inSize: file.size, inUrl: URL.createObjectURL(file), outUrl: '', outSize: 0, outName: '', status: 'idle', warn: false, note: '' }))]);
  }, []);

  async function compress(item) {
    const fmts = format === 'auto' ? ['avif', 'webp', 'jpeg'] : [format];
    const lossy = format !== 'png';
    let best = null;
    const results = [];
    for (const f of fmts) {
      const data = await decodeToImageData(item.file, maxSide, f === 'jpeg'); // eslint-disable-line no-await-in-loop
      let r;
      if (mode === 'target' && lossy) r = await fitTarget(data, f, targetKb * 1024); // eslint-disable-line no-await-in-loop
      else r = { buffer: await encodeInWorker(data, f, quality), quality, width: data.width, warn: false }; // eslint-disable-line no-await-in-loop
      r.format = f;
      r.size = r.buffer.byteLength;
      if (fmts.length > 1 || lossy) {
        const ref = r.width === data.width ? data : scaleImageData(data, r.width / data.width);
        r.psnr = await psnr(ref, r.buffer, FORMATS.find((x) => x.id === f).mime); // eslint-disable-line no-await-in-loop
      }
      results.push(r);
    }
    if (results.length === 1) [best] = results;
    else if (mode === 'target') {
      // Все уложились в лимит — берём с наибольшим разрешением, затем с лучшим PSNR.
      best = results.reduce((a, b) => ((b.width > a.width || (b.width === a.width && b.psnr > a.psnr)) ? b : a));
    } else {
      // Качество: самый лёгкий среди тех, чьи искажения не хуже лучшего более чем на 1.5 dB.
      const top = Math.max(...results.map((r) => r.psnr));
      best = results.filter((r) => r.psnr >= top - 1.5).reduce((a, b) => (b.size < a.size ? b : a));
    }
    const meta = FORMATS.find((x) => x.id === best.format);
    const blob = new Blob([best.buffer], { type: meta.mime });
    const base = item.name.replace(/\.[^.]+$/, '');
    return {
      outUrl: URL.createObjectURL(blob), outSize: blob.size, outName: `${base}.${meta.ext}`, blob, warn: best.warn,
      note: `${meta.label}${lossy ? ` · q${best.quality}` : ''}${best.psnr ? ` · PSNR ${best.psnr.toFixed(1)} dB` : ''}`,
    };
  }

  async function runAll() {
    setBusy(true);
    for (const item of itemsRef.current) {
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'working' } : it)));
      try {
        const r = await compress(item); // eslint-disable-line no-await-in-loop
        if (item.outUrl) URL.revokeObjectURL(item.outUrl);
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...r, status: 'done' } : it)));
        setCompareId((cur) => cur || item.id);
      } catch (e) {
        console.error(e);
        setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it)));
      }
    }
    setBusy(false);
  }

  function dl(item) { const a = document.createElement('a'); a.href = item.outUrl; a.download = item.outName; document.body.appendChild(a); a.click(); a.remove(); }
  async function dlZip() {
    const { zipSync } = await import('fflate');
    const files = {};
    const used = new Set();
    for (const it of items.filter((x) => x.blob)) {
      let name = it.outName; let k = 1;
      while (used.has(name)) { name = it.outName.replace(/(\.[^.]+)$/, `-${k}$1`); k += 1; }
      used.add(name);
      files[name] = [new Uint8Array(await it.blob.arrayBuffer()), { level: 0 }]; // eslint-disable-line no-await-in-loop
    }
    const zip = zipSync(files);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); a.download = 'compressed.zip';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const doneItems = items.filter((it) => it.status === 'done');
  const cmp = items.find((it) => it.id === compareId && it.outUrl);
  const totalIn = doneItems.reduce((s, it) => s + it.inSize, 0); const totalOut = doneItems.reduce((s, it) => s + it.outSize, 0);

  return (
    <div className="tool-panel compressor">
      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          <div className="segmented">
            {FORMATS.map((f) => <button key={f.id} type="button" className={format === f.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFormat(f.id)}>{language === 'en' && f.en ? f.en : f.label}</button>)}
          </div>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.mode}</span>
          <div className="segmented">
            <button type="button" className={mode === 'target' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('target')}>{t.target}</button>
            <button type="button" className={mode === 'quality' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode('quality')}>{t.quality}</button>
          </div>
        </div>
        {mode === 'target' ? (
          <div className="tool-field"><span className="tool-field-label">{t.targetKb}: {targetKb} KB</span><input type="range" min="20" max="3000" step="10" value={targetKb} onChange={(e) => setTargetKb(Number(e.target.value))} /></div>
        ) : (
          <div className="tool-field"><span className="tool-field-label">{t.qual}: {quality}</span><input type="range" min="5" max="100" step="1" value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></div>
        )}
        <div className="tool-field">
          <span className="tool-field-label">{t.resize}</span>
          <select className="cb-select" value={maxSide} onChange={(e) => setMaxSide(Number(e.target.value))}>
            {MAX_SIDES.map((m) => <option key={m} value={m}>{m ? `${m}px` : t.orig}</option>)}
          </select>
        </div>
      </div>
      {format === 'png' && mode === 'target' && <p className="tool-local-note aid-warn">⚠️ {t.pngLossless}</p>}

      <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={runAll} disabled={busy}>{busy ? t.processing : `${t.run} (${items.length})`}</button>
          {doneItems.length > 1 && <button type="button" className="tool-btn" onClick={dlZip}>{t.downloadZip} ({doneItems.length})</button>}
          <button type="button" className="tool-btn ghost" onClick={() => { items.forEach((it) => { if (it.outUrl) URL.revokeObjectURL(it.outUrl); URL.revokeObjectURL(it.inUrl); }); setItems([]); setCompareId(''); }} disabled={busy}>{t.clear}</button>
          {doneItems.length > 0 && <span className="convert-sizes">Σ {fmtBytes(totalIn)} → <strong>{fmtBytes(totalOut)}</strong> <span className="convert-delta">(−{Math.max(0, Math.round((1 - totalOut / totalIn) * 100))}%)</span></span>}
        </div>
      )}

      {cmp && <CompareSlider before={cmp.inUrl} after={cmp.outUrl} language={language} beforeLabel={fmtBytes(cmp.inSize)} afterLabel={`${fmtBytes(cmp.outSize)} · ${cmp.note}`} />}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => (
          <li key={item.id} className={`convert-row status-${item.status}${item.id === compareId ? ' is-current' : ''}`}>
            <span className="convert-name" title={item.name}>{item.name}{item.note && <span className="ae-detected">{item.note}</span>}{item.warn && <span className="ae-detected">{t.tooSmall}</span>}</span>
            <span className="convert-sizes">
              {fmtBytes(item.inSize)}
              {item.status === 'done' && <> <span className="convert-arrow">→</span> <strong>{fmtBytes(item.outSize)}</strong> <span className="convert-delta">(−{Math.max(0, Math.round((1 - item.outSize / item.inSize) * 100))}%)</span></>}
            </span>
            {item.status === 'done' ? (
              <span className="convert-btns">
                <button type="button" className="tool-btn small ghost" onClick={() => setCompareId(item.id)}>{t.compare}</button>
                <button type="button" className="tool-btn small" onClick={() => dl(item)}>{t.download}</button>
              </span>
            ) : item.status === 'error' ? <span className="convert-error">⚠</span> : <span className="convert-pending">{item.status === 'working' ? '…' : '•'}</span>}
          </li>
        ))}
      </ul>

      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default ImageCompressor;
