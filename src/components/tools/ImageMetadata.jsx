import { useCallback, useMemo, useState } from 'react';
import { CATEGORIES, DEFAULT_REMOVE, cleanImageMetadata, readPngText } from '../../utils/imageMeta';
import { parseC2pa } from '../../utils/c2pa';

// Метаданные изображений: просмотр всех тегов (EXIF/GPS/XMP/IPTC/ICC, текстовые
// чанки PNG), инспектор C2PA (кто подписал, какой софт, помечено ли как ИИ) и
// ВЫБОРОЧНОЕ удаление по категориям — без перекодирования пикселей (JPEG/PNG/WebP).
// Можно убрать только GPS, оставив остальной EXIF. Прочие форматы — через PNG.

const TEXT = {
  ru: {
    drop: 'Перетащите изображения сюда или нажмите', hint: 'JPEG, PNG, WebP чистятся без потерь; остальное — перекодированием в PNG',
    remove: 'Что удалять', nothing: 'Метаданных не найдено — файл уже чистый', details: 'Все теги', hide: 'Скрыть',
    download: 'Скачать чистый', zip: 'Скачать всё (ZIP)', clear: 'Очистить', empty: 'Пока нет файлов', filter: 'Поиск по тегам',
    reencode: 'перекодирование', kept: 'останется', removed: 'удалится', gpsMap: 'Открыть на карте',
    c2pa: 'C2PA / Content Credentials', c2paNone: 'Манифеста C2PA нет', signer: 'Подписал', issuer: 'Издатель сертификата', generator: 'Создано в', actions: 'Действия', ingredients: 'Исходники', assertions: 'Утверждения', manifests: 'Манифестов',
    aiYes: 'Помечено как созданное ИИ', aiHints: 'Признаки генерации', noVerify: 'Подпись и хэши не проверяются криптографически — показано то, что записано в файле.',
    cats: { EXIF: 'EXIF (камера, дата, настройки)', GPS: 'GPS (только координаты)', XMP: 'XMP', C2PA: 'C2PA (метки происхождения/ИИ)', IPTC: 'IPTC (автор, права)', Comment: 'Комментарий', Text: 'Текст PNG (в т.ч. промпты)', ICC: 'ICC-профиль (цвета!)' },
    note: 'Всё локально. ICC-профиль по умолчанию сохраняется, иначе могут измениться цвета.',
  },
  en: {
    drop: 'Drop images here or click', hint: 'JPEG, PNG, WebP cleaned losslessly; others by re-encoding to PNG',
    remove: 'What to remove', nothing: 'No metadata found — the file is already clean', details: 'All tags', hide: 'Hide',
    download: 'Download clean', zip: 'Download all (ZIP)', clear: 'Clear', empty: 'No files yet', filter: 'Search tags',
    reencode: 're-encoded', kept: 'kept', removed: 'removed', gpsMap: 'Open on map',
    c2pa: 'C2PA / Content Credentials', c2paNone: 'No C2PA manifest', signer: 'Signed by', issuer: 'Certificate issuer', generator: 'Made with', actions: 'Actions', ingredients: 'Ingredients', assertions: 'Assertions', manifests: 'Manifests',
    aiYes: 'Labelled as AI-generated', aiHints: 'Generation hints', noVerify: 'Signatures and hashes are not cryptographically verified — this shows what the file claims.',
    cats: { EXIF: 'EXIF (camera, date, settings)', GPS: 'GPS (coordinates only)', XMP: 'XMP', C2PA: 'C2PA (provenance/AI labels)', IPTC: 'IPTC (author, rights)', Comment: 'Comment', Text: 'PNG text (incl. prompts)', ICC: 'ICC profile (colors!)' },
    note: 'All local. The ICC profile is kept by default, otherwise colors may shift.',
  },
};

function fmtBytes(b) { return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`; }

function fmtValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toLocaleString();
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return `‹${v.byteLength} B›`;
  if (Array.isArray(v)) return v.length > 24 ? `[${v.length}]` : v.map(fmtValue).join(', ');
  if (typeof v === 'object') { try { const s = JSON.stringify(v); return s.length > 400 ? `${s.slice(0, 400)}…` : s; } catch { return String(v); } }
  const s = String(v); return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
}

function reencodePng(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob); }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Подсказки о генерации ИИ, помимо C2PA: XMP DigitalSourceType, PNG-промпты, Software.
function aiHints(tags, pngText) {
  const hints = [];
  const flat = JSON.stringify(tags || {});
  const m = flat.match(/(trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia)/); if (m) hints.push(`DigitalSourceType: ${m[1]}`);
  const sw = flat.match(/(Midjourney|DALL[·-]?E|Firefly|Stable Diffusion|ComfyUI|Automatic1111|NovelAI|Imagen|Leonardo|Flux|Ideogram|ChatGPT|OpenAI|Gemini)/i); if (sw) hints.push(`Software: ${sw[1]}`);
  pngText.forEach(({ key }) => { if (/^(parameters|prompt|workflow|Dream|sd-metadata|invokeai_metadata|Comment)$/i.test(key)) hints.push(`PNG «${key}»`); });
  return [...new Set(hints)];
}

function ImageMetadata({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [items, setItems] = useState([]);
  const [remove, setRemove] = useState(DEFAULT_REMOVE);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      const id = `${Date.now()}-${Math.random()}`;
      setItems((prev) => [...prev, { id, file, name: file.name, inSize: file.size, status: 'busy' }]);
      try {
        // eslint-disable-next-line no-await-in-loop
        const buf = await file.arrayBuffer();
        let tags = null; let gps = null;
        try {
          // eslint-disable-next-line no-await-in-loop
          const mod = await import('exifr'); const exifr = mod.default || mod;
          // eslint-disable-next-line no-await-in-loop
          tags = await exifr.parse(buf, { tiff: true, exif: true, gps: true, interop: true, xmp: true, iptc: true, icc: true, jfif: true, ihdr: true, makerNote: false, userComment: true, mergeOutput: false, multiSegment: true });
          // eslint-disable-next-line no-await-in-loop
          gps = await exifr.gps(buf).catch(() => null);
        } catch { /* нет тегов */ }
        // eslint-disable-next-line no-await-in-loop
        const pngText = await readPngText(buf);
        let c2pa = null; try { c2pa = parseC2pa(buf); } catch { c2pa = null; }
        const supported = !!cleanImageMetadata(buf, []);
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, buf, tags, gps, pngText, c2pa, supported, hints: aiHints(tags, pngText), status: 'done' } : it)));
      } catch {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'error' } : it)));
      }
    }
  }, []);

  // Результат очистки при текущем наборе категорий (пересчёт — только копирование байтов).
  const results = useMemo(() => {
    const map = {};
    items.forEach((it) => { if (it.status === 'done' && it.supported) map[it.id] = cleanImageMetadata(it.buf, remove); });
    return map;
  }, [items, remove]);

  async function outputFor(item) {
    const r = results[item.id];
    if (r) return { blob: new Blob([r.clean], { type: r.mime }), name: `${item.name.replace(/\.[^.]+$/, '')}-clean.${r.ext}` };
    const blob = await reencodePng(item.file);
    return blob ? { blob, name: `${item.name.replace(/\.[^.]+$/, '')}-clean.png` } : null;
  }
  function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  async function download(item) { const o = await outputFor(item); if (o) save(o.blob, o.name); }
  async function zipAll() {
    const { zipSync } = await import('fflate'); const files = {};
    for (const it of items.filter((i) => i.status === 'done')) {
      // eslint-disable-next-line no-await-in-loop
      const o = await outputFor(it); if (!o) continue;
      let name = o.name; let n = 1; while (files[name]) { name = o.name.replace(/(\.[^.]+)$/, `-${n}$1`); n += 1; }
      // eslint-disable-next-line no-await-in-loop
      files[name] = [new Uint8Array(await o.blob.arrayBuffer()), { level: 0 }];
    }
    save(new Blob([zipSync(files)], { type: 'application/zip' }), 'clean-images.zip');
  }

  const toggle = (c) => setRemove((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const done = items.filter((it) => it.status === 'done');
  const q = query.trim().toLowerCase();

  const renderTags = (item) => {
    const groups = Object.entries(item.tags || {}).filter(([, v]) => v && typeof v === 'object' && !(v instanceof Uint8Array));
    const pngRows = item.pngText.map(({ key, value }) => [key, value]);
    const all = [...groups.map(([g, obj]) => [g, Object.entries(obj)]), ...(pngRows.length ? [['PNG text', pngRows]] : [])];
    return all.map(([g, rows]) => {
      const shown = rows.filter(([k, v]) => !q || k.toLowerCase().includes(q) || fmtValue(v).toLowerCase().includes(q));
      if (!shown.length) return null;
      return (
        <details key={g} className="im-group" open>
          <summary>{g.toUpperCase()} <span className="im-count">{shown.length}</span></summary>
          <table className="im-table"><tbody>{shown.map(([k, v]) => <tr key={k}><th>{k}</th><td>{fmtValue(v)}</td></tr>)}</tbody></table>
        </details>
      );
    });
  };

  const renderC2pa = (c) => {
    if (!c) return <p className="im-clean">{t.c2paNone}</p>;
    const m = c.active;
    return (
      <div className="im-c2pa">
        {c.ai && <div className="im-chip is-ai">⚠ {t.aiYes}</div>}
        <dl className="ba-dl">
          <dt>{t.manifests}</dt><dd>{c.manifests.length} · {fmtBytes(c.size)}</dd>
          {m?.generator && (<><dt>{t.generator}</dt><dd>{m.generator}</dd></>)}
          {m?.signature?.subject && (<><dt>{t.signer}</dt><dd>{m.signature.subject}{m.signature.org && m.signature.org !== m.signature.subject ? ` · ${m.signature.org}` : ''} ({m.signature.alg})</dd></>)}
          {m?.signature?.issuer && (<><dt>{t.issuer}</dt><dd>{m.signature.issuer}</dd></>)}
          {m?.title && (<><dt>dc:title</dt><dd>{m.title}</dd></>)}
        </dl>
        {m?.actions.length > 0 && (
          <>
            <div className="tool-field-label">{t.actions}</div>
            <ul className="im-actions">{m.actions.map((a, i) => <li key={i}><code>{a.action}</code>{a.softwareAgent && ` · ${a.softwareAgent}`}{a.digitalSourceType && <> · <span className={/algorithmic/i.test(a.digitalSourceType) ? 'im-ai-text' : ''}>{a.digitalSourceType.split('/').pop()}</span></>}{a.when && ` · ${a.when}`}</li>)}</ul>
          </>
        )}
        {m?.ingredients.length > 0 && <p className="tool-field-label">{t.ingredients}: {m.ingredients.map((x) => `${x.title}${x.relationship ? ` (${x.relationship})` : ''}`).join(', ')}</p>}
        {m?.assertions.length > 0 && <p className="tool-field-label">{t.assertions}: {m.assertions.join(', ')}</p>}
        <p className="tool-field-label">ℹ {t.noVerify}</p>
      </div>
    );
  };

  return (
    <div className="tool-panel image-metadata">
      <button type="button" className="tool-dropzone" onClick={() => document.getElementById('imeta-input')?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      <div className="tool-field">
        <span className="tool-field-label">{t.remove}</span>
        <div className="im-cats">
          {CATEGORIES.map((c) => (
            <label key={c} className="tool-check"><input type="checkbox" checked={remove.includes(c)} disabled={c === 'GPS' && remove.includes('EXIF')} onChange={() => toggle(c)} /> {t.cats[c]}</label>
          ))}
        </div>
      </div>

      {done.length > 0 && (
        <div className="tool-actions">
          {done.length > 1 && <button type="button" className="tool-btn primary" onClick={zipAll}>{t.zip} ({done.length})</button>}
          <button type="button" className="tool-btn ghost" onClick={() => { setItems([]); setOpenId(null); }}>{t.clear}</button>
        </div>
      )}

      <ul className="convert-list im-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {items.map((item) => {
          const r = results[item.id]; const found = r ? r.found : [];
          return (
            <li key={item.id} className="im-row">
              <div className="im-row-top">
                <span className="convert-name" title={item.name}>{item.name}</span>
                <span className="convert-sizes">{fmtBytes(item.inSize)}{r && <> → <strong>{fmtBytes(r.clean.length)}</strong></>}</span>
                {item.status === 'done' && <button type="button" className="tool-btn small ghost" onClick={() => setOpenId(openId === item.id ? null : item.id)}>{openId === item.id ? t.hide : t.details}</button>}
                {item.status === 'done' && <button type="button" className="tool-btn small" onClick={() => download(item)}>{t.download}</button>}
                {item.status === 'error' && <span className="convert-error">⚠</span>}
              </div>
              {item.status === 'done' && (
                <div className="im-chips">
                  {!item.supported && <span className="im-chip">{t.reencode}</span>}
                  {item.supported && found.length === 0 && <span className="im-clean">✓ {t.nothing}</span>}
                  {found.map((f, i) => <span key={i} className={`im-chip${f.type === 'C2PA' ? ' is-ai' : ''}${f.removed ? ' is-removed' : ''}`} title={f.removed ? t.removed : t.kept}>{f.removed ? '✕ ' : '• '}{f.type}{f.size ? ` · ${fmtBytes(f.size)}` : ''}</span>)}
                  {item.c2pa?.ai && <span className="im-chip is-ai">AI · C2PA</span>}
                  {item.hints.map((h) => <span key={h} className="im-chip is-ai">{h}</span>)}
                  {item.gps && Number.isFinite(item.gps.latitude) && (
                    <a className="im-chip" href={`https://www.openstreetmap.org/?mlat=${item.gps.latitude}&mlon=${item.gps.longitude}#map=15/${item.gps.latitude}/${item.gps.longitude}`} target="_blank" rel="noreferrer noopener">📍 {item.gps.latitude.toFixed(5)}, {item.gps.longitude.toFixed(5)} · {t.gpsMap}</a>
                  )}
                </div>
              )}
              {openId === item.id && item.status === 'done' && (
                <div className="im-details">
                  <div className="im-section-title">{t.c2pa}</div>
                  {renderC2pa(item.c2pa)}
                  <input type="search" className="wm-text-input" placeholder={t.filter} value={query} onChange={(e) => setQuery(e.target.value)} />
                  {renderTags(item)}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <input id="imeta-input" type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default ImageMetadata;
