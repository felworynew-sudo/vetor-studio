import { useEffect, useRef, useState } from 'react';

// Контакт-лист: много фото → листы-сетки с подписями (имя файла, размер, дата
// съёмки), заголовок, нумерация. Форматы A4/A3/Letter или пиксели; экспорт PNG
// (текущий лист) и многостраничный PDF (pdf-lib, MIT). Для отбора кадров,
// портфолио, согласования съёмок с клиентом.

const PAGES = {
  a4: { ru: 'A4', w: 2480, h: 3508, pt: [595.28, 841.89] }, a3: { ru: 'A3', w: 3508, h: 4961, pt: [841.89, 1190.55] },
  letter: { ru: 'Letter', w: 2550, h: 3300, pt: [612, 792] }, square: { ru: '2048²', w: 2048, h: 2048, pt: [595.28, 595.28] }, wide: { ru: '1920×1080', w: 1920, h: 1080, pt: [841.89, 473.56] },
};

const TEXT = {
  ru: {
    drop: 'Перетащите фото (можно десятки)', count: (n) => `Фото: ${n}`, page: 'Формат', landscape: 'Альбомная', cols: 'Колонок', rows: 'Строк', gap: 'Зазор',
    fit: 'Кадрировать в квадрат', captions: 'Подписи', none: 'Нет', name: 'Имя', full: 'Имя + размер', title: 'Заголовок листа', titlePh: 'Съёмка 29.09 · выбор кадров',
    numbers: 'Нумерация', dark: 'Тёмный фон', png: 'Скачать лист PNG', pdf: 'Скачать PDF (все листы)', sheet: 'Лист', of: 'из', clear: 'Очистить',
    note: 'Всё локально. Фото сортируются по имени файла.',
  },
  en: {
    drop: 'Drop photos (dozens are fine)', count: (n) => `Photos: ${n}`, page: 'Page', landscape: 'Landscape', cols: 'Columns', rows: 'Rows', gap: 'Gap',
    fit: 'Crop to square', captions: 'Captions', none: 'None', name: 'Name', full: 'Name + size', title: 'Sheet title', titlePh: 'Shoot 29.09 · picks',
    numbers: 'Numbering', dark: 'Dark background', png: 'Download sheet PNG', pdf: 'Download PDF (all sheets)', sheet: 'Sheet', of: 'of', clear: 'Clear',
    note: 'All local. Photos are sorted by file name.',
  },
};

const loadImg = (file) => new Promise((res) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => res({ img: i, url: u, name: file.name, size: file.size }); i.onerror = () => res(null); i.src = u; });

function ContactSheet({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null); const previewRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [pageId, setPageId] = useState('a4');
  const [landscape, setLandscape] = useState(false);
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(5);
  const [gap, setGap] = useState(24);
  const [square, setSquare] = useState(false);
  const [captions, setCaptions] = useState('name');
  const [title, setTitle] = useState('');
  const [numbers, setNumbers] = useState(true);
  const [dark, setDark] = useState(false);
  const [sheetIdx, setSheetIdx] = useState(0);

  async function add(list) {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/'));
    const loaded = (await Promise.all(files.map(loadImg))).filter(Boolean);
    setPhotos((p) => [...p, ...loaded].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  }

  const perSheet = cols * rows; const sheets = Math.max(1, Math.ceil(photos.length / perSheet));
  const dims = () => { const p = PAGES[pageId]; return landscape && p.w < p.h ? { w: p.h, h: p.w } : { w: p.w, h: p.h }; };

  function renderSheet(idx) {
    const { w: W, h: H } = dims();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = dark ? '#141416' : '#ffffff'; x.fillRect(0, 0, W, H);
    const margin = Math.round(Math.min(W, H) * 0.045); const fg = dark ? '#e8e8ea' : '#1c1c20'; const muted = dark ? '#8a8a90' : '#77777d';
    let top = margin;
    const fs = Math.round(Math.min(W, H) * 0.022);
    if (title) { x.fillStyle = fg; x.font = `700 ${Math.round(fs * 1.5)}px system-ui, sans-serif`; x.textBaseline = 'top'; x.fillText(title, margin, top); }
    x.fillStyle = muted; x.font = `500 ${fs}px system-ui, sans-serif`; x.textAlign = 'right'; x.textBaseline = 'top';
    x.fillText(`${t.sheet} ${idx + 1} ${t.of} ${sheets}`, W - margin, top + (title ? fs * 0.3 : 0)); x.textAlign = 'left';
    top += title ? fs * 2.6 : fs * 1.8;
    const capH = captions === 'none' && !numbers ? 0 : fs * (captions === 'full' ? 2.6 : 1.6);
    const cellW = (W - margin * 2 - gap * (cols - 1)) / cols; const cellH = (H - top - margin - gap * (rows - 1)) / rows;
    const imgH = cellH - capH;
    photos.slice(idx * perSheet, idx * perSheet + perSheet).forEach((p, i) => {
      const col = i % cols; const row = Math.floor(i / cols);
      const cx = margin + col * (cellW + gap); const cy = top + row * (cellH + gap);
      const iw = p.img.naturalWidth; const ih = p.img.naturalHeight;
      if (square) {
        const s = Math.min(cellW, imgH); const m = Math.min(iw, ih);
        x.drawImage(p.img, (iw - m) / 2, (ih - m) / 2, m, m, cx + (cellW - s) / 2, cy, s, s);
      } else {
        const k = Math.min(cellW / iw, imgH / ih); const dw = iw * k; const dh = ih * k;
        x.drawImage(p.img, cx + (cellW - dw) / 2, cy + (imgH - dh) / 2, dw, dh);
      }
      if (capH) {
        x.fillStyle = fg; x.font = `600 ${Math.round(fs * 0.8)}px system-ui, sans-serif`; x.textBaseline = 'top';
        const n = idx * perSheet + i + 1;
        const label = `${numbers ? `${n}. ` : ''}${captions !== 'none' ? p.name : ''}`;
        x.fillText(label, cx, cy + imgH + fs * 0.35, cellW);
        if (captions === 'full') { x.fillStyle = muted; x.font = `500 ${Math.round(fs * 0.7)}px system-ui, sans-serif`; x.fillText(`${iw}×${ih} · ${(p.size / 1048576).toFixed(1)} MB`, cx, cy + imgH + fs * 1.4, cellW); }
      }
    });
    return c;
  }

  useEffect(() => {
    if (!photos.length || !previewRef.current) return;
    const idx = Math.min(sheetIdx, sheets - 1);
    const c = renderSheet(idx); const p = previewRef.current;
    const k = Math.min(1, 900 / Math.max(c.width, c.height)); p.width = Math.round(c.width * k); p.height = Math.round(c.height * k);
    p.getContext('2d').drawImage(c, 0, 0, p.width, p.height);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function downloadPng() {
    renderSheet(Math.min(sheetIdx, sheets - 1)).toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `contact-sheet-${sheetIdx + 1}.png`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }
  async function downloadPdf() {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const p = PAGES[pageId]; const [pw, ph] = landscape && p.pt[0] < p.pt[1] ? [p.pt[1], p.pt[0]] : p.pt;
    for (let i = 0; i < sheets; i += 1) {
      const blob = await new Promise((r) => renderSheet(i).toBlob(r, 'image/jpeg', 0.9)); // eslint-disable-line no-await-in-loop
      const jpg = await doc.embedJpg(await blob.arrayBuffer()); // eslint-disable-line no-await-in-loop
      const page = doc.addPage([pw, ph]); page.drawImage(jpg, { x: 0, y: 0, width: pw, height: ph });
    }
    const bytes = await doc.save();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = 'contact-sheet.pdf'; document.body.appendChild(a); a.click(); a.remove();
  }

  const seg = (v, set, items) => <div className="segmented dm-seg">{items.map(([id, l]) => <button key={id} type="button" className={v === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(id)}>{l}</button>)}</div>;
  const range = (label, v, set, min, max) => <label className="tool-field"><span className="tool-field-label">{label}: {v}</span><input type="range" min={min} max={max} value={v} onChange={(e) => set(Number(e.target.value))} /></label>;

  return (
    <div className="tool-panel contact-sheet">
      <button type="button" className="tool-dropzone ss-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.count(photos.length)}</span>
      </button>
      {photos.length > 0 && (
        <div className="vz-layout">
          <div className="vz-view">
            <div className="dm-preview"><canvas ref={previewRef} /></div>
            {sheets > 1 && (
              <div className="tool-actions">
                <button type="button" className="tool-btn small" onClick={() => setSheetIdx((i) => Math.max(0, i - 1))}>←</button>
                <span className="tool-local-note">{t.sheet} {Math.min(sheetIdx, sheets - 1) + 1} {t.of} {sheets}</span>
                <button type="button" className="tool-btn small" onClick={() => setSheetIdx((i) => Math.min(sheets - 1, i + 1))}>→</button>
              </div>
            )}
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={downloadPdf}>{t.pdf}</button>
              <button type="button" className="tool-btn" onClick={downloadPng}>{t.png}</button>
              <button type="button" className="tool-btn ghost" onClick={() => { setPhotos([]); setSheetIdx(0); }}>{t.clear}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="tool-field"><span className="tool-field-label">{t.page}</span>{seg(pageId, setPageId, Object.entries(PAGES).map(([id, p]) => [id, p.ru]))}</div>
            <label className="tool-check"><input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} /> {t.landscape}</label>
            {range(t.cols, cols, setCols, 1, 10)}
            {range(t.rows, rows, setRows, 1, 12)}
            {range(t.gap, gap, setGap, 0, 80)}
            <label className="tool-check"><input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} /> {t.fit}</label>
            <div className="tool-field"><span className="tool-field-label">{t.captions}</span>{seg(captions, setCaptions, [['none', t.none], ['name', t.name], ['full', t.full]])}</div>
            <label className="tool-check"><input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> {t.numbers}</label>
            <label className="tool-check"><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> {t.dark}</label>
            <label className="tool-field"><span className="tool-field-label">{t.title}</span><input className="dm-input" value={title} placeholder={t.titlePh} onChange={(e) => setTitle(e.target.value)} /></label>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default ContactSheet;
