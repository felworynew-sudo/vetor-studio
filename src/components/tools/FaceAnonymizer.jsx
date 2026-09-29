import { useEffect, useRef, useState } from 'react';
import { detectFaces, loadImageFile } from '../../utils/smartCropEngine';

// Анонимизация лиц: детектор MediaPipe BlazeFace (с тайлингом для мелких лиц на
// групповых фото) находит лица, их размывают, пикселизуют или закрывают плашкой.
// Области можно добавить рамкой вручную (номера машин, бейджи) или убрать лишние.
// Пакетно, экспорт в исходном формате, метаданные (EXIF/GPS) не переносятся.

const TEXT = {
  ru: {
    drop: 'Перетащите фото (можно несколько)', hint: 'Лица найдутся автоматически; всё локально', method: 'Способ', blur: 'Размытие', pixel: 'Пиксели', bar: 'Плашка', emoji: 'Смайл',
    strength: 'Сила', padding: 'Запас вокруг лица', shape: 'Форма', ellipse: 'Овал', rect: 'Прямоугольник', color: 'Цвет плашки',
    detecting: 'Ищу лица…', found: (n) => `Лиц: ${n}`, draw: 'Добавить область — протяните рамку по фото. Клик по области — убрать.',
    download: 'Скачать', all: 'Скачать всё (ZIP)', clear: 'Очистить',
    note: 'Модель скачивается один раз и работает офлайн. Экспорт перерисовывает картинку — EXIF и GPS-координаты удаляются. Проверьте результат глазами: детектор может пропустить лицо в профиль или в тени.',
  },
  en: {
    drop: 'Drop photos (several at once)', hint: 'Faces are found automatically; everything stays local', method: 'Method', blur: 'Blur', pixel: 'Pixelate', bar: 'Bar', emoji: 'Emoji',
    strength: 'Strength', padding: 'Padding around the face', shape: 'Shape', ellipse: 'Ellipse', rect: 'Rectangle', color: 'Bar color',
    detecting: 'Finding faces…', found: (n) => `Faces: ${n}`, draw: 'Add an area — drag a box over the photo. Click an area to remove it.',
    download: 'Download', all: 'Download all (ZIP)', clear: 'Clear',
    note: 'The model downloads once and works offline. Export redraws the image — EXIF and GPS are removed. Check the result: the detector may miss faces in profile or in shadow.',
  },
};

function render(item, o, maxSide = Infinity) {
  const { img } = item;
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k); const H = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
  item.boxes.forEach((b0) => {
    const pad = o.padding;
    const b = { x: (b0.x - b0.w * pad) * k, y: (b0.y - b0.h * pad * 1.2) * k, w: b0.w * (1 + 2 * pad) * k, h: b0.h * (1 + 2.4 * pad) * k };
    x.save(); x.beginPath();
    if (o.shape === 'ellipse') x.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); else x.rect(b.x, b.y, b.w, b.h);
    x.clip();
    if (o.method === 'blur') {
      x.filter = `blur(${Math.max(4, (Math.max(b.w, b.h) * o.strength) / 6)}px)`;
      // Рисуем с запасом, чтобы край размытия не подтягивал резкие пиксели.
      x.drawImage(c, b.x - b.w * 0.3, b.y - b.h * 0.3, b.w * 1.6, b.h * 1.6, b.x - b.w * 0.3, b.y - b.h * 0.3, b.w * 1.6, b.h * 1.6);
      x.filter = 'none';
    } else if (o.method === 'pixel') {
      const cells = Math.max(3, Math.round(14 - o.strength * 11));
      const t = document.createElement('canvas'); t.width = cells; t.height = Math.max(3, Math.round(cells * (b.h / b.w)));
      t.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, t.width, t.height);
      x.imageSmoothingEnabled = false; x.drawImage(t, b.x, b.y, b.w, b.h);
    } else if (o.method === 'bar') {
      x.fillStyle = o.color; x.fillRect(b.x, b.y, b.w, b.h);
    } else {
      x.fillStyle = '#ffd33d'; x.fillRect(b.x, b.y, b.w, b.h);
      x.font = `${Math.min(b.w, b.h) * 0.9}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('🙂', b.x + b.w / 2, b.y + b.h / 2 + Math.min(b.w, b.h) * 0.05);
    }
    x.restore();
  });
  return c;
}

function FaceAnonymizer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null); const stageRef = useRef(null); const previewRef = useRef(null);
  const [items, setItems] = useState([]); // { id, img, url, name, type, boxes }
  const [active, setActive] = useState('');
  const [busy, setBusy] = useState(false);
  const [o, setO] = useState({ method: 'blur', strength: 0.7, padding: 0.15, shape: 'ellipse', color: '#111111' });
  const [drag, setDrag] = useState(null);
  const set = (k, v) => setO((p) => ({ ...p, [k]: v }));
  const item = items.find((i) => i.id === active);

  async function add(list) {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      const { img, url } = await loadImageFile(f); // eslint-disable-line no-await-in-loop
      let boxes = [];
      try { boxes = (await detectFaces(img)).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })); } catch (e) { console.warn(e); } // eslint-disable-line no-await-in-loop
      const it = { id: `${Date.now()}-${f.name}`, img, url, name: f.name.replace(/\.[^.]+$/, ''), type: f.type, boxes };
      setItems((p) => [...p, it]); setActive((a) => a || it.id);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!item || !previewRef.current) return;
    const c = render(item, o, 1400); const p = previewRef.current; p.width = c.width; p.height = c.height; p.getContext('2d').drawImage(c, 0, 0);
  }, [item, o]);

  const toImg = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * item.img.naturalWidth, y: ((e.clientY - r.top) / r.height) * item.img.naturalHeight };
  };
  function down(e) {
    if (e.target.classList.contains('fa-box')) return;
    e.preventDefault(); const p = toImg(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    const move = (ev) => { const q = toImg(ev); setDrag((d) => ({ ...d, x1: q.x, y1: q.y })); };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const q = toImg(ev);
      const b = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
      if (b.w > 6 && b.h > 6) {
        // Ручная область уже нужного размера — компенсируем запас, который добавит рендер.
        const k = 1 + 2 * o.padding; const kh = 1 + 2.4 * o.padding;
        const adj = { w: b.w / k, h: b.h / kh }; adj.x = b.x + (b.w - adj.w) / 2; adj.y = b.y + (b.h - adj.h) / 2;
        setItems((list) => list.map((it) => (it.id === active ? { ...it, boxes: [...it.boxes, adj] } : it)));
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  const mime = (it) => (it.type === 'image/png' ? 'image/png' : it.type === 'image/webp' ? 'image/webp' : 'image/jpeg');
  const ext = (it) => mime(it).split('/')[1].replace('jpeg', 'jpg');
  function downloadOne(it) { render(it, o).toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${it.name}-anon.${ext(it)}`; document.body.appendChild(a); a.click(); a.remove(); }, mime(it), 0.93); }
  async function downloadAll() {
    const { zipSync } = await import('fflate'); const files = {};
    for (const it of items) { const b = await new Promise((r) => render(it, o).toBlob(r, mime(it), 0.93)); files[`${it.name}-anon.${ext(it)}`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }]; } // eslint-disable-line no-await-in-loop
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' })); a.download = 'anonymized.zip'; document.body.appendChild(a); a.click(); a.remove();
  }

  const seg = (k, items2) => <div className="segmented">{items2.map(([id, l]) => <button key={id} type="button" className={o[k] === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(k, id)}>{l}</button>)}</div>;
  const pct = (v, d) => `${(v / d) * 100}%`;

  return (
    <div className="tool-panel face-anon">
      <button type="button" className="tool-dropzone ss-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{busy ? t.detecting : t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>
      {items.length > 1 && (
        <div className="fa-strip">{items.map((it) => <button key={it.id} type="button" className={it.id === active ? 'fa-th is-active' : 'fa-th'} onClick={() => setActive(it.id)}><img src={it.url} alt="" /><em>{it.boxes.length}</em></button>)}</div>
      )}
      {item && (
        <div className="vz-layout">
          <div className="vz-view">
            <div className="fa-stage" ref={stageRef} onPointerDown={down}>
              <canvas ref={previewRef} />
              {item.boxes.map((b, i) => (
                <span key={i} className="fa-box" style={{ left: pct(b.x, item.img.naturalWidth), top: pct(b.y, item.img.naturalHeight), width: pct(b.w, item.img.naturalWidth), height: pct(b.h, item.img.naturalHeight) }}
                  onClick={() => setItems((list) => list.map((it) => (it.id === active ? { ...it, boxes: it.boxes.filter((_, j) => j !== i) } : it)))} title="✕" />
              ))}
              {drag && <span className="fa-drag" style={{ left: pct(Math.min(drag.x0, drag.x1), item.img.naturalWidth), top: pct(Math.min(drag.y0, drag.y1), item.img.naturalHeight), width: pct(Math.abs(drag.x1 - drag.x0), item.img.naturalWidth), height: pct(Math.abs(drag.y1 - drag.y0), item.img.naturalHeight) }} />}
            </div>
            <p className="tool-local-note">🖱 {t.draw} · {t.found(item.boxes.length)}</p>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={() => downloadOne(item)}>{t.download}</button>
              {items.length > 1 && <button type="button" className="tool-btn" onClick={downloadAll}>{t.all} ({items.length})</button>}
              <button type="button" className="tool-btn ghost" onClick={() => { setItems([]); setActive(''); }}>{t.clear}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="tool-field"><span className="tool-field-label">{t.method}</span>{seg('method', [['blur', t.blur], ['pixel', t.pixel], ['bar', t.bar], ['emoji', t.emoji]])}</div>
            {(o.method === 'blur' || o.method === 'pixel') && <label className="tool-field"><span className="tool-field-label">{t.strength}: {Math.round(o.strength * 100)}%</span><input type="range" min="0.1" max="1" step="0.01" value={o.strength} onChange={(e) => set('strength', Number(e.target.value))} /></label>}
            <label className="tool-field"><span className="tool-field-label">{t.padding}: {Math.round(o.padding * 100)}%</span><input type="range" min="0" max="0.6" step="0.01" value={o.padding} onChange={(e) => set('padding', Number(e.target.value))} /></label>
            <div className="tool-field"><span className="tool-field-label">{t.shape}</span>{seg('shape', [['ellipse', t.ellipse], ['rect', t.rect]])}</div>
            {o.method === 'bar' && <label className="tool-field"><span className="tool-field-label">{t.color}</span><input type="color" value={o.color} onChange={(e) => set('color', e.target.value)} /></label>}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default FaceAnonymizer;
