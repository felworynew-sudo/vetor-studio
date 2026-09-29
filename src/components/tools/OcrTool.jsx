import { useRef, useState } from 'react';

// OCR — распознавание текста на картинке (tesseract.js, Apache-2.0): 100+ языков,
// предобработка (увеличение мелкого текста, ч/б порог), рамки слов с уверенностью,
// копирование, .txt и PDF с текстовым слоем (поиск и выделение по скану).
// Движок и языковые данные скачиваются один раз; сама картинка никуда не уходит.

const LANGS = [
  ['rus', 'Русский'], ['eng', 'English'], ['ukr', 'Українська'], ['bel', 'Беларуская'], ['kaz', 'Қазақша'], ['deu', 'Deutsch'], ['fra', 'Français'],
  ['spa', 'Español'], ['ita', 'Italiano'], ['por', 'Português'], ['pol', 'Polski'], ['tur', 'Türkçe'], ['chi_sim', '中文 (简)'], ['jpn', '日本語'], ['kor', '한국어'], ['ara', 'العربية'],
];

const TEXT = {
  ru: {
    drop: 'Загрузите скан, фото документа или скриншот', hint: 'PNG, JPG, WebP — текст распознаётся прямо в браузере', langs: 'Языки текста',
    upscale: 'Увеличить мелкий текст ×2', binarize: 'Ч/б порог (для бледных сканов)', run: 'Распознать', loading: 'Загрузка движка и языков…', recognizing: 'Распознаю…',
    copy: 'Копировать текст', copied: 'Скопировано', txt: 'Скачать .txt', pdf: 'PDF с текстовым слоем', boxes: 'Показать рамки слов', conf: 'Уверенность',
    change: 'Другое изображение', empty: 'Текст не найден', words: 'слов', note: 'Первый запуск скачает движок (~5 МБ) и данные языков (~10–20 МБ каждый). Лучше всего — ровный скан 300 dpi.',
  },
  en: {
    drop: 'Upload a scan, document photo or screenshot', hint: 'PNG, JPG, WebP — text is recognized right in the browser', langs: 'Text languages',
    upscale: 'Upscale small text ×2', binarize: 'B/W threshold (for faint scans)', run: 'Recognize', loading: 'Loading engine and languages…', recognizing: 'Recognizing…',
    copy: 'Copy text', copied: 'Copied', txt: 'Download .txt', pdf: 'PDF with text layer', boxes: 'Show word boxes', conf: 'Confidence',
    change: 'Another image', empty: 'No text found', words: 'words', note: 'The first run downloads the engine (~5 MB) and language data (~10–20 MB each). A straight 300 dpi scan works best.',
  },
};

function prepare(img, upscale, binarize) {
  const k = upscale ? 2 : 1;
  const c = document.createElement('canvas'); c.width = img.naturalWidth * k; c.height = img.naturalHeight * k;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
  if (binarize) {
    const id = x.getImageData(0, 0, c.width, c.height); const d = id.data;
    // Порог Оцу по гистограмме яркости.
    const hist = new Float64Array(256); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])] += 1;
    let sum = 0; for (let i = 0; i < 256; i += 1) sum += i * hist[i];
    let sumB = 0; let wB = 0; let best = 0; let th = 128;
    for (let i = 0; i < 256; i += 1) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sumB += i * hist[i]; const mB = sumB / wB; const mF = (sum - sumB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = i; } } // eslint-disable-line no-continue
    for (let i = 0; i < d.length; i += 4) { const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) > th ? 255 : 0; d[i] = v; d[i + 1] = v; d[i + 2] = v; }
    x.putImageData(id, 0, 0);
  }
  return { canvas: c, k };
}

function OcrTool({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const [src, setSrc] = useState('');
  const [langs, setLangs] = useState(language === 'en' ? ['eng'] : ['rus', 'eng']);
  const [upscale, setUpscale] = useState(false);
  const [binarize, setBinarize] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // { text, conf, words, pdf, k }
  const [showBoxes, setShowBoxes] = useState(true);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('scan');

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setName(file.name.replace(/\.[^.]+$/, ''));
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { imgRef.current = img; setResult(null); setSrc((p) => { if (p) URL.revokeObjectURL(p); return url; }); }; img.src = url;
  }

  async function run() {
    if (!imgRef.current || !langs.length) return;
    setStatus(t.loading); setProgress(0); setResult(null);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(langs, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') { setStatus(t.recognizing); setProgress(Math.round(m.progress * 100)); } else if (m.progress != null) setProgress(Math.round(m.progress * 100));
        },
      });
      const { canvas, k } = prepare(imgRef.current, upscale, binarize);
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true, pdf: true });
      await worker.terminate();
      const words = [];
      (data.blocks || []).forEach((b) => b.paragraphs.forEach((p) => p.lines.forEach((l) => l.words.forEach((w) => words.push(w)))));
      setResult({ text: data.text.trim(), conf: data.confidence, words, pdf: data.pdf, k });
    } catch (e) { console.error(e); setResult({ text: '', conf: 0, words: [], error: String(e.message || e) }); }
    setStatus('');
  }

  const download = (blob, fname) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); };
  const toggleLang = (code) => setLangs((l) => (l.includes(code) ? l.filter((x) => x !== code) : [...l, code]));
  const img = imgRef.current;

  return (
    <div className="tool-panel ocr-tool">
      <div className="tool-field">
        <span className="tool-field-label">{t.langs}</span>
        <div className="mg-chips">{LANGS.map(([code, label]) => <button key={code} type="button" className={langs.includes(code) ? 'mg-chip is-active' : 'mg-chip'} onClick={() => toggleLang(code)}>{label}</button>)}</div>
      </div>
      {!src ? (
        <button type="button" className="tool-dropzone ss-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout ocr-layout">
          <div className="vz-view">
            <div className="ocr-img">
              <img src={src} alt="" />
              {showBoxes && result && img && result.words.map((w, i) => (
                <span
                  key={i} className={w.confidence > 80 ? 'ocr-box' : w.confidence > 55 ? 'ocr-box is-mid' : 'ocr-box is-low'}
                  style={{ left: `${(w.bbox.x0 / result.k / img.naturalWidth) * 100}%`, top: `${(w.bbox.y0 / result.k / img.naturalHeight) * 100}%`, width: `${((w.bbox.x1 - w.bbox.x0) / result.k / img.naturalWidth) * 100}%`, height: `${((w.bbox.y1 - w.bbox.y0) / result.k / img.naturalHeight) * 100}%` }}
                  title={`${w.text} · ${Math.round(w.confidence)}%`}
                />
              ))}
            </div>
            <div className="tool-actions">
              <label className="tool-check"><input type="checkbox" checked={upscale} onChange={(e) => setUpscale(e.target.checked)} /> {t.upscale}</label>
              <label className="tool-check"><input type="checkbox" checked={binarize} onChange={(e) => setBinarize(e.target.checked)} /> {t.binarize}</label>
            </div>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={run} disabled={!!status || !langs.length}>{status ? `${status} ${progress}%` : t.run}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()} disabled={!!status}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            {result && (
              <>
                {result.error && <p className="color-invalid">{result.error}</p>}
                <div className="ocr-meta">{t.conf}: <b>{Math.round(result.conf)}%</b> · {result.words.length} {t.words}</div>
                <textarea className="pf-input ocr-text" value={result.text || t.empty} onChange={(e) => setResult((r) => ({ ...r, text: e.target.value }))} rows={16} />
                <div className="tool-actions">
                  <button type="button" className="tool-btn primary" onClick={() => navigator.clipboard?.writeText(result.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>{copied ? `✓ ${t.copied}` : t.copy}</button>
                  <button type="button" className="tool-btn" onClick={() => download(new Blob([result.text], { type: 'text/plain;charset=utf-8' }), `${name}.txt`)}>{t.txt}</button>
                  {result.pdf && <button type="button" className="tool-btn" onClick={() => download(new Blob([new Uint8Array(result.pdf)], { type: 'application/pdf' }), `${name}-ocr.pdf`)}>{t.pdf}</button>}
                </div>
                <label className="tool-check"><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> {t.boxes}</label>
              </>
            )}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default OcrTool;
