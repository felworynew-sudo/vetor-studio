import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeSharpness, heatColor } from '../../utils/sharpness';

// Анализатор размытия: отсеивает смазанные кадры. Несколько метрик
// (дисперсия Лапласиана, Tenengrad, доля высоких частот FFT) и карта резкости
// по зонам. Вердикт — по самой резкой зоне (3% самых резких зон), поэтому портрет
// с размытым фоном не считается браком. Пакетно, локально. Для фотографов.

const TEXT = {
  ru: {
    drop: 'Перетащите фотографии сюда или нажмите', hint: 'Можно много файлов — отсортируем от размытых к резким',
    analyze: 'Проанализировать', sharp: 'Резкое', blurry: 'Размытое', score: 'Резкость зоны фокуса',
    empty: 'Пока нет файлов', clear: 'Очистить', processing: 'Анализ…', threshold: 'Порог', onlyBlurry: 'Только размытые',
    csv: 'Скачать CSV', map: 'Карта резкости', mapHint: 'Синий — размыто, красный — резко. Клик по строке открывает карту.',
    lap: 'Лапласиан (весь кадр)', ten: 'Tenengrad', hf: 'Высокие частоты', peak: 'Зона фокуса (топ-3%)',
    hint2: 'Порог — ориентир; «резкость» зависит от камеры, шума и сюжета. Всё локально.',
  },
  en: {
    drop: 'Drop photos here or click', hint: 'Many files are fine — sorted blurry → sharp',
    analyze: 'Analyze', sharp: 'Sharp', blurry: 'Blurry', score: 'Focus-zone sharpness',
    empty: 'No files yet', clear: 'Clear', processing: 'Analyzing…', threshold: 'Threshold', onlyBlurry: 'Blurry only',
    csv: 'Download CSV', map: 'Sharpness map', mapHint: 'Blue is soft, red is sharp. Click a row to open its map.',
    lap: 'Laplacian (whole frame)', ten: 'Tenengrad', hf: 'High frequencies', peak: 'Focus zone (top 3%)',
    hint2: 'The threshold is a guideline; sharpness depends on camera, noise and scene. All local.',
  },
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

function BlurAnalyzer({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [threshold, setThreshold] = useState(150);
  const [onlyBlurry, setOnlyBlurry] = useState(false);
  const [openId, setOpenId] = useState(null);
  const mapRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setItems((prev) => [...prev, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, name: file.name, r: null }))]);
  }, []);

  async function analyzeAll() {
    setBusy(true); setProgress(0);
    const scored = [];
    for (const item of items) {
      if (item.r) { scored.push(item); setProgress(scored.length); continue; }
      try {
        // eslint-disable-next-line no-await-in-loop
        const { img, url } = await loadImage(item.file);
        // отдаём управление UI между файлами
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, 0));
        scored.push({ ...item, url, r: analyzeSharpness(img) });
      } catch { scored.push({ ...item, r: { error: true } }); }
      setProgress(scored.length);
    }
    scored.sort((a, b) => (a.r?.peak ?? -1) - (b.r?.peak ?? -1)); // размытые сверху
    setItems(scored);
    setBusy(false);
  }

  // Карта: фото + полупрозрачная сетка зон, окрашенных по резкости.
  const open = items.find((i) => i.id === openId);
  useEffect(() => {
    const c = mapRef.current; if (!c || !open?.r || open.r.error) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
      const { map, cols, rows } = open.r; const tw = c.width / cols; const th = c.height / rows;
      x.globalAlpha = 0.45;
      map.forEach((v, i) => { x.fillStyle = heatColor(v); x.fillRect((i % cols) * tw, Math.floor(i / cols) * th, tw + 0.5, th + 0.5); });
      x.globalAlpha = 1; x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 1;
      for (let i = 1; i < cols; i += 1) { x.beginPath(); x.moveTo(i * tw, 0); x.lineTo(i * tw, c.height); x.stroke(); }
      for (let i = 1; i < rows; i += 1) { x.beginPath(); x.moveTo(0, i * th); x.lineTo(c.width, i * th); x.stroke(); }
    };
    img.src = open.url;
  }, [open]);

  function csv() {
    const rows = [['file', 'verdict', 'focus_zone', 'laplacian', 'tenengrad', 'high_freq_pct']];
    items.filter((i) => i.r && !i.r.error).forEach((i) => rows.push([i.name, i.r.peak < threshold ? 'blurry' : 'sharp', Math.round(i.r.peak), Math.round(i.r.laplacian), Math.round(i.r.tenengrad), i.r.hf.toFixed(2)]));
    const text = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv' })); a.download = 'sharpness.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const maxPeak = Math.max(1, ...items.map((i) => i.r?.peak || 0));
  const shown = onlyBlurry ? items.filter((i) => i.r && !i.r.error && i.r.peak < threshold) : items;
  const analyzed = items.some((i) => i.r && !i.r.error);

  return (
    <div className="tool-panel blur-analyzer">
      <button
        type="button"
        className="tool-dropzone"
        onClick={() => document.getElementById('blur-input')?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <span className="tool-dropzone-title">{t.drop}</span>
        <span className="tool-dropzone-hint">{t.hint}</span>
      </button>

      {items.length > 0 && (
        <div className="tool-actions">
          <button type="button" className="tool-btn primary" onClick={analyzeAll} disabled={busy}>{busy ? `${t.processing} ${progress}/${items.length}` : t.analyze}</button>
          {analyzed && <button type="button" className="tool-btn" onClick={csv}>{t.csv}</button>}
          <button type="button" className="tool-btn ghost" onClick={() => { items.forEach((i) => i.url && URL.revokeObjectURL(i.url)); setItems([]); setOpenId(null); }} disabled={busy}>{t.clear}</button>
        </div>
      )}

      {analyzed && (
        <div className="tool-controls">
          <label className="tool-field"><span className="tool-field-label">{t.threshold}: {threshold}</span><input type="range" min="10" max="1000" step="10" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
          <label className="tool-check"><input type="checkbox" checked={onlyBlurry} onChange={(e) => setOnlyBlurry(e.target.checked)} /> {t.onlyBlurry}</label>
          <span className="tool-field-label">{t.mapHint}</span>
        </div>
      )}

      <ul className="convert-list">
        {items.length === 0 && <li className="convert-empty">{t.empty}</li>}
        {shown.map((item) => {
          const r = item.r; const ok = r && !r.error;
          return (
            <li key={item.id} className={`convert-row ba-row${item.id === openId ? ' is-open' : ''}`} onClick={() => ok && setOpenId(item.id === openId ? null : item.id)}>
              {item.url ? <img className="ba-thumb" src={item.url} alt="" /> : <span />}
              <span className="convert-name" title={item.name}>{item.name}</span>
              {ok && (
                <span className={r.peak < threshold ? 'cc-badge fail ba-badge' : 'cc-badge ok ba-badge'}>
                  {r.peak < threshold ? `⚠ ${t.blurry}` : `✓ ${t.sharp}`}
                </span>
              )}
              {ok && (
                <span className="ba-metrics" title={`${t.lap}: ${Math.round(r.laplacian)} · ${t.ten}: ${Math.round(r.tenengrad)} · ${t.hf}: ${r.hf.toFixed(1)}%`}>
                  <span className="ba-bar"><span style={{ width: `${(r.peak / maxPeak) * 100}%`, background: heatColor(r.peak) }} /></span>
                  <span className="convert-sizes">{Math.round(r.peak)}</span>
                </span>
              )}
              {item.id === openId && ok && (
                <div className="ba-detail" onClick={(e) => e.stopPropagation()}>
                  <canvas ref={mapRef} className="ba-map" />
                  <dl className="ba-dl">
                    <dt>{t.peak}</dt><dd>{Math.round(r.peak)}</dd>
                    <dt>{t.lap}</dt><dd>{Math.round(r.laplacian)}</dd>
                    <dt>{t.ten}</dt><dd>{Math.round(r.tenengrad)}</dd>
                    <dt>{t.hf}</dt><dd>{r.hf.toFixed(1)}%</dd>
                  </dl>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <input id="blur-input" type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <p className="tool-local-note">📷 {t.hint2}</p>
    </div>
  );
}

export default BlurAnalyzer;
