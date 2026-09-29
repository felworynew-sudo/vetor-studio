import { useEffect, useRef, useState } from 'react';
import CompareSlider from './shared/CompareSlider';

// Сравнение изображений: два макета/скриншота → шторка, наложение (onion skin),
// разностное смешивание, подсветка отличий pixelmatch (ISC, перцептивная метрика
// YIQ с детектором сглаживания) с процентом изменённых пикселей и SSIM с картой.

const TEXT = {
  ru: {
    a: 'A · было', b: 'B · стало', drop: 'Перетащите или нажмите', mode: 'Режим', slider: 'Шторка', onion: 'Наложение', diffBlend: 'Разница', highlight: 'Отличия', ssimMap: 'Карта SSIM',
    threshold: 'Чувствительность', aa: 'Игнорировать сглаживание', opacity: 'Прозрачность B', align: 'Разные размеры', fit: 'Подогнать B под A', topleft: 'Выровнять по левому верху',
    changed: 'Изменено пикселей', ssim: 'SSIM', identical: 'Изображения идентичны', swap: 'Поменять', download: 'Скачать карту отличий',
    note: 'Удобно для визуального регресс-тестирования, сравнения версий макета и проверки ретуши. Всё локально.',
    sizes: (a, b) => `A: ${a} · B: ${b}`,
  },
  en: {
    a: 'A · before', b: 'B · after', drop: 'Drop or click', mode: 'Mode', slider: 'Slider', onion: 'Onion skin', diffBlend: 'Difference', highlight: 'Highlights', ssimMap: 'SSIM map',
    threshold: 'Sensitivity', aa: 'Ignore anti-aliasing', opacity: 'B opacity', align: 'Different sizes', fit: 'Fit B to A', topleft: 'Align top-left',
    changed: 'Changed pixels', ssim: 'SSIM', identical: 'Images are identical', swap: 'Swap', download: 'Download diff map',
    note: 'Handy for visual regression testing, comparing design versions and checking retouching. All local.',
    sizes: (a, b) => `A: ${a} · B: ${b}`,
  },
};

const MAX = 2000;

function Drop({ label, url, onFile, t }) {
  const ref = useRef(null);
  return (
    <button type="button" className="pt-drop" onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
      {url ? <img src={url} alt="" /> : <span>{t.drop}</span>}
      <em>{label}</em>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
    </button>
  );
}

// SSIM по яркости окнами 8×8 (Wang et al., 2004): среднее и карта.
function ssim(a, b, w, h) {
  const Y = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const C1 = (0.01 * 255) ** 2; const C2 = (0.03 * 255) ** 2; const S = 8;
  const bw = Math.ceil(w / S); const bh = Math.ceil(h / S);
  const map = new Float32Array(bw * bh); let sum = 0;
  for (let by = 0; by < bh; by += 1) {
    for (let bx = 0; bx < bw; bx += 1) {
      let ma = 0; let mb = 0; let n = 0;
      for (let y = by * S; y < Math.min(h, by * S + S); y += 1) for (let x = bx * S; x < Math.min(w, bx * S + S); x += 1) { const i = (y * w + x) * 4; ma += Y(a, i); mb += Y(b, i); n += 1; }
      ma /= n; mb /= n;
      let va = 0; let vb = 0; let cov = 0;
      for (let y = by * S; y < Math.min(h, by * S + S); y += 1) for (let x = bx * S; x < Math.min(w, bx * S + S); x += 1) { const i = (y * w + x) * 4; const da = Y(a, i) - ma; const db = Y(b, i) - mb; va += da * da; vb += db * db; cov += da * db; }
      va /= n; vb /= n; cov /= n;
      const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      map[by * bw + bx] = s; sum += s;
    }
  }
  return { mean: sum / (bw * bh), map, bw, bh };
}

function ImageDiff({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [mode, setMode] = useState('highlight');
  const [threshold, setThreshold] = useState(0.1);
  const [aa, setAa] = useState(true);
  const [opacity, setOpacity] = useState(0.5);
  const [align, setAlign] = useState('fit');
  const [res, setRes] = useState(null); // { w, h, aUrl, bUrl, diffUrl, blendUrl, ssimUrl, changed, ssim }

  const load = (set) => (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => set({ img, url }); img.src = url;
  };

  useEffect(() => {
    if (!a || !b) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const k = Math.min(1, MAX / Math.max(a.img.naturalWidth, a.img.naturalHeight));
      const w = Math.round(a.img.naturalWidth * k); const h = Math.round(a.img.naturalHeight * k);
      const draw = (img, fitB) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
        if (fitB) x.drawImage(img, 0, 0, w, h); else x.drawImage(img, 0, 0, img.naturalWidth * k, img.naturalHeight * k);
        return { c, x, d: x.getImageData(0, 0, w, h) };
      };
      const A = draw(a.img, true); const B = draw(b.img, align === 'fit');
      const { default: pixelmatch } = await import('pixelmatch');
      if (cancelled) return;
      const out = new ImageData(w, h);
      const changed = pixelmatch(A.d.data, B.d.data, out.data, w, h, { threshold, includeAA: !aa, alpha: 0.25, diffColor: [255, 40, 80], aaColor: [255, 200, 0] });
      const s = ssim(A.d.data, B.d.data, w, h);
      // Разностное смешивание |A − B|, усиленное.
      const blend = new ImageData(w, h);
      for (let i = 0; i < blend.data.length; i += 4) {
        for (let ch = 0; ch < 3; ch += 1) blend.data[i + ch] = Math.min(255, Math.abs(A.d.data[i + ch] - B.d.data[i + ch]) * 3);
        blend.data[i + 3] = 255;
      }
      // Карта SSIM: зелёный — совпадает, красный — различается.
      const sc = document.createElement('canvas'); sc.width = s.bw; sc.height = s.bh;
      const sx = sc.getContext('2d'); const sid = sx.createImageData(s.bw, s.bh);
      for (let i = 0; i < s.map.length; i += 1) { const v = Math.max(0, Math.min(1, s.map[i])); sid.data[i * 4] = (1 - v) * 255; sid.data[i * 4 + 1] = v * 200; sid.data[i * 4 + 2] = 60; sid.data[i * 4 + 3] = 255; }
      sx.putImageData(sid, 0, 0);
      const up = document.createElement('canvas'); up.width = w; up.height = h; const ux = up.getContext('2d'); ux.imageSmoothingEnabled = false; ux.drawImage(sc, 0, 0, w, h);
      const toUrl = (imgData) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(imgData, 0, 0); return c.toDataURL('image/png'); };
      if (cancelled) return;
      setRes({ w, h, aUrl: A.c.toDataURL('image/png'), bUrl: B.c.toDataURL('image/png'), diffUrl: toUrl(out), blendUrl: toUrl(blend), ssimUrl: up.toDataURL('image/png'), changed, ssim: s.mean });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [a, b, threshold, aa, align]);

  const sizeTxt = (x) => (x ? `${x.img.naturalWidth}×${x.img.naturalHeight}` : '—');
  const differentSize = a && b && (a.img.naturalWidth !== b.img.naturalWidth || a.img.naturalHeight !== b.img.naturalHeight);
  const pct = res ? (res.changed / (res.w * res.h)) * 100 : 0;

  return (
    <div className="tool-panel image-diff">
      <div className="pt-inputs">
        <Drop label={t.a} url={a?.url} onFile={load(setA)} t={t} />
        <button type="button" className="tool-btn small" onClick={() => { const x = a; setA(b); setB(x); }} title={t.swap}>⇄</button>
        <Drop label={t.b} url={b?.url} onFile={load(setB)} t={t} />
      </div>
      {a && b && <p className="tool-local-note">{t.sizes(sizeTxt(a), sizeTxt(b))}</p>}
      {differentSize && (
        <div className="tool-field">
          <span className="tool-field-label">{t.align}</span>
          <div className="segmented">
            <button type="button" className={align === 'fit' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setAlign('fit')}>{t.fit}</button>
            <button type="button" className={align === 'tl' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setAlign('tl')}>{t.topleft}</button>
          </div>
        </div>
      )}
      {res && (
        <>
          <div className="id-stats">
            <div className="cc-ratio"><span className="cc-ratio-value">{res.changed === 0 ? '0' : pct < 0.01 ? '<0.01' : pct.toFixed(2)}%</span><span className="cc-ratio-label">{t.changed} ({res.changed.toLocaleString()})</span></div>
            <div className="cc-ratio"><span className="cc-ratio-value">{res.ssim.toFixed(4)}</span><span className="cc-ratio-label">{t.ssim} (1 = идентичны)</span></div>
            {res.changed === 0 && <span className="cc-badge ok">✓ {t.identical}</span>}
          </div>
          <div className="tool-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.mode}</span>
              <div className="segmented">
                {[['highlight', t.highlight], ['slider', t.slider], ['onion', t.onion], ['blend', t.diffBlend], ['ssim', t.ssimMap]].map(([id, label]) => (
                  <button key={id} type="button" className={mode === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setMode(id)}>{label}</button>
                ))}
              </div>
            </div>
            {mode === 'highlight' && (
              <>
                <label className="tool-field"><span className="tool-field-label">{t.threshold}: {threshold}</span><input type="range" min="0" max="0.5" step="0.01" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
                <label className="tool-check"><input type="checkbox" checked={aa} onChange={(e) => setAa(e.target.checked)} /> {t.aa}</label>
              </>
            )}
            {mode === 'onion' && <label className="tool-field"><span className="tool-field-label">{t.opacity}: {Math.round(opacity * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>}
          </div>
          <div className="id-view">
            {mode === 'slider' && <CompareSlider before={res.aUrl} after={res.bUrl} language={language} beforeLabel="A" afterLabel="B" />}
            {mode === 'onion' && (
              <div className="id-stack">
                <img src={res.aUrl} alt="" />
                <img src={res.bUrl} alt="" style={{ opacity }} className="id-top" />
              </div>
            )}
            {mode === 'highlight' && <img src={res.diffUrl} alt="" className="id-img" />}
            {mode === 'blend' && <img src={res.blendUrl} alt="" className="id-img" />}
            {mode === 'ssim' && <img src={res.ssimUrl} alt="" className="id-img" />}
          </div>
          {mode === 'highlight' && (
            <div className="tool-actions">
              <a className="tool-btn" href={res.diffUrl} download="diff.png">{t.download}</a>
            </div>
          )}
        </>
      )}
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default ImageDiff;
