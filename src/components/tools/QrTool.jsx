import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';

// QR-код: генератор (SVG/PNG, цвет и фон, включая прозрачный) + сканер (jsQR).
// Всё локально в браузере.

const TEXT = {
  ru: {
    tabGen: 'Создать', tabScan: 'Сканировать',
    data: 'Текст или ссылка', ecc: 'Коррекция ошибок', fg: 'Цвет кода', bg: 'Фон',
    transparent: 'Прозрачный фон', dlSvg: 'Скачать SVG', dlPng: 'Скачать PNG',
    scanDrop: 'Загрузите изображение с QR-кодом', scanHint: 'PNG, JPG, WebP — распознаётся локально',
    result: 'Результат', copy: 'Копировать', copied: 'Скопировано', notFound: 'QR-код не найден на изображении',
    open: 'Открыть ссылку', hint: 'Коррекция H переживёт даже частично повреждённый код.',
  },
  en: {
    tabGen: 'Create', tabScan: 'Scan',
    data: 'Text or link', ecc: 'Error correction', fg: 'Code color', bg: 'Background',
    transparent: 'Transparent background', dlSvg: 'Download SVG', dlPng: 'Download PNG',
    scanDrop: 'Upload an image with a QR code', scanHint: 'PNG, JPG, WebP — decoded locally',
    result: 'Result', copy: 'Copy', copied: 'Copied', notFound: 'No QR code found in the image',
    open: 'Open link', hint: 'The H level survives even a partially damaged code.',
  },
};

const ECC = ['L', 'M', 'Q', 'H'];
const MARGIN = 4;

function buildMatrix(data, ecc) {
  const qr = qrcode(0, ecc);
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  return { count, isDark: (r, c) => qr.isDark(r, c) };
}

function matrixToSvg({ count, isDark }, fg, bg, transparent) {
  const size = count + MARGIN * 2;
  let rects = '';
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (isDark(r, c)) rects += `<rect x="${c + MARGIN}" y="${r + MARGIN}" width="1" height="1"/>`;
    }
  }
  const bgRect = transparent ? '' : `<rect width="${size}" height="${size}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${bgRect}<g fill="${fg}">${rects}</g></svg>`;
}

function isUrl(str) {
  return /^https?:\/\//i.test(str.trim());
}

function QrTool({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [tab, setTab] = useState('gen');

  // --- Генератор ---
  const [data, setData] = useState('https://vetor-studio.ru/tools');
  const [ecc, setEcc] = useState('M');
  const [fg, setFg] = useState('#0d0d11');
  const [bg, setBg] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);

  const svg = useMemo(() => {
    if (!data.trim()) return '';
    try { return matrixToSvg(buildMatrix(data, ecc), fg, bg, transparent); } catch { return ''; }
  }, [data, ecc, fg, bg, transparent]);

  function downloadSvg() {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'qr.svg';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }
  function downloadPng() {
    const scale = 16;
    const m = buildMatrix(data, ecc);
    const size = (m.count + MARGIN * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!transparent) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
    ctx.fillStyle = fg;
    for (let r = 0; r < m.count; r += 1) {
      for (let c = 0; c < m.count; c += 1) {
        if (m.isDark(r, c)) ctx.fillRect((c + MARGIN) * scale, (r + MARGIN) * scale, scale, scale);
      }
    }
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'qr.png';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  // --- Сканер ---
  const scanInputRef = useRef(null);
  const [scanResult, setScanResult] = useState(null); // string | 'notfound' | null
  const [copied, setCopied] = useState(false);

  function scanFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1000;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, canvas.width, canvas.height);
      setScanResult(code ? code.data : 'notfound');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function copyResult() {
    if (navigator.clipboard && scanResult && scanResult !== 'notfound') {
      navigator.clipboard.writeText(scanResult).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
    }
  }

  useEffect(() => { setScanResult(null); }, [tab]);

  return (
    <div className="tool-panel qr-tool">
      <div className="segmented qr-tabs">
        <button type="button" className={tab === 'gen' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('gen')}>{t.tabGen}</button>
        <button type="button" className={tab === 'scan' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab('scan')}>{t.tabScan}</button>
      </div>

      {tab === 'gen' ? (
        <div className="qr-gen">
          <div className="qr-gen-left">
            <div className="tool-field">
              <span className="tool-field-label">{t.data}</span>
              <textarea className="qr-data" value={data} onChange={(e) => setData(e.target.value)} rows={3} />
            </div>
            <div className="tool-controls">
              <div className="tool-field">
                <span className="tool-field-label">{t.ecc}</span>
                <div className="segmented">
                  {ECC.map((l) => (
                    <button key={l} type="button" className={l === ecc ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setEcc(l)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.fg}</span>
                <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
              </div>
              <div className="tool-field">
                <span className="tool-field-label">{t.bg}</span>
                <input type="color" value={bg} disabled={transparent} onChange={(e) => setBg(e.target.value)} />
              </div>
            </div>
            <label className="wm-check">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              {t.transparent}
            </label>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={downloadSvg} disabled={!svg}>{t.dlSvg}</button>
              <button type="button" className="tool-btn" onClick={downloadPng} disabled={!svg}>{t.dlPng}</button>
            </div>
          </div>
          <div className={transparent ? 'qr-preview is-transparent' : 'qr-preview'} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      ) : (
        <div className="qr-scan">
          <button
            type="button"
            className="tool-dropzone"
            onClick={() => scanInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); scanFile(e.dataTransfer.files[0]); }}
          >
            <span className="tool-dropzone-title">{t.scanDrop}</span>
            <span className="tool-dropzone-hint">{t.scanHint}</span>
          </button>
          {scanResult === 'notfound' && <p className="color-invalid">{t.notFound}</p>}
          {scanResult && scanResult !== 'notfound' && (
            <div className="qr-result">
              <span className="tool-field-label">{t.result}</span>
              <code className="qr-result-code">{scanResult}</code>
              <div className="tool-actions">
                <button type="button" className="tool-btn primary" onClick={copyResult}>{copied ? `✓ ${t.copied}` : t.copy}</button>
                {isUrl(scanResult) && <a className="tool-btn" href={scanResult} target="_blank" rel="noreferrer nofollow">{t.open}</a>}
              </div>
            </div>
          )}
          <input ref={scanInputRef} type="file" accept="image/*" hidden onChange={(e) => { scanFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
      )}

      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default QrTool;
