import { useCallback, useEffect, useRef, useState } from 'react';

// Растровый редактор V1 (браузерный, локальный). Слои с режимами наложения и
// непрозрачностью, инструменты (кисть/ластик/заливка/пипетка/прямоугольник/эллипс/
// линия/текст/перемещение), коррекции (яркость/контраст/насыщенность/инверсия/чб),
// undo/redo, импорт картинки слоем, экспорт PNG. Полноценный «фотошоп» — отдельный
// проект; здесь рабочее ядро для быстрых правок. Всё считается в браузере.

const BLEND = [
  ['source-over', 'Обычный'], ['multiply', 'Умножение'], ['screen', 'Экран'], ['overlay', 'Перекрытие'],
  ['darken', 'Затемнение'], ['lighten', 'Замена светлым'], ['color-dodge', 'Осветление основы'],
  ['color-burn', 'Затемнение основы'], ['hard-light', 'Жёсткий свет'], ['soft-light', 'Мягкий свет'],
  ['difference', 'Разница'], ['exclusion', 'Исключение'], ['hue', 'Цветовой тон'], ['saturation', 'Насыщенность'],
  ['color', 'Цветность'], ['luminosity', 'Свечение'],
];
const TOOLS = [
  ['brush', '🖌', 'Кисть'], ['eraser', '🧽', 'Ластик'], ['fill', '🪣', 'Заливка'], ['picker', '💧', 'Пипетка'],
  ['move', '✥', 'Перемещение'], ['rect', '▭', 'Прямоугольник'], ['ellipse', '◯', 'Эллипс'], ['line', '╱', 'Линия'],
  ['text', 'T', 'Текст'],
];

const T = {
  ru: { newDoc: 'Новый холст', open: 'Открыть картинку', layer: 'Слой', add: 'Слой', addImg: 'Картинкой', del: 'Удалить', up: '↑', down: '↓',
    color: 'Цвет', size: 'Размер', opacity: 'Непрозр.', blend: 'Наложение', undo: 'Отменить', redo: 'Вернуть', png: 'Экспорт PNG',
    adjust: 'Коррекция', bright: 'Яркость', contrast: 'Контраст', satur: 'Насыщ.', invert: 'Инверсия', gray: 'Ч/б', apply: 'Применить', reset: 'Сброс',
    note: 'Изображение обрабатывается локально — файлы не уходят на сервер.', textPrompt: 'Текст:' },
  en: { newDoc: 'New canvas', open: 'Open image', layer: 'Layer', add: 'Layer', addImg: 'As image', del: 'Delete', up: '↑', down: '↓',
    color: 'Color', size: 'Size', opacity: 'Opacity', blend: 'Blend', undo: 'Undo', redo: 'Redo', png: 'Export PNG',
    adjust: 'Adjust', bright: 'Brightness', contrast: 'Contrast', satur: 'Saturation', invert: 'Invert', gray: 'B/W', apply: 'Apply', reset: 'Reset',
    note: 'The image is processed locally — files never leave your device.', textPrompt: 'Text:' },
};

let lid = 0;
function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function makeLayer(w, h, name, draw) {
  lid += 1;
  const canvas = newCanvas(w, h);
  if (draw) draw(canvas.getContext('2d'));
  return { id: lid, name, canvas, visible: true, opacity: 1, blend: 'source-over' };
}

function RasterEditor({ language = 'ru' }) {
  const t = T[language] || T.ru;
  const dispRef = useRef(null);
  const wrapRef = useRef(null);
  const fileRef = useRef(null);
  const dragRef = useRef(null);
  const histRef = useRef([]); // { id, before }
  const redoRef = useRef([]);

  const [doc, setDoc] = useState(null); // { w, h }
  const [layers, setLayers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#6166ff');
  const [size, setSize] = useState(14);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [adjust, setAdjust] = useState(null); // { snapshot, b, c, s }
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const active = layers.find((l) => l.id === activeId) || null;

  const composite = useCallback(() => {
    const disp = dispRef.current; if (!disp || !doc) return;
    disp.width = doc.w; disp.height = doc.h;
    const ctx = disp.getContext('2d');
    ctx.clearRect(0, 0, doc.w, doc.h);
    // шахматка прозрачности
    const s = 12; ctx.fillStyle = '#20202a'; ctx.fillRect(0, 0, doc.w, doc.h);
    ctx.fillStyle = '#2a2a36';
    for (let y = 0; y < doc.h; y += s) for (let x = 0; x < doc.w; x += s) if (((x / s) + (y / s)) % 2 === 0) ctx.fillRect(x, y, s, s);
    for (const l of layers) {
      if (!l.visible) continue; // eslint-disable-line no-continue
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(l.canvas, 0, 0);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }, [doc, layers]);

  useEffect(() => { composite(); }, [composite, adjust]);

  function startDoc(w, h, firstLayer) {
    lid = 0; histRef.current = []; redoRef.current = [];
    const base = firstLayer || makeLayer(w, h, `${t.layer} 1`);
    setDoc({ w, h }); setLayers([base]); setActiveId(base.id);
  }
  function openImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth; const h = img.naturalHeight;
      const layer = makeLayer(w, h, file.name.replace(/\.[^.]+$/, ''), (c) => c.drawImage(img, 0, 0));
      startDoc(w, h, layer);
    };
    img.src = URL.createObjectURL(file);
  }
  function addImageLayer(file) {
    if (!file || !file.type.startsWith('image/') || !doc) return;
    const img = new Image();
    img.onload = () => {
      const layer = makeLayer(doc.w, doc.h, file.name.replace(/\.[^.]+$/, ''), (c) => {
        const s = Math.min(1, doc.w / img.naturalWidth, doc.h / img.naturalHeight);
        c.drawImage(img, 0, 0, img.naturalWidth * s, img.naturalHeight * s);
      });
      setLayers((prev) => [...prev, layer]); setActiveId(layer.id);
    };
    img.src = URL.createObjectURL(file);
  }

  // --- история ---
  function pushHistory() {
    if (!active) return;
    const ctx = active.canvas.getContext('2d');
    histRef.current.push({ id: active.id, before: ctx.getImageData(0, 0, active.canvas.width, active.canvas.height) });
    if (histRef.current.length > 30) histRef.current.shift();
    redoRef.current = [];
  }
  function undo() {
    const h = histRef.current.pop(); if (!h) return;
    const layer = layers.find((l) => l.id === h.id); if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    redoRef.current.push({ id: h.id, before: ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height) });
    ctx.putImageData(h.before, 0, 0); composite(); rerender();
  }
  function redo() {
    const h = redoRef.current.pop(); if (!h) return;
    const layer = layers.find((l) => l.id === h.id); if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    histRef.current.push({ id: h.id, before: ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height) });
    ctx.putImageData(h.before, 0, 0); composite(); rerender();
  }

  // --- координаты указателя в системе документа ---
  function docXY(e) {
    const disp = dispRef.current; const rect = disp.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  function floodFill(ctx, x, y, hex) {
    const { width: w, height: h } = ctx.canvas;
    const img = ctx.getImageData(0, 0, w, h); const d = img.data;
    const px = Math.floor(x); const py = Math.floor(y); if (px < 0 || py < 0 || px >= w || py >= h) return;
    const i0 = (py * w + px) * 4;
    const tr = d[i0]; const tg = d[i0 + 1]; const tb = d[i0 + 2]; const ta = d[i0 + 3];
    const nr = parseInt(hex.slice(1, 3), 16); const ng = parseInt(hex.slice(3, 5), 16); const nb = parseInt(hex.slice(5, 7), 16);
    if (tr === nr && tg === ng && tb === nb && ta === 255) return;
    const tol = 32; const stack = [i0]; const seen = new Uint8Array(w * h);
    const match = (i) => Math.abs(d[i] - tr) <= tol && Math.abs(d[i + 1] - tg) <= tol && Math.abs(d[i + 2] - tb) <= tol && Math.abs(d[i + 3] - ta) <= tol;
    while (stack.length) {
      const i = stack.pop(); const p = i / 4; if (seen[p]) continue; // eslint-disable-line no-continue
      if (!match(i)) continue; // eslint-disable-line no-continue
      seen[p] = 1; d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; d[i + 3] = 255;
      const cx = p % w; const cy = (p - cx) / w;
      if (cx > 0) stack.push(i - 4); if (cx < w - 1) stack.push(i + 4);
      if (cy > 0) stack.push(i - w * 4); if (cy < h - 1) stack.push(i + w * 4);
    }
    ctx.putImageData(img, 0, 0);
  }

  function onDown(e) {
    if (!active || adjust) return;
    e.preventDefault();
    const { x, y } = docXY(e);
    const ctx = active.canvas.getContext('2d');
    if (tool === 'picker') {
      const p = dispRef.current.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      setColor(`#${[p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`); return;
    }
    if (tool === 'fill') { pushHistory(); floodFill(ctx, x, y, color); composite(); return; }
    if (tool === 'text') {
      const str = window.prompt(t.textPrompt); if (!str) return;
      pushHistory(); ctx.fillStyle = color; ctx.textBaseline = 'top';
      ctx.font = `${Math.max(8, size * 2.2)}px system-ui, sans-serif`; ctx.fillText(str, x, y); composite(); return;
    }
    pushHistory();
    if (tool === 'move') {
      dragRef.current = { tool, sx: x, sy: y, snapshot: ctx.getImageData(0, 0, active.canvas.width, active.canvas.height) };
    } else if (tool === 'brush' || tool === 'eraser') {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = size;
      ctx.globalAlpha = tool === 'eraser' ? 1 : brushOpacity;
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y);
      ctx.stroke();
      dragRef.current = { tool, lastX: x, lastY: y };
    } else {
      // фигуры — превью на снапшоте
      dragRef.current = { tool, sx: x, sy: y, snapshot: ctx.getImageData(0, 0, active.canvas.width, active.canvas.height) };
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function onMove(e) {
    const d = dragRef.current; if (!d || !active) return;
    const { x, y } = docXY(e);
    const ctx = active.canvas.getContext('2d');
    if (d.tool === 'brush' || d.tool === 'eraser') {
      ctx.beginPath(); ctx.moveTo(d.lastX, d.lastY); ctx.lineTo(x, y); ctx.stroke();
      d.lastX = x; d.lastY = y; composite(); return;
    }
    // move и фигуры перерисовываются от снапшота
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.putImageData(d.snapshot, 0, 0);
    if (d.tool === 'move') {
      const dx = x - d.sx; const dy = y - d.sy;
      const tmp = newCanvas(active.canvas.width, active.canvas.height); tmp.getContext('2d').putImageData(d.snapshot, 0, 0);
      ctx.clearRect(0, 0, active.canvas.width, active.canvas.height); ctx.drawImage(tmp, dx, dy);
    } else {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round';
      const w = x - d.sx; const h = y - d.sy;
      if (d.tool === 'rect') ctx.fillRect(d.sx, d.sy, w, h);
      else if (d.tool === 'ellipse') { ctx.beginPath(); ctx.ellipse(d.sx + w / 2, d.sy + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); ctx.fill(); }
      else if (d.tool === 'line') { ctx.beginPath(); ctx.moveTo(d.sx, d.sy); ctx.lineTo(x, y); ctx.stroke(); }
    }
    composite();
  }
  function onUp() {
    const ctx = active && active.canvas.getContext('2d');
    if (ctx) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    rerender();
  }

  // --- коррекции ---
  function openAdjust() { if (!active) return; const ctx = active.canvas.getContext('2d'); setAdjust({ snapshot: ctx.getImageData(0, 0, active.canvas.width, active.canvas.height), b: 0, c: 0, s: 0 }); }
  function applyAdjustPreview(a) {
    if (!active) return;
    const ctx = active.canvas.getContext('2d');
    const src = a.snapshot; const out = ctx.createImageData(src.width, src.height);
    const sd = src.data; const od = out.data;
    const br = a.b; const cf = (259 * (a.c + 255)) / (255 * (259 - a.c)); const sat = 1 + a.s / 100;
    for (let i = 0; i < sd.length; i += 4) {
      let r = sd[i] + br; let g = sd[i + 1] + br; let b = sd[i + 2] + br;
      r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sat; g = gray + (g - gray) * sat; b = gray + (b - gray) * sat;
      od[i] = Math.max(0, Math.min(255, r)); od[i + 1] = Math.max(0, Math.min(255, g)); od[i + 2] = Math.max(0, Math.min(255, b)); od[i + 3] = sd[i + 3];
    }
    ctx.putImageData(out, 0, 0); composite();
  }
  function commitAdjust() { pushHistoryFromSnapshot(adjust.snapshot); setAdjust(null); }
  function cancelAdjust() { if (active && adjust) { active.canvas.getContext('2d').putImageData(adjust.snapshot, 0, 0); composite(); } setAdjust(null); }
  function pushHistoryFromSnapshot(before) { if (!active) return; histRef.current.push({ id: active.id, before }); redoRef.current = []; }

  function instantFilter(kind) {
    if (!active) return; pushHistory();
    const ctx = active.canvas.getContext('2d'); const im = ctx.getImageData(0, 0, active.canvas.width, active.canvas.height); const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (kind === 'invert') { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
      else { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = g; d[i + 1] = g; d[i + 2] = g; }
    }
    ctx.putImageData(im, 0, 0); composite();
  }

  // --- слои ---
  function addLayer() { if (!doc) return; const l = makeLayer(doc.w, doc.h, `${t.layer} ${layers.length + 1}`); setLayers((p) => [...p, l]); setActiveId(l.id); }
  function delLayer(id) { setLayers((p) => { const n = p.filter((l) => l.id !== id); if (id === activeId) setActiveId(n[n.length - 1]?.id ?? null); return n; }); }
  function moveLayer(id, dir) {
    setLayers((p) => { const i = p.findIndex((l) => l.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }
  function patchLayer(id, upd) { setLayers((p) => p.map((l) => (l.id === id ? { ...l, ...upd } : l))); }

  function exportPng() {
    const out = newCanvas(doc.w, doc.h); const ctx = out.getContext('2d');
    for (const l of layers) { if (!l.visible) continue; ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend; ctx.drawImage(l.canvas, 0, 0); }
    out.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'design.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png');
  }

  if (!doc) {
    return (
      <div className="tool-panel raster-editor">
        <div className="re-start">
          <button type="button" className="tool-btn primary" onClick={() => startDoc(1280, 720)}>{t.newDoc} 1280×720</button>
          <button type="button" className="tool-btn" onClick={() => startDoc(1080, 1080)}>{t.newDoc} 1080×1080</button>
          <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()}>{t.open}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { openImage(e.target.files[0]); e.target.value = ''; }} />
        <p className="tool-local-note">🔒 {t.note}</p>
      </div>
    );
  }

  return (
    <div className="tool-panel raster-editor">
      <div className="re-toolbar">
        <div className="re-tools">
          {TOOLS.map(([id, icon, label]) => (
            <button key={id} type="button" title={label} className={tool === id ? 're-tool is-active' : 're-tool'} onClick={() => setTool(id)}>{icon}</button>
          ))}
        </div>
        <label className="re-swatch" title={t.color}><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /><span style={{ background: color }} /></label>
        <label className="re-num">{t.size}<input type="range" min="1" max="120" value={size} onChange={(e) => setSize(Number(e.target.value))} /><b>{size}</b></label>
        <label className="re-num">{t.opacity}<input type="range" min="0.05" max="1" step="0.05" value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} /></label>
        <div className="re-toolbar-spacer" />
        <button type="button" className="tool-btn small" onClick={undo} title={t.undo}>↺</button>
        <button type="button" className="tool-btn small" onClick={redo} title={t.redo}>↻</button>
        <label className="re-num">{Math.round(zoom * 100)}%<input type="range" min="0.1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <button type="button" className="tool-btn primary small" onClick={exportPng}>{t.png}</button>
      </div>

      <div className="re-body">
        <div className="re-canvas-wrap" ref={wrapRef}>
          <canvas ref={dispRef} className="re-canvas" style={{ width: doc.w * zoom, height: doc.h * zoom, cursor: tool === 'move' ? 'move' : 'crosshair' }} onPointerDown={onDown} />
        </div>

        <div className="re-side">
          {adjust ? (
            <div className="re-panel">
              <div className="re-panel-title">{t.adjust}</div>
              <label className="re-num col">{t.bright} {adjust.b}<input type="range" min="-100" max="100" value={adjust.b} onChange={(e) => { const a = { ...adjust, b: Number(e.target.value) }; setAdjust(a); applyAdjustPreview(a); }} /></label>
              <label className="re-num col">{t.contrast} {adjust.c}<input type="range" min="-100" max="100" value={adjust.c} onChange={(e) => { const a = { ...adjust, c: Number(e.target.value) }; setAdjust(a); applyAdjustPreview(a); }} /></label>
              <label className="re-num col">{t.satur} {adjust.s}<input type="range" min="-100" max="100" value={adjust.s} onChange={(e) => { const a = { ...adjust, s: Number(e.target.value) }; setAdjust(a); applyAdjustPreview(a); }} /></label>
              <div className="re-panel-actions">
                <button type="button" className="tool-btn primary small" onClick={commitAdjust}>{t.apply}</button>
                <button type="button" className="tool-btn small ghost" onClick={cancelAdjust}>{t.reset}</button>
              </div>
            </div>
          ) : (
            <div className="re-panel">
              <div className="re-panel-title">{t.adjust}</div>
              <div className="re-adj-btns">
                <button type="button" className="tool-btn small" onClick={openAdjust}>🎚 {t.bright}/{t.contrast}</button>
                <button type="button" className="tool-btn small" onClick={() => instantFilter('invert')}>{t.invert}</button>
                <button type="button" className="tool-btn small" onClick={() => instantFilter('gray')}>{t.gray}</button>
              </div>
            </div>
          )}

          <div className="re-panel re-layers">
            <div className="re-panel-title">{t.layer}
              <span className="re-layer-add">
                <button type="button" className="tool-btn small" onClick={addLayer}>+ {t.add}</button>
                <button type="button" className="tool-btn small ghost" onClick={() => fileRef.current?.click()}>+ {t.addImg}</button>
              </span>
            </div>
            <ul className="re-layer-list">
              {[...layers].reverse().map((l) => (
                <li key={l.id} className={l.id === activeId ? 're-layer is-active' : 're-layer'} onClick={() => setActiveId(l.id)}>
                  <button type="button" className="re-vis" onClick={(e) => { e.stopPropagation(); patchLayer(l.id, { visible: !l.visible }); }}>{l.visible ? '👁' : '—'}</button>
                  <span className="re-layer-name">{l.name}</span>
                  <button type="button" className="re-mini-btn" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }} title={t.up}>↑</button>
                  <button type="button" className="re-mini-btn" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }} title={t.down}>↓</button>
                  <button type="button" className="re-mini-btn" onClick={(e) => { e.stopPropagation(); delLayer(l.id); }} title={t.del}>✕</button>
                </li>
              ))}
            </ul>
            {active && (
              <div className="re-layer-props">
                <label className="re-num col">{t.opacity} {Math.round(active.opacity * 100)}%<input type="range" min="0" max="1" step="0.01" value={active.opacity} onChange={(e) => patchLayer(active.id, { opacity: Number(e.target.value) })} /></label>
                <label className="re-num col">{t.blend}
                  <select value={active.blend} onChange={(e) => patchLayer(active.id, { blend: e.target.value })}>
                    {BLEND.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; if (layers.length) addImageLayer(f); else openImage(f); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default RasterEditor;
