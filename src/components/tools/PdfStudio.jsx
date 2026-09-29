import { useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// PDF-студия: несколько PDF и картинок → страницы-миниатюры (pdf.js, Apache-2.0),
// которые можно переставлять, поворачивать, удалять и выделять; сборка нового PDF
// (pdf-lib, MIT) с водяным знаком и нумерацией, извлечение выбранных страниц,
// разбивка на отдельные файлы (ZIP). Всё в браузере — документы никуда не уходят.

const TEXT = {
  ru: {
    drop: 'Перетащите PDF и/или картинки', hint: 'Можно несколько файлов — страницы встанут по порядку', pages: (n, s) => `Страниц: ${n}${s ? ` · выделено: ${s}` : ''}`,
    build: 'Собрать PDF', extract: 'Извлечь выделенные', split: 'Разбить на страницы (ZIP)', clear: 'Очистить', selectAll: 'Выделить все', unselect: 'Снять выделение',
    watermark: 'Водяной знак', wmPh: 'CONFIDENTIAL / Черновик', wmOpacity: 'Прозрачность', numbers: 'Нумерация страниц', name: 'Имя файла', loading: 'Читаю…', building: 'Собираю PDF…',
    tip: 'Клик — выделить, стрелки — переставить, ↻ — повернуть, ✕ — удалить.', encrypted: 'Файл защищён паролем — такие PDF пока не поддерживаются.',
    note: 'Всё локально: pdf.js рисует миниатюры, pdf-lib собирает документ. Текст и векторы страниц сохраняются как есть (без растеризации).',
  },
  en: {
    drop: 'Drop PDFs and/or images', hint: 'Several files are fine — pages follow in order', pages: (n, s) => `Pages: ${n}${s ? ` · selected: ${s}` : ''}`,
    build: 'Build PDF', extract: 'Extract selected', split: 'Split into pages (ZIP)', clear: 'Clear', selectAll: 'Select all', unselect: 'Clear selection',
    watermark: 'Watermark', wmPh: 'CONFIDENTIAL / Draft', wmOpacity: 'Opacity', numbers: 'Page numbers', name: 'File name', loading: 'Reading…', building: 'Building PDF…',
    tip: 'Click to select, arrows to reorder, ↻ to rotate, ✕ to delete.', encrypted: 'The file is password-protected — such PDFs are not supported yet.',
    note: 'All local: pdf.js renders thumbnails, pdf-lib builds the document. Page text and vectors are kept as is (no rasterizing).',
  },
};

let pdfjsP = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = import('pdfjs-dist').then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; });
  return pdfjsP;
}

let uid = 0;

function PdfStudio({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const sources = useRef({}); // id → { kind: 'pdf'|'image', bytes, mime }
  const [pages, setPages] = useState([]); // { id, src, index, rot, thumb, sel }
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [wm, setWm] = useState('');
  const [wmOpacity, setWmOpacity] = useState(0.18);
  const [numbers, setNumbers] = useState(false);
  const [name, setName] = useState('document');

  async function addFiles(list) {
    const files = [...(list || [])];
    if (!files.length) return;
    setBusy(t.loading); setErr('');
    const lib = await pdfjs();
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer()); // eslint-disable-line no-await-in-loop
      uid += 1; const sid = `s${uid}`;
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        try {
          const doc = await lib.getDocument({ data: bytes.slice() }).promise; // eslint-disable-line no-await-in-loop
          sources.current[sid] = { kind: 'pdf', bytes };
          if (pages.length === 0 && Object.keys(sources.current).length === 1) setName(f.name.replace(/\.pdf$/i, ''));
          const added = [];
          for (let i = 1; i <= doc.numPages; i += 1) {
            const page = await doc.getPage(i); // eslint-disable-line no-await-in-loop
            const vp = page.getViewport({ scale: 0.35 });
            const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            // intent 'print' рендерит без requestAnimationFrame — не встаёт на паузу в фоновой вкладке.
            await page.render({ canvasContext: c.getContext('2d'), canvas: c, viewport: vp, intent: 'print' }).promise; // eslint-disable-line no-await-in-loop
            uid += 1; added.push({ id: `p${uid}`, src: sid, index: i - 1, rot: 0, thumb: c.toDataURL('image/jpeg', 0.7), sel: false });
          }
          setPages((p) => [...p, ...added]);
        } catch (e) {
          console.error(e); setErr(/password/i.test(String(e?.name || e?.message)) ? t.encrypted : String(e.message || e));
        }
      } else if (f.type.startsWith('image/')) {
        sources.current[sid] = { kind: 'image', bytes, mime: f.type };
        const url = URL.createObjectURL(f);
        uid += 1; const pid = `p${uid}`;
        setPages((p) => [...p, { id: pid, src: sid, index: 0, rot: 0, thumb: url, sel: false }]);
      }
    }
    setBusy('');
  }

  const patch = (id, p) => setPages((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (i, d) => setPages((list) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return list; [n[i], n[j]] = [n[j], n[i]]; return n; });

  // Картинка → JPEG/PNG-байты, которые понимает pdf-lib.
  async function imageBytes(src) {
    if (src.mime === 'image/jpeg' || src.mime === 'image/png') return { bytes: src.bytes, png: src.mime === 'image/png' };
    const bmp = await createImageBitmap(new Blob([src.bytes], { type: src.mime }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    return { bytes: new Uint8Array(await b.arrayBuffer()), png: false };
  }

  async function buildPdf(list) {
    const { PDFDocument, degrees, rgb, StandardFonts } = await import('pdf-lib');
    const out = await PDFDocument.create();
    const loaded = {};
    for (const p of list) {
      const src = sources.current[p.src];
      let page;
      if (src.kind === 'pdf') {
        if (!loaded[p.src]) loaded[p.src] = await PDFDocument.load(src.bytes, { ignoreEncryption: true }); // eslint-disable-line no-await-in-loop
        [page] = await out.copyPages(loaded[p.src], [p.index]); // eslint-disable-line no-await-in-loop
        out.addPage(page);
      } else {
        const { bytes, png } = await imageBytes(src); // eslint-disable-line no-await-in-loop
        const img = png ? await out.embedPng(bytes) : await out.embedJpg(bytes); // eslint-disable-line no-await-in-loop
        page = out.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      if (p.rot) page.setRotation(degrees((page.getRotation().angle + p.rot) % 360));
    }
    if (wm || numbers) {
      const font = await out.embedFont(StandardFonts.HelveticaBold);
      const ascii = (s) => s.replace(/[^\x20-\x7E]/g, ''); // стандартный шрифт PDF — только латиница
      out.getPages().forEach((pg, i) => {
        const { width, height } = pg.getSize();
        if (wm && ascii(wm)) {
          const size = Math.min(width, height) / 9;
          const tw = font.widthOfTextAtSize(ascii(wm), size);
          pg.drawText(ascii(wm), { x: width / 2 - (tw / 2) * Math.cos(Math.PI / 5), y: height / 2 - (tw / 2) * Math.sin(Math.PI / 5), size, font, color: rgb(0.5, 0.5, 0.5), opacity: wmOpacity, rotate: degrees(36) });
        }
        if (numbers) {
          const label = `${i + 1} / ${out.getPageCount()}`; const size = Math.max(8, Math.min(width, height) / 60);
          pg.drawText(label, { x: width / 2 - font.widthOfTextAtSize(label, size) / 2, y: size * 1.6, size, font, color: rgb(0.35, 0.35, 0.35) });
        }
      });
    }
    return out.save();
  }

  const download = (bytes, fname, type = 'application/pdf') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  async function run(kind) {
    setBusy(t.building); setErr('');
    try {
      if (kind === 'all') download(await buildPdf(pages), `${name}.pdf`);
      else if (kind === 'sel') download(await buildPdf(pages.filter((p) => p.sel)), `${name}-selected.pdf`);
      else {
        const { zipSync } = await import('fflate');
        const files = {};
        for (let i = 0; i < pages.length; i += 1) files[`${name}-${String(i + 1).padStart(3, '0')}.pdf`] = [await buildPdf([pages[i]]), { level: 0 }]; // eslint-disable-line no-await-in-loop
        download(zipSync(files), `${name}-pages.zip`, 'application/zip');
      }
    } catch (e) { console.error(e); setErr(String(e.message || e)); }
    setBusy('');
  }

  const selCount = pages.filter((p) => p.sel).length;

  return (
    <div className="tool-panel pdf-studio">
      <button type="button" className="tool-dropzone ss-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{busy || t.drop}</span>
        <span className="tool-dropzone-hint">{pages.length ? t.pages(pages.length, selCount) : t.hint}</span>
      </button>
      {err && <p className="color-invalid">{err}</p>}
      {pages.length > 0 && (
        <>
          <p className="tool-local-note">🖱 {t.tip}</p>
          <div className="pdf-grid">
            {pages.map((p, i) => (
              <div key={p.id} className={p.sel ? 'pdf-page is-sel' : 'pdf-page'}>
                <button type="button" className="pdf-thumb" onClick={() => patch(p.id, { sel: !p.sel })}>
                  <img src={p.thumb} alt="" style={{ transform: `rotate(${p.rot}deg)` }} />
                </button>
                <div className="pdf-bar">
                  <span>{i + 1}</span>
                  <button type="button" onClick={() => move(i, -1)} title="←">←</button>
                  <button type="button" onClick={() => move(i, 1)} title="→">→</button>
                  <button type="button" onClick={() => patch(p.id, { rot: (p.rot + 90) % 360 })} title="↻">↻</button>
                  <button type="button" onClick={() => setPages((l) => l.filter((x) => x.id !== p.id))} title="✕">✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="tool-controls">
            <label className="tool-field"><span className="tool-field-label">{t.name}</span><input className="dm-input" value={name} onChange={(e) => setName(e.target.value || 'document')} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.watermark}</span><input className="dm-input" value={wm} placeholder={t.wmPh} onChange={(e) => setWm(e.target.value)} /></label>
            {wm && <label className="tool-field"><span className="tool-field-label">{t.wmOpacity}: {Math.round(wmOpacity * 100)}%</span><input type="range" min="0.05" max="0.6" step="0.01" value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} /></label>}
            <label className="tool-check"><input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> {t.numbers}</label>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => run('all')} disabled={!!busy}>{t.build}</button>
            <button type="button" className="tool-btn" onClick={() => run('sel')} disabled={!!busy || !selCount}>{t.extract} ({selCount})</button>
            <button type="button" className="tool-btn" onClick={() => run('split')} disabled={!!busy}>{t.split}</button>
            <button type="button" className="tool-btn ghost" onClick={() => setPages((l) => l.map((x) => ({ ...x, sel: !selCount })))}>{selCount ? t.unselect : t.selectAll}</button>
            <button type="button" className="tool-btn ghost" onClick={() => { setPages([]); sources.current = {}; }}>{t.clear}</button>
          </div>
        </>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf,image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default PdfStudio;
