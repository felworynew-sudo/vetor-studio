import { useEffect, useMemo, useRef, useState } from 'react';
import { aiBrowserHint } from '../../utils/aiSupport';
import { analyzeImage, computeCrop, loadImageFile, preloadModels } from '../../utils/smartCropEngine';
import { CropEditor, CropThumb } from './shared/CropFrame';

// Social Media Crop Pack: одна картинка → готовые размеры для YouTube, VK, Telegram,
// Instagram, TikTok, X, Facebook, LinkedIn, Pinterest и OG-превью. Рамки выбирает
// умный кроп (saliency + лица + объекты), каждую можно подправить, всё — одним ZIP.

const FORMATS = [
  { id: 'yt-thumb', net: 'YouTube', ru: 'Превью видео', en: 'Video thumbnail', w: 1280, h: 720 },
  { id: 'yt-banner', net: 'YouTube', ru: 'Шапка канала', en: 'Channel banner', w: 2560, h: 1440 },
  { id: 'yt-avatar', net: 'YouTube', ru: 'Аватар', en: 'Avatar', w: 800, h: 800, circle: true },
  { id: 'vk-post', net: 'VK', ru: 'Пост 4:5', en: 'Post 4:5', w: 1080, h: 1350 },
  { id: 'vk-cover', net: 'VK', ru: 'Обложка сообщества', en: 'Community cover', w: 1920, h: 768 },
  { id: 'vk-story', net: 'VK', ru: 'История / клип', en: 'Story / clip', w: 1080, h: 1920 },
  { id: 'vk-avatar', net: 'VK', ru: 'Аватар', en: 'Avatar', w: 400, h: 400, circle: true },
  { id: 'tg-post', net: 'Telegram', ru: 'Картинка в пост', en: 'Post image', w: 1280, h: 720 },
  { id: 'tg-story', net: 'Telegram', ru: 'История', en: 'Story', w: 1080, h: 1920 },
  { id: 'tg-avatar', net: 'Telegram', ru: 'Аватар', en: 'Avatar', w: 640, h: 640, circle: true },
  { id: 'ig-square', net: 'Instagram', ru: 'Пост 1:1', en: 'Post 1:1', w: 1080, h: 1080 },
  { id: 'ig-portrait', net: 'Instagram', ru: 'Пост 4:5', en: 'Post 4:5', w: 1080, h: 1350 },
  { id: 'ig-story', net: 'Instagram', ru: 'Stories / Reels', en: 'Stories / Reels', w: 1080, h: 1920 },
  { id: 'tiktok', net: 'TikTok', ru: 'Видео / обложка', en: 'Video / cover', w: 1080, h: 1920 },
  { id: 'x-post', net: 'X', ru: 'Пост 16:9', en: 'Post 16:9', w: 1600, h: 900 },
  { id: 'x-header', net: 'X', ru: 'Шапка профиля', en: 'Header', w: 1500, h: 500 },
  { id: 'fb-post', net: 'Facebook', ru: 'Пост', en: 'Post', w: 1200, h: 630 },
  { id: 'fb-cover', net: 'Facebook', ru: 'Обложка', en: 'Cover', w: 1640, h: 624 },
  { id: 'li-post', net: 'LinkedIn', ru: 'Пост', en: 'Post', w: 1200, h: 627 },
  { id: 'li-banner', net: 'LinkedIn', ru: 'Баннер', en: 'Banner', w: 1584, h: 396 },
  { id: 'pin', net: 'Pinterest', ru: 'Пин 2:3', en: 'Pin 2:3', w: 1000, h: 1500 },
  { id: 'og', net: 'Web', ru: 'OG-превью ссылки', en: 'OG link preview', w: 1200, h: 630 },
];
const NETS = [...new Set(FORMATS.map((f) => f.net))];
const DEFAULT_SEL = ['yt-thumb', 'vk-post', 'tg-post', 'ig-square', 'ig-portrait', 'ig-story', 'og'];

const TEXT = {
  ru: {
    drop: 'Загрузите одну картинку', hint: 'Фото, обложку или арт — получите набор размеров для всех соцсетей',
    formats: 'Форматы', all: 'все', none: 'снять', run: 'Сделать набор', analyzing: 'Ищу лица и объекты…', zip: 'Скачать ZIP', edit: 'Подправить', done: 'Готово',
    reset: 'Сбросить', change: 'Другая картинка', format: 'Формат файла', objects: 'Искать объекты (DETR, ~40 МБ)',
    note: 'Рамки выбирает умный кроп: «интересные» области, лица и объекты не обрезаются. Размеры — по актуальным рекомендациям площадок. Всё локально.',
  },
  en: {
    drop: 'Upload one image', hint: 'A photo, cover or artwork — get a set of sizes for every social network',
    formats: 'Formats', all: 'all', none: 'clear', run: 'Build the pack', analyzing: 'Finding faces and objects…', zip: 'Download ZIP', edit: 'Adjust', done: 'Done',
    reset: 'Reset', change: 'Another image', format: 'File format', objects: 'Detect objects (DETR, ~40 MB)',
    note: 'Frames are chosen by smart crop: interesting areas, faces and objects are not cut. Sizes follow current platform guidelines. All local.',
  },
};

function SocialCropPack({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const [item, setItem] = useState(null); // { img, url, name, subjects }
  const [sel, setSel] = useState(() => new Set(DEFAULT_SEL));
  const [crops, setCrops] = useState({}); // id → { crop, auto }
  const [status, setStatus] = useState('idle');
  const [editing, setEditing] = useState('');
  const [fmt, setFmt] = useState('jpg');
  const [useObjects, setUseObjects] = useState(false);

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const { img, url } = await loadImageFile(file);
    setItem({ img, url, name: file.name.replace(/\.[^.]+$/, ''), subjects: null });
    setCrops({}); setEditing(''); setStatus('idle');
  }

  async function run() {
    if (!item) return;
    setStatus('analyzing');
    let subjects = item.subjects;
    if (!subjects) {
      await preloadModels({ objects: useObjects });
      subjects = await analyzeImage(item.img, item.url, { objects: useObjects });
      setItem((it) => ({ ...it, subjects }));
    }
    const next = {};
    for (const f of FORMATS.filter((x) => sel.has(x.id))) {
      const crop = await computeCrop(item.img, subjects, { w: f.w, h: f.h, circle: f.circle }); // eslint-disable-line no-await-in-loop
      next[f.id] = { crop, auto: crop };
    }
    setCrops(next); setStatus('done');
  }

  // Добавили формат после расчёта — досчитываем только его.
  useEffect(() => {
    if (status !== 'done' || !item?.subjects) return;
    const missing = FORMATS.filter((f) => sel.has(f.id) && !crops[f.id]);
    if (!missing.length) return;
    (async () => {
      const add = {};
      for (const f of missing) { const crop = await computeCrop(item.img, item.subjects, { w: f.w, h: f.h, circle: f.circle }); add[f.id] = { crop, auto: crop }; } // eslint-disable-line no-await-in-loop
      setCrops((c) => ({ ...c, ...add }));
    })();
  }, [sel, status]); // eslint-disable-line react-hooks/exhaustive-deps

  function renderFormat(f) {
    const { crop } = crops[f.id];
    const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(item.img, crop.x, crop.y, crop.w, crop.h, 0, 0, f.w, f.h);
    return c;
  }
  const mime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
  const fileName = (f) => `${item.name}-${f.id}-${f.w}x${f.h}.${fmt}`;

  async function downloadZip() {
    const { zipSync } = await import('fflate');
    const files = {};
    for (const f of FORMATS.filter((x) => sel.has(x.id) && crops[x.id])) {
      const blob = await new Promise((r) => renderFormat(f).toBlob(r, mime, 0.92)); // eslint-disable-line no-await-in-loop
      files[`${f.net}/${fileName(f)}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]; // eslint-disable-line no-await-in-loop
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' })); a.download = `${item.name}-social-pack.zip`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function downloadOne(f) {
    renderFormat(f).toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(f); document.body.appendChild(a); a.click(); a.remove(); }, mime, 0.92);
  }

  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleNet = (net, on) => setSel((s) => { const n = new Set(s); FORMATS.filter((f) => f.net === net).forEach((f) => (on ? n.add(f.id) : n.delete(f.id))); return n; });
  const editF = FORMATS.find((f) => f.id === editing);
  const ready = useMemo(() => FORMATS.filter((f) => sel.has(f.id) && crops[f.id]), [sel, crops]);

  return (
    <div className="tool-panel smart-crop social-pack">
      {!item ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="sp-head">
          <img src={item.url} alt="" className="sp-src" />
          <div className="sp-head-actions">
            <label className="tool-check"><input type="checkbox" checked={useObjects} onChange={(e) => setUseObjects(e.target.checked)} disabled={status === 'analyzing'} /> {t.objects}</label>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={run} disabled={status === 'analyzing' || !sel.size}>{status === 'analyzing' ? t.analyzing : t.run} ({sel.size})</button>
              {ready.length > 0 && <button type="button" className="tool-btn" onClick={downloadZip}>{t.zip} ({ready.length})</button>}
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.format}</span>
              <div className="segmented">{['jpg', 'png', 'webp'].map((f) => <button key={f} type="button" className={fmt === f ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="tool-field">
        <span className="tool-field-label">{t.formats}</span>
        <div className="sp-nets">
          {NETS.map((net) => (
            <div key={net} className="sp-net">
              <div className="sp-net-head">
                <b>{net}</b>
                <button type="button" className="sp-link" onClick={() => toggleNet(net, true)}>{t.all}</button>
                <button type="button" className="sp-link" onClick={() => toggleNet(net, false)}>{t.none}</button>
              </div>
              {FORMATS.filter((f) => f.net === net).map((f) => (
                <label key={f.id} className="tool-check sp-fmt">
                  <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} />
                  {f[language] || f.ru} <em>{f.w}×{f.h}</em>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {editF && crops[editF.id] && (
        <div className="sc-edit-wrap">
          <b>{editF.net} · {editF[language] || editF.ru} · {editF.w}×{editF.h}</b>
          <CropEditor item={{ ...item, crop: crops[editF.id].crop }} aspect={{ w: editF.w, h: editF.h, circle: editF.circle }} onChange={(crop) => setCrops((c) => ({ ...c, [editF.id]: { ...c[editF.id], crop } }))} />
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => setEditing('')}>{t.done}</button>
            <button type="button" className="tool-btn" onClick={() => setCrops((c) => ({ ...c, [editF.id]: { ...c[editF.id], crop: c[editF.id].auto } }))}>{t.reset}</button>
          </div>
        </div>
      )}

      {ready.length > 0 && (
        <div className="sc-grid">
          {ready.map((f) => (
            <div key={f.id} className={f.id === editing ? 'sc-card is-editing' : 'sc-card'}>
              <CropThumb item={item} crop={crops[f.id].crop} circle={f.circle} size={150} />
              <span className="sc-meta">{f.net} · {f[language] || f.ru}<br />{f.w}×{f.h}</span>
              <div className="sc-card-actions">
                <button type="button" className="tool-btn small" onClick={() => setEditing(f.id)}>{t.edit}</button>
                <button type="button" className="tool-btn small" onClick={() => downloadOne(f)}>↓</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      {aiBrowserHint(language) && <p className="tool-local-note aid-warn">⚠️ {aiBrowserHint(language)}</p>}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default SocialCropPack;
