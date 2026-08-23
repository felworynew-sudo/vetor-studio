import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

// Генератор штрих-кодов (JsBarcode). Рендер в SVG, экспорт SVG/PNG. Локально.

const FORMATS = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'MSI', 'pharmacode', 'codabar'];

const TEXT = {
  ru: {
    data: 'Данные', format: 'Формат', fg: 'Цвет', bg: 'Фон', showText: 'Подпись под кодом',
    dlSvg: 'Скачать SVG', dlPng: 'Скачать PNG', invalid: 'Данные не подходят под этот формат',
    hint: 'CODE128 подходит для большинства задач. EAN/UPC требуют строго цифры нужной длины.',
  },
  en: {
    data: 'Data', format: 'Format', fg: 'Color', bg: 'Background', showText: 'Caption under the code',
    dlSvg: 'Download SVG', dlPng: 'Download PNG', invalid: 'Data does not fit this format',
    hint: 'CODE128 fits most cases. EAN/UPC require digits of a specific length.',
  },
};

function Barcode({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const svgRef = useRef(null);
  const [data, setData] = useState('VETOR-2026');
  const [format, setFormat] = useState('CODE128');
  const [fg, setFg] = useState('#0d0d11');
  const [bg, setBg] = useState('#ffffff');
  const [showText, setShowText] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, data || ' ', {
        format,
        lineColor: fg,
        background: bg,
        displayValue: showText,
        margin: 10,
        width: 2,
        height: 90,
        valid: (v) => { if (!v) throw new Error('invalid'); },
      });
      setError('');
    } catch {
      setError(t.invalid);
    }
  }, [data, format, fg, bg, showText, t.invalid]);

  function downloadSvg() {
    if (error || !svgRef.current) return;
    const svg = svgRef.current.outerHTML;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'barcode.svg';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }
  function downloadPng() {
    if (error || !svgRef.current) return;
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const img = new Image();
    const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2; canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'barcode.png';
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.src = url;
  }

  return (
    <div className="tool-panel barcode-tool">
      <div className="tool-field">
        <span className="tool-field-label">{t.data}</span>
        <input type="text" className="wm-text-input" style={{ width: '100%', maxWidth: 360 }} value={data} onChange={(e) => setData(e.target.value)} />
      </div>

      <div className="tool-controls">
        <div className="tool-field">
          <span className="tool-field-label">{t.format}</span>
          <select className="cb-select" value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.fg}</span>
          <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
        </div>
        <div className="tool-field">
          <span className="tool-field-label">{t.bg}</span>
          <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
        </div>
        <label className="wm-check" style={{ alignSelf: 'flex-end' }}>
          <input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} />
          {t.showText}
        </label>
      </div>

      <div className="barcode-preview" style={{ background: bg }}>
        <svg ref={svgRef} />
      </div>
      {error && <p className="color-invalid">{error}</p>}

      <div className="tool-actions">
        <button type="button" className="tool-btn primary" onClick={downloadSvg} disabled={!!error}>{t.dlSvg}</button>
        <button type="button" className="tool-btn" onClick={downloadPng} disabled={!!error}>{t.dlPng}</button>
      </div>

      <p className="tool-local-note">🔒 {t.hint}</p>
    </div>
  );
}

export default Barcode;
