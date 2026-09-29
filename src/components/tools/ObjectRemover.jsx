import { useRef, useState } from 'react';
import CompareSlider from './shared/CompareSlider';

// Удаление объектов: закрасьте лишнее кистью — область заполнится фоном, собранным
// из остальной картинки (многомасштабный PatchMatch в Web Worker, без нейросетей
// и загрузок). Обрабатывается только окрестность выделения — остальное фото
// остаётся в исходном качестве. Можно повторять, есть отмена и сравнение.

const TEXT = {
  ru: {
    drop: 'Загрузите фото', hint: 'Провода, прохожие, мусор, надписи, прыщики — закрасьте и нажмите «Удалить»', brush: 'Кисть', size: 'Размер', paint: 'Выделить', erase: 'Стереть выделение',
    remove: 'Удалить выделенное', working: 'Заполняю…', undo: 'Отменить', clearMask: 'Сбросить выделение', download: 'Скачать', compare: 'Сравнить с оригиналом', edit: 'К редактированию', change: 'Другое фото',
    note: 'Лучше всего работает на однородном фоне: небо, стена, трава, песок, вода. Крупные объекты удаляйте частями.',
  },
  en: {
    drop: 'Upload a photo', hint: 'Wires, passers-by, litter, text, blemishes — paint over and press “Remove”', brush: 'Brush', size: 'Size', paint: 'Select', erase: 'Erase selection',
    remove: 'Remove selection', working: 'Filling…', undo: 'Undo', clearMask: 'Clear selection', download: 'Download', compare: 'Compare with original', edit: 'Back to editing', change: 'Another photo',
    note: 'Works best on uniform backgrounds: sky, wall, grass, sand, water. Remove large objects in parts.',
  },
};

let worker = null; let seq = 0; const pending = new Map();
function runInpaint(payload, onProgress) {
  if (!worker) {
    worker = new Worker(new URL('../../workers/inpaintWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id); if (!p) return;
      if (e.data.progress != null) { p.onProgress?.(e.data.progress); return; }
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.rgb);
    };
  }
  seq += 1; const id = seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ id, ...payload }, [payload.rgb, payload.mask]); });
}

const WORK = 720; // максимальная сторона обрабатываемой области

function ObjectRemover({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgCanvas = useRef(null); const maskCanvas = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [orig, setOrig] = useState('');
  const [mode, setMode] = useState('paint');
  const [size, setSize] = useState(40);
  const [busy, setBusy] = useState(0);
  const [history, setHistory] = useState([]);
  const [compare, setCompare] = useState('');
  const [name, setName] = useState('photo');
  const painting = useRef(false); const last = useRef(null);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setName(file.name.replace(/\.[^.]+$/, ''));
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.round(img.naturalWidth * k); const H = Math.round(img.naturalHeight * k);
      setLoaded(true); setOrig(url); setHistory([]); setCompare('');
      setTimeout(() => {
        const c = imgCanvas.current; const m = maskCanvas.current; c.width = W; c.height = H; m.width = W; m.height = H;
        c.getContext('2d').drawImage(img, 0, 0, W, H);
      });
    };
    img.src = url;
  }

  const pt = (e) => { const c = maskCanvas.current; const r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, k: c.width / r.width }; };
  function stroke(p) {
    const x = maskCanvas.current.getContext('2d');
    x.globalCompositeOperation = mode === 'paint' ? 'source-over' : 'destination-out';
    x.strokeStyle = 'rgba(255,40,90,0.55)'; x.fillStyle = 'rgba(255,40,90,0.55)'; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = size * p.k;
    x.beginPath();
    if (last.current) { x.moveTo(last.current.x, last.current.y); x.lineTo(p.x, p.y); x.stroke(); } else { x.arc(p.x, p.y, (size * p.k) / 2, 0, Math.PI * 2); x.fill(); }
    last.current = p;
  }

  async function remove() {
    const c = imgCanvas.current; const m = maskCanvas.current; const W = c.width; const H = c.height;
    const md = m.getContext('2d').getImageData(0, 0, W, H).data;
    let x0 = W; let y0 = H; let x1 = -1; let y1 = -1;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (md[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return;
    // Окрестность: выделение + запас в 1.5 его размера (источник фона для патчей).
    const ext = Math.max(x1 - x0, y1 - y0) * 1.5 + 40;
    const rx = Math.max(0, Math.floor(x0 - ext)); const ry = Math.max(0, Math.floor(y0 - ext));
    const rw = Math.min(W, Math.ceil(x1 + ext)) - rx; const rh = Math.min(H, Math.ceil(y1 + ext)) - ry;
    const s = Math.min(1, WORK / Math.max(rw, rh)); const ww = Math.max(16, Math.round(rw * s)); const wh = Math.max(16, Math.round(rh * s));
    const tmp = document.createElement('canvas'); tmp.width = ww; tmp.height = wh; const tx = tmp.getContext('2d', { willReadFrequently: true });
    tx.drawImage(c, rx, ry, rw, rh, 0, 0, ww, wh); const id = tx.getImageData(0, 0, ww, wh).data;
    tx.clearRect(0, 0, ww, wh); tx.drawImage(m, rx, ry, rw, rh, 0, 0, ww, wh); const mk = tx.getImageData(0, 0, ww, wh).data;
    const rgb = new Float32Array(ww * wh * 3); const mask = new Uint8Array(ww * wh);
    for (let i = 0; i < ww * wh; i += 1) { rgb[i * 3] = id[i * 4]; rgb[i * 3 + 1] = id[i * 4 + 1]; rgb[i * 3 + 2] = id[i * 4 + 2]; mask[i] = mk[i * 4 + 3] > 8 ? 1 : 0; }
    // Расширяем дыру на 2 px, чтобы не подхватить ореол объекта.
    const dil = mask.slice();
    for (let y = 0; y < wh; y += 1) for (let x = 0; x < ww; x += 1) if (mask[y * ww + x]) for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) { const xx = x + dx; const yy = y + dy; if (xx >= 0 && yy >= 0 && xx < ww && yy < wh) dil[yy * ww + xx] = 1; }
    setHistory((h) => [...h, c.getContext('2d').getImageData(0, 0, W, H)]);
    setBusy(0.01);
    try {
      const out = new Float32Array(await runInpaint({ rgb: rgb.buffer, mask: dil.buffer, w: ww, h: wh }, (p) => setBusy(Math.max(0.01, p))));
      const res = tx.createImageData(ww, wh);
      for (let i = 0; i < ww * wh; i += 1) { res.data[i * 4] = out[i * 3]; res.data[i * 4 + 1] = out[i * 3 + 1]; res.data[i * 4 + 2] = out[i * 3 + 2]; res.data[i * 4 + 3] = 255; }
      tx.putImageData(res, 0, 0);
      // Вклеиваем только внутри выделения с мягким краем.
      const patch = document.createElement('canvas'); patch.width = rw; patch.height = rh; const px = patch.getContext('2d');
      px.drawImage(tmp, 0, 0, rw, rh);
      px.globalCompositeOperation = 'destination-in'; px.filter = `blur(${Math.max(1, 2 / s)}px)`;
      const md2 = document.createElement('canvas'); md2.width = rw; md2.height = rh; const mx2 = md2.getContext('2d');
      mx2.drawImage(m, rx, ry, rw, rh, 0, 0, rw, rh); mx2.globalCompositeOperation = 'source-in'; mx2.fillStyle = '#000'; mx2.fillRect(0, 0, rw, rh);
      px.drawImage(md2, 0, 0); px.filter = 'none';
      c.getContext('2d').drawImage(patch, rx, ry);
      m.getContext('2d').clearRect(0, 0, W, H);
    } catch (e) { console.error(e); }
    setBusy(0);
  }

  function undo() {
    setHistory((h) => { if (!h.length) return h; imgCanvas.current.getContext('2d').putImageData(h[h.length - 1], 0, 0); return h.slice(0, -1); });
  }
  function download() { imgCanvas.current.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${name}-clean.png`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png'); }

  return (
    <div className="tool-panel object-remover">
      {!loaded ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <>
          <div className="tool-controls">
            <div className="tool-field"><span className="tool-field-label">{t.brush}</span>
              <div className="segmented">{[['paint', t.paint], ['erase', t.erase]].map(([id, l]) => <button key={id} type="button" className={mode === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode(id)}>{l}</button>)}</div>
            </div>
            <label className="tool-field"><span className="tool-field-label">{t.size}: {size}px</span><input type="range" min="6" max="160" value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
          </div>
          {compare && <CompareSlider before={orig} after={compare} language={language} />}
          {/* Холсты не размонтируем в режиме сравнения — в них живёт результат. */}
          <div className="or-stage" style={compare ? { display: 'none' } : undefined}>
              <canvas ref={imgCanvas} className="or-img" />
              <canvas
                ref={maskCanvas} className="or-mask"
                onPointerDown={(e) => { if (busy) return; painting.current = true; last.current = null; e.currentTarget.setPointerCapture?.(e.pointerId); stroke(pt(e)); }}
                onPointerMove={(e) => { if (painting.current) stroke(pt(e)); }}
                onPointerUp={() => { painting.current = false; last.current = null; }}
              />
              {busy > 0 && <div className="or-busy">{t.working} {Math.round(busy * 100)}%</div>}
          </div>
          <div className="tool-actions">
            {!compare && <button type="button" className="tool-btn primary" onClick={remove} disabled={busy > 0}>{t.remove}</button>}
            {!compare && <button type="button" className="tool-btn" onClick={undo} disabled={!history.length || busy > 0}>{t.undo}</button>}
            {!compare && <button type="button" className="tool-btn" onClick={() => maskCanvas.current.getContext('2d').clearRect(0, 0, maskCanvas.current.width, maskCanvas.current.height)}>{t.clearMask}</button>}
            {compare
              ? <button type="button" className="tool-btn" onClick={() => setCompare('')}>{t.edit}</button>
              : <button type="button" className="tool-btn" onClick={() => setCompare(imgCanvas.current.toDataURL('image/jpeg', 0.9))} disabled={!history.length}>{t.compare}</button>}
            <button type="button" className="tool-btn primary" onClick={download} disabled={busy > 0}>{t.download}</button>
            <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">💡 {t.note}</p>
    </div>
  );
}

export default ObjectRemover;
