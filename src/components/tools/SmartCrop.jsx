import { useCallback, useEffect, useRef, useState } from 'react';
import { aiBrowserHint, aiErrorHint } from '../../utils/aiSupport';
import { analyzeImage, computeCrop, loadImageFile, preloadModels, renderCrop } from '../../utils/smartCropEngine';

// Smart Crop: saliency (smartcrop.js) + лица (MediaPipe) + объекты (DETR) → рамка
// нужной пропорции, в которой не режутся лица. Пакетно; каждую рамку можно
// подвинуть и масштабировать вручную. Всё локально в браузере.

const ASPECTS = [
  { id: 'square', ru: '1:1', en: '1:1', w: 1, h: 1 },
  { id: 'portrait', ru: '4:5', en: '4:5', w: 4, h: 5 },
  { id: 'photo', ru: '3:2', en: '3:2', w: 3, h: 2 },
  { id: 'wide', ru: '16:9', en: '16:9', w: 16, h: 9 },
  { id: 'story', ru: 'Сторис 9:16', en: 'Story 9:16', w: 9, h: 16 },
  { id: 'avatar', ru: 'Аватар (круг)', en: 'Avatar (circle)', w: 1, h: 1, circle: true },
];

const TEXT = {
  ru: {
    drop: 'Перетащите фото сюда или нажмите', hint: 'Можно несколько файлов — обрабатываются локально',
    aspect: 'Формат', process: 'Кадрировать', loadingModel: 'Загрузка моделей…', processing: 'Анализ',
    download: 'Скачать', downloadAll: 'Скачать всё', clear: 'Очистить', empty: 'Пока нет файлов',
    edit: 'Подправить', done: 'Готово', zoom: 'Масштаб рамки', reset: 'Сбросить', faces: 'Лица', noFaces: 'Лиц нет',
    objects: 'Искать объекты (DETR, ~40 МБ)', showBoxes: 'Показать найденное',
    editHint: 'Перетаскивайте рамку мышью или пальцем.',
    note: 'Рамка выбирается по «интересности» областей (детали, контраст, цвет — smartcrop.js), а лица и объекты получают приоритет: лицо не будет обрезано, если оно помещается в кадр. Модели скачиваются один раз.',
  },
  en: {
    drop: 'Drop photos here or click', hint: 'Several files are fine — processed locally',
    aspect: 'Aspect', process: 'Crop', loadingModel: 'Loading models…', processing: 'Analyzing',
    download: 'Download', downloadAll: 'Download all', clear: 'Clear', empty: 'No files yet',
    edit: 'Adjust', done: 'Done', zoom: 'Frame size', reset: 'Reset', faces: 'Faces', noFaces: 'No faces',
    objects: 'Detect objects (DETR, ~40 MB)', showBoxes: 'Show detections',
    editHint: 'Drag the frame with the mouse or a finger.',
    note: 'The frame is chosen by how “interesting” regions are (detail, contrast, color — smartcrop.js), while faces and objects get priority: a face is never cut if it fits the frame. Models download once.',
  },
};

// Превью кропа без canvas: фон-картинка, масштабированная и сдвинутая под рамку.
function CropThumb({ item, crop, circle, size = 160 }) {
  const W = item.img.naturalWidth; const H = item.img.naturalHeight;
  const tw = crop.w >= crop.h ? size : size * (crop.w / crop.h);
  const th = tw * (crop.h / crop.w);
  return (
    <span
      className={circle ? 'sc-thumb circle' : 'sc-thumb'}
      style={{
        width: tw, height: th,
        backgroundImage: `url(${item.url})`,
        backgroundSize: `${(W / crop.w) * tw}px ${(H / crop.h) * th}px`,
        backgroundPosition: `${-(crop.x / crop.w) * tw}px ${-(crop.y / crop.h) * th}px`,
      }}
    />
  );
}

function CropEditor({ item, aspect, onChange, showBoxes }) {
  const boxRef = useRef(null);
  const W = item.img.naturalWidth; const H = item.img.naturalHeight;
  const { crop } = item;
  const ar = aspect.w / aspect.h;
  const maxW = W / H > ar ? H * ar : W;

  function startDrag(e) {
    e.preventDefault();
    const rect = boxRef.current.getBoundingClientRect();
    const k = W / rect.width;
    const sx = e.clientX; const sy = e.clientY; const start = { ...crop };
    const move = (ev) => {
      const x = Math.max(0, Math.min(W - start.w, start.x + (ev.clientX - sx) * k));
      const y = Math.max(0, Math.min(H - start.h, start.y + (ev.clientY - sy) * k));
      onChange({ ...start, x, y });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  function setZoom(v) {
    const w = maxW * v; const h = w / ar;
    const cx = crop.x + crop.w / 2; const cy = crop.y + crop.h / 2;
    onChange({
      w, h,
      x: Math.max(0, Math.min(W - w, cx - w / 2)),
      y: Math.max(0, Math.min(H - h, cy - h / 2)),
    });
  }

  const pct = (v, d) => `${(v / d) * 100}%`;
  return (
    <>
      <div className="sc-editor" ref={boxRef}>
        <img src={item.url} alt="" draggable="false" />
        {showBoxes && item.subjects?.faces.map((f, i) => (
          <span key={`f${i}`} className="sc-det is-face" style={{ left: pct(f.x, W), top: pct(f.y, H), width: pct(f.w, W), height: pct(f.h, H) }} />
        ))}
        {showBoxes && item.subjects?.objects.map((o, i) => (
          <span key={`o${i}`} className="sc-det" style={{ left: pct(o.x, W), top: pct(o.y, H), width: pct(o.w, W), height: pct(o.h, H) }}><em>{o.label}</em></span>
        ))}
        <span
          className={aspect.circle ? 'sc-frame circle' : 'sc-frame'}
          style={{ left: pct(crop.x, W), top: pct(crop.y, H), width: pct(crop.w, W), height: pct(crop.h, H) }}
          onPointerDown={startDrag}
        />
      </div>
      <input type="range" min="0.2" max="1" step="0.01" value={Math.min(1, crop.w / maxW)} onChange={(e) => setZoom(Number(e.target.value))} />
    </>
  );
}

function SmartCrop({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [aspectId, setAspectId] = useState('square');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [editing, setEditing] = useState('');
  const [useObjects, setUseObjects] = useState(true);
  const [showBoxes, setShowBoxes] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const aspect = ASPECTS.find((a) => a.id === aspectId);

  const patch = (id, p) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    const loaded = await Promise.all(files.map(async (file, i) => {
      try {
        const { img, url } = await loadImageFile(file);
        return { id: `${Date.now()}-${i}-${file.name}`, file, name: file.name, img, url, subjects: null, crop: null, auto: null, status: 'idle' };
      } catch { return null; }
    }));
    setItems((prev) => [...prev, ...loaded.filter(Boolean)]);
  }, []);

  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url)), []);

  // Смена формата: пересчитываем рамки уже проанализированных фото (без повторной детекции).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const it of itemsRef.current) {
        if (!it.subjects) continue; // eslint-disable-line no-continue
        const crop = await computeCrop(it.img, it.subjects, aspect); // eslint-disable-line no-await-in-loop
        if (cancelled) return;
        patch(it.id, { crop, auto: crop });
      }
    })();
    return () => { cancelled = true; };
  }, [aspectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function processAll() {
    try {
      setStatus('loading'); setProgress(0);
      await preloadModels({
        objects: useObjects,
        onProgress: (p) => { if (p && p.status === 'progress' && p.total) setProgress(Math.round((p.loaded / p.total) * 100)); },
      });
      setStatus('processing');
      const todo = itemsRef.current.filter((it) => !it.subjects);
      for (let i = 0; i < todo.length; i += 1) {
        const it = todo[i];
        setProgress(Math.round((i / todo.length) * 100));
        try {
          patch(it.id, { status: 'working' });
          const subjects = await analyzeImage(it.img, it.url, { objects: useObjects }); // eslint-disable-line no-await-in-loop
          const crop = await computeCrop(it.img, subjects, aspect); // eslint-disable-line no-await-in-loop
          patch(it.id, { subjects, crop, auto: crop, status: 'done' });
        } catch (e) {
          console.error(e);
          patch(it.id, { status: 'error' });
        }
      }
      setStatus('done');
    } catch (e) {
      console.error(e); setStatus('error');
    }
  }

  async function download(item) {
    const canvas = renderCrop(item.img, item.crop, { circle: aspect.circle });
    const type = aspect.circle || item.file.type === 'image/png' ? 'image/png' : (item.file.type === 'image/webp' ? 'image/webp' : 'image/jpeg');
    const blob = await new Promise((res) => canvas.toBlob(res, type, 0.93));
    const ext = type.split('/')[1].replace('jpeg', 'jpg');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${item.name.replace(/\.[^.]+$/, '')}-${aspect.id}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const busy = status === 'loading' || status === 'processing';
  const doneItems = items.filter((it) => it.crop);
  const pending = items.filter((it) => !it.subjects);
  const editItem = items.find((it) => it.id === editing && it.crop);

  return (
    <div className="tool-panel smart-crop">
      <div className="tool-field">
        <span className="tool-field-label">{t.aspect}</span>
        <div className="segmented sc-aspects">
          {ASPECTS.map((a) => (
            <button key={a.id} type="button" className={a.id === aspectId ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setAspectId(a.id)}>{a[language] || a.ru}</button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="tool-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      <label className="tool-check">
        <input type="checkbox" checked={useObjects} onChange={(e) => setUseObjects(e.target.checked)} disabled={busy} /> {t.objects}
      </label>

      {busy && (
        <div className="bgr-progress">
          <span>{status === 'loading' ? `${t.loadingModel} ${progress ? `${progress}%` : ''}` : `${t.processing} ${progress}%`}</span>
          <div className="bgr-bar"><div className="bgr-bar-fill" style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      {(status === 'error' || items.some((it) => it.status === 'error')) && <p className="color-invalid">{aiErrorHint(language)}</p>}

      {items.length > 0 && (
        <div className="tool-actions">
          {pending.length > 0 && <button type="button" className="tool-btn primary" onClick={processAll} disabled={busy}>{busy ? '…' : `${t.process} (${pending.length})`}</button>}
          {doneItems.length > 0 && <button type="button" className="tool-btn" onClick={() => doneItems.forEach((it, i) => setTimeout(() => download(it), i * 300))}>{t.downloadAll} ({doneItems.length})</button>}
          {doneItems.length > 0 && (
            <label className="tool-check"><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> {t.showBoxes}</label>
          )}
          <button type="button" className="tool-btn ghost" onClick={() => { items.forEach((it) => URL.revokeObjectURL(it.url)); setItems([]); setEditing(''); }} disabled={busy}>{t.clear}</button>
        </div>
      )}

      {editItem && (
        <div className="sc-edit-wrap">
          <CropEditor item={editItem} aspect={aspect} showBoxes={showBoxes} onChange={(crop) => patch(editItem.id, { crop })} />
          <p className="tool-local-note">{t.editHint}</p>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => setEditing('')}>{t.done}</button>
            <button type="button" className="tool-btn" onClick={() => patch(editItem.id, { crop: editItem.auto })}>{t.reset}</button>
            <button type="button" className="tool-btn" onClick={() => download(editItem)}>{t.download}</button>
          </div>
        </div>
      )}

      <div className="sc-grid">
        {doneItems.map((it) => (
          <div key={it.id} className={it.id === editing ? 'sc-card is-editing' : 'sc-card'}>
            <CropThumb item={it} crop={it.crop} circle={aspect.circle} />
            <span className="sc-meta">{it.subjects?.faces.length ? `${t.faces}: ${it.subjects.faces.length}` : t.noFaces}</span>
            <div className="sc-card-actions">
              <button type="button" className="tool-btn small" onClick={() => setEditing(it.id)}>{t.edit}</button>
              <button type="button" className="tool-btn small" onClick={() => download(it)}>↓</button>
            </div>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <ul className="convert-list">
          {pending.map((item) => (
            <li key={item.id} className={`convert-row status-${item.status}`}>
              <span className="convert-name">{item.name}</span>
              <span />
              {item.status === 'error' ? <span className="convert-error">⚠</span> : <span className="convert-pending">{item.status === 'working' ? '…' : '•'}</span>}
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 && <p className="convert-empty">{t.empty}</p>}

      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      {aiBrowserHint(language) && <p className="tool-local-note aid-warn">⚠️ {aiBrowserHint(language)}</p>}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default SmartCrop;
