import { useEffect, useMemo, useRef, useState } from 'react';
import CompareSlider from './shared/CompareSlider';
import { GRADE_DEFAULTS, gradeColor, gradeUniforms } from '../../utils/gradeMath';
import { applyLut, buildLut, downloadText, haldImage, lutFromHald, parse3dl, parseCube, resizeLut, sampleLut, write3dl, writeCube } from '../../utils/lut';
import { oklabToLinear, rgbToOklab } from '../../utils/oklab';

// LUT-студия: открыть .cube / .3dl / Hald CLUT PNG, посмотреть на своём фото (или
// тест-таблице), ослабить, сменить размер и сохранить в .cube / .3dl / Hald. Плюс
// генератор «луков» — кинематографичные пресеты, запечённые в LUT.

const l2s = (v) => { const c = Math.max(0, Math.min(1, v)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
// Раздельное тонирование в OKLab: тени к одному тону, света к другому.
function splitTone(rgb, sh, hi, amount = 1) {
  const [L, a, b] = rgbToOklab(rgb[0] * 255, rgb[1] * 255, rgb[2] * 255);
  const ws = (1 - L) ** 2 * amount; const wh = L ** 2 * amount;
  const rad = (d) => (d * Math.PI) / 180;
  const na = a + ws * sh[1] * Math.cos(rad(sh[0])) + wh * hi[1] * Math.cos(rad(hi[0]));
  const nb = b + ws * sh[1] * Math.sin(rad(sh[0])) + wh * hi[1] * Math.sin(rad(hi[0]));
  return oklabToLinear(L, na, nb).map(l2s);
}
const grade = (p) => { const U = gradeUniforms({ ...GRADE_DEFAULTS, ...p }); return (rgb) => gradeColor(rgb, U); };
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const LOOKS = [
  { id: 'teal', ru: 'Teal & Orange', en: 'Teal & Orange', fn: (c) => grade({ contrast: 15, vibrance: 10 })(splitTone(c, [220, 0.06], [55, 0.05])) },
  { id: 'bleach', ru: 'Bleach bypass', en: 'Bleach bypass', fn: (c) => { const g = grade({ contrast: 35, saturation: -55, clarity: 0 })(c); const y = luma(g); return g.map((v) => v * 0.7 + y * 0.3); } },
  { id: 'cross', ru: 'Кросс-процесс', en: 'Cross process', fn: ([r, g, b]) => { const s = (x, k) => 1 / (1 + Math.exp(-k * (x - 0.5))); const n = (x, k) => (s(x, k) - s(0, k)) / (s(1, k) - s(0, k)); return [n(r, 7), n(g, 4.5), 0.18 + b * 0.64]; } },
  { id: 'warmfilm', ru: 'Тёплая плёнка', en: 'Warm film', fn: grade({ temperature: 25, fade: 40, contrast: -5, saturation: -10, highlights: -20 }) },
  { id: 'coolfilm', ru: 'Холодная плёнка', en: 'Cool film', fn: (c) => grade({ temperature: -20, fade: 30, saturation: -15 })(splitTone(c, [150, 0.03], [80, 0.02])) },
  { id: 'cinegreen', ru: 'Кино: зелёные тени', en: 'Cine green shadows', fn: (c) => grade({ contrast: 20, saturation: -10 })(splitTone(c, [165, 0.06], [70, 0.035])) },
  { id: 'vintage', ru: 'Винтаж', en: 'Vintage', fn: (c) => grade({ fade: 70, saturation: -30, temperature: 18, contrast: -12 })(splitTone(c, [300, 0.02], [85, 0.03])) },
  { id: 'bw', ru: 'Ч/Б (красный фильтр)', en: 'B/W (red filter)', fn: ([r, g, b]) => { const y = Math.min(1, 0.55 * r + 0.4 * g + 0.05 * b); const k = grade({ contrast: 20 })([y, y, y]); return k; } },
  { id: 'sepia', ru: 'Сепия', en: 'Sepia', fn: (c) => { const y = luma(c); return splitTone([y, y, y], [55, 0.07], [70, 0.05]); } },
];

const TEXT = {
  ru: {
    photo: 'Ваше фото для превью (необязательно)', open: 'Открыть LUT (.cube, .3dl, Hald PNG)', looks: 'Или сгенерировать «лук»',
    mix: 'Сила', size: 'Размер LUT', export: 'Сохранить', identity: 'Пустой Hald (обработайте в Photoshop и загрузите обратно)',
    before: 'Оригинал', after: 'С LUT', current: 'Текущий LUT', none: 'LUT не выбран', photoBtn: 'Загрузить фото', applyPhoto: 'Скачать фото с LUT',
    note: 'LUT (Look-Up Table) — «цветовой рецепт» для Premiere, DaVinci Resolve, Final Cut, OBS, Lightroom, Photoshop. Hald CLUT — тот же LUT в виде картинки: его можно покрасить в любом редакторе.',
    err: 'Не удалось прочитать файл',
  },
  en: {
    photo: 'Your photo for preview (optional)', open: 'Open a LUT (.cube, .3dl, Hald PNG)', looks: 'Or generate a look',
    mix: 'Strength', size: 'LUT size', export: 'Save', identity: 'Blank Hald (grade it in Photoshop and load it back)',
    before: 'Original', after: 'With LUT', current: 'Current LUT', none: 'No LUT selected', photoBtn: 'Upload photo', applyPhoto: 'Download photo with LUT',
    note: 'A LUT (Look-Up Table) is a “color recipe” for Premiere, DaVinci Resolve, Final Cut, OBS, Lightroom, Photoshop. A Hald CLUT is the same LUT as an image: you can grade it in any editor.',
    err: 'Could not read the file',
  },
};

// Тест-таблица: радуга по тону/светлоте + шкала серого + телесные тона.
function testChart(w = 960, h = 540) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  for (let i = 0; i < w; i += 1) {
    const g = x.createLinearGradient(0, 0, 0, h * 0.72);
    g.addColorStop(0, `hsl(${(i / w) * 360}, 90%, 92%)`); g.addColorStop(0.5, `hsl(${(i / w) * 360}, 90%, 50%)`); g.addColorStop(1, `hsl(${(i / w) * 360}, 90%, 8%)`);
    x.fillStyle = g; x.fillRect(i, 0, 1, h * 0.72);
  }
  const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff');
  x.fillStyle = gr; x.fillRect(0, h * 0.72, w, h * 0.14);
  ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3a21', '#a0785a', '#e8b89a'].forEach((col, i) => { x.fillStyle = col; x.fillRect((i * w) / 8, h * 0.86, w / 8, h * 0.14); });
  return c;
}

function LutStudio({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const lutInput = useRef(null); const photoInput = useRef(null);
  const [photo, setPhoto] = useState(null); // { img, url, name }
  const [lut, setLut] = useState(null);
  const [lutName, setLutName] = useState('');
  const [mix, setMix] = useState(1);
  const [size, setSize] = useState(33);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState({ before: '', after: '' });
  const chart = useMemo(() => (typeof document !== 'undefined' ? testChart() : null), []);

  function openLut(file) {
    if (!file) return;
    setErr('');
    if (/\.png$|image\//i.test(file.name + file.type)) {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
          setLut(lutFromHald(x.getImageData(0, 0, c.width, c.height))); setLutName(file.name);
        } catch (e) { setErr(`${t.err}: ${e.message}`); }
        URL.revokeObjectURL(url);
      };
      img.src = url;
      return;
    }
    file.text().then((text) => {
      try { setLut(/\.3dl$/i.test(file.name) ? parse3dl(text) : parseCube(text)); setLutName(file.name); } catch (e) { setErr(`${t.err}: ${e.message}`); }
    });
  }

  function pickLook(look) { setLut(buildLut(look.fn, 33)); setLutName(`${look[language] || look.ru}.cube`); }

  function loadPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => setPhoto({ img, url, name: file.name.replace(/\.[^.]+$/, '') }); img.src = url;
  }

  useEffect(() => {
    const src = photo ? photo.img : chart; if (!src || !lut) return undefined;
    const timer = setTimeout(() => {
      const w0 = src.naturalWidth || src.width; const h0 = src.naturalHeight || src.height;
      const k = Math.min(1, 1400 / Math.max(w0, h0));
      const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, c.width, c.height);
      const before = photo ? photo.url : c.toDataURL('image/jpeg', 0.9);
      x.putImageData(applyLut(x.getImageData(0, 0, c.width, c.height), lut, mix), 0, 0);
      setPreview({ before, after: c.toDataURL('image/jpeg', 0.9) });
    }, 100);
    return () => clearTimeout(timer);
  }, [photo, lut, mix, chart]);

  const withMix = () => (mix === 1 ? lut : buildLut(([r, g, b]) => { const v = sampleLut(lut, r, g, b); return [r + (v[0] - r) * mix, g + (v[1] - g) * mix, b + (v[2] - b) * mix]; }, lut.size));
  const base = (lutName || 'vetor').replace(/\.[^.]+$/, '');
  function save(kind) {
    const L = size === withMix().size ? withMix() : resizeLut(withMix(), size);
    if (kind === 'cube') downloadText(writeCube(L, base), `${base}-${size}.cube`);
    else if (kind === '3dl') downloadText(write3dl(L), `${base}-${size}.3dl`);
    else savePng(haldImage(withMix(), 8), `${base}-hald8.png`);
  }
  function savePng(imageData, name) {
    const c = document.createElement('canvas'); c.width = imageData.width; c.height = imageData.height; c.getContext('2d').putImageData(imageData, 0, 0);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }
  function downloadPhoto() {
    const img = photo.img; const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    x.putImageData(applyLut(x.getImageData(0, 0, c.width, c.height), lut, mix), 0, 0);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${photo.name}-${base}.jpg`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/jpeg', 0.94);
  }

  return (
    <div className="tool-panel lut-studio">
      <div className="lut-top">
        <button type="button" className="tool-dropzone lut-drop" onClick={() => lutInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); openLut(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.open}</span>
          <span className="tool-dropzone-hint">{lutName ? `${t.current}: ${lutName} · ${lut?.size}³` : t.none}</span>
        </button>
        <button type="button" className="tool-dropzone lut-drop" onClick={() => photoInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadPhoto(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.photoBtn}</span>
          <span className="tool-dropzone-hint">{photo ? photo.name : t.photo}</span>
        </button>
      </div>
      {err && <p className="color-invalid">{err}</p>}

      <div className="tool-field">
        <span className="tool-field-label">{t.looks}</span>
        <div className="mg-chips">{LOOKS.map((l) => <button key={l.id} type="button" className="mg-chip" onClick={() => pickLook(l)}>{l[language] || l.ru}</button>)}</div>
      </div>

      {lut && preview.after && (
        <>
          <CompareSlider before={preview.before} after={preview.after} language={language} beforeLabel={t.before} afterLabel={t.after} />
          <div className="tool-controls">
            <label className="tool-field"><span className="tool-field-label">{t.mix}: {Math.round(mix * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix} onChange={(e) => setMix(Number(e.target.value))} /></label>
            <div className="tool-field">
              <span className="tool-field-label">{t.size}</span>
              <div className="segmented">{[17, 33, 65].map((s) => <button key={s} type="button" className={size === s ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSize(s)}>{s}³</button>)}</div>
            </div>
          </div>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={() => save('cube')}>{t.export} .cube</button>
            <button type="button" className="tool-btn" onClick={() => save('3dl')}>.3dl</button>
            <button type="button" className="tool-btn" onClick={() => save('hald')}>Hald PNG</button>
            {photo && <button type="button" className="tool-btn" onClick={downloadPhoto}>{t.applyPhoto}</button>}
          </div>
        </>
      )}
      <div className="tool-actions">
        <button type="button" className="tool-btn ghost small" onClick={() => savePng(haldImage(null, 8), 'identity-hald8.png')}>⬇ {t.identity}</button>
      </div>

      <input ref={lutInput} type="file" accept=".cube,.3dl,.png,image/png" hidden onChange={(e) => { openLut(e.target.files[0]); e.target.value = ''; }} />
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { loadPhoto(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🎬 {t.note}</p>
    </div>
  );
}

export default LutStudio;
