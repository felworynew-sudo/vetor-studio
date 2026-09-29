import { useEffect, useRef, useState } from 'react';
import { decodeAudioFile, downloadBlob } from '../../utils/wav';
import { getPeaks } from '../../utils/audioPeaks';

// Картинка волны из аудио: столбики, зеркало, линия или точки; цвет или градиент,
// скругления, прозрачный фон. Экспорт PNG (для обложек, постов, мерча) и SVG
// (вектор для печати и вёрстки). Всё локально.

const TEXT = {
  ru: {
    drop: 'Загрузите трек, подкаст или голосовое', hint: 'MP3, WAV, M4A, OGG — всё локально', style: 'Стиль', bars: 'Столбики', mirror: 'Зеркало', line: 'Линия', dots: 'Точки',
    count: 'Столбиков', gap: 'Зазор', radius: 'Скругление', color1: 'Цвет', color2: 'Градиент до', bg: 'Фон', transparent: 'Прозрачный', size: 'Размер',
    png: 'Скачать PNG', svg: 'Скачать SVG', change: 'Другой файл', normalize: 'Нормализовать высоту',
    note: 'SVG — векторный: его можно масштабировать для печати на мерче без потери качества.',
  },
  en: {
    drop: 'Upload a track, podcast or voice note', hint: 'MP3, WAV, M4A, OGG — all local', style: 'Style', bars: 'Bars', mirror: 'Mirror', line: 'Line', dots: 'Dots',
    count: 'Bars', gap: 'Gap', radius: 'Rounding', color1: 'Color', color2: 'Gradient to', bg: 'Background', transparent: 'Transparent', size: 'Size',
    png: 'Download PNG', svg: 'Download SVG', change: 'Another file', normalize: 'Normalize height',
    note: 'SVG is vector: scale it for merch printing without quality loss.',
  },
};

const SIZES = [[1920, 400], [1200, 630], [1080, 1080], [3000, 600]];

function amplitudes(buf, n, normalize) {
  const p = getPeaks(buf); const per = p.max.length / n; const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let m = 0; for (let k = Math.floor(i * per); k < Math.max(Math.floor(i * per) + 1, Math.floor((i + 1) * per)); k += 1) m = Math.max(m, p.max[k] || 0, -(p.min[k] || 0));
    out[i] = m;
  }
  const mx = normalize ? Math.max(...out, 1e-6) : 1;
  return out.map((v) => Math.min(1, v / mx));
}

function shapes(amps, o, W, H) {
  const n = amps.length; const pad = H * 0.08; const step = W / n; const bw = Math.max(1, step * (1 - o.gap));
  const list = [];
  if (o.style === 'line') {
    const pts = Array.from(amps).map((a, i) => [i * step + step / 2, H / 2 - a * (H / 2 - pad)]);
    const back = Array.from(amps).map((a, i) => [i * step + step / 2, H / 2 + a * (H / 2 - pad)]).reverse();
    list.push({ type: 'path', d: `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L')}L${back.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L')}Z` });
    return list;
  }
  amps.forEach((a, i) => {
    const x = i * step + (step - bw) / 2;
    if (o.style === 'dots') {
      const r = bw / 2; const cnt = Math.max(1, Math.round((a * (H - pad * 2)) / (bw * 1.3)));
      for (let k = 0; k < cnt; k += 1) list.push({ type: 'circle', cx: x + r, cy: H - pad - r - k * bw * 1.3, r });
    } else if (o.style === 'mirror') {
      const h = Math.max(bw, a * (H - pad * 2)); list.push({ type: 'rect', x, y: H / 2 - h / 2, w: bw, h });
    } else {
      const h = Math.max(bw, a * (H - pad * 2)); list.push({ type: 'rect', x, y: H - pad - h, w: bw, h });
    }
  });
  return list;
}

function WaveformImage({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null); const canvasRef = useRef(null);
  const [buf, setBuf] = useState(null);
  const [name, setName] = useState('waveform');
  const [o, setO] = useState({ style: 'bars', count: 120, gap: 0.35, radius: 1, color1: '#6166ff', color2: '#ff8bd0', bg: '#0f1016', transparent: false, size: 0, normalize: true });
  const set = (k, v) => setO((p) => ({ ...p, [k]: v }));
  const [W, H] = SIZES[o.size];

  async function load(f) { if (!f) return; setName(f.name.replace(/\.[^.]+$/, '')); setBuf(await decodeAudioFile(f)); }

  function draw(ctx) {
    const amps = amplitudes(buf, o.style === 'line' ? Math.min(600, o.count * 3) : o.count, o.normalize);
    ctx.clearRect(0, 0, W, H);
    if (!o.transparent) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H); }
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, o.color1); g.addColorStop(1, o.color2);
    ctx.fillStyle = g;
    shapes(amps, o, W, H).forEach((s) => {
      ctx.beginPath();
      if (s.type === 'rect') { if (ctx.roundRect) ctx.roundRect(s.x, s.y, s.w, s.h, Math.min(s.w / 2, s.h / 2) * o.radius); else ctx.rect(s.x, s.y, s.w, s.h); }
      else if (s.type === 'circle') ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      else { const p = new Path2D(s.d); ctx.fill(p); return; }
      ctx.fill();
    });
  }

  useEffect(() => {
    if (!buf || !canvasRef.current) return;
    const c = canvasRef.current; c.width = W; c.height = H; draw(c.getContext('2d'));
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function svg() {
    const amps = amplitudes(buf, o.style === 'line' ? Math.min(600, o.count * 3) : o.count, o.normalize);
    const body = shapes(amps, o, W, H).map((s) => {
      if (s.type === 'rect') { const r = (Math.min(s.w / 2, s.h / 2) * o.radius).toFixed(1); return `<rect x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}" width="${s.w.toFixed(1)}" height="${s.h.toFixed(1)}" rx="${r}"/>`; }
      if (s.type === 'circle') return `<circle cx="${s.cx.toFixed(1)}" cy="${s.cy.toFixed(1)}" r="${s.r.toFixed(1)}"/>`;
      return `<path d="${s.d}"/>`;
    }).join('');
    const bg = o.transparent ? '' : `<rect width="${W}" height="${H}" fill="${o.bg}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${o.color1}"/><stop offset="1" stop-color="${o.color2}"/></linearGradient></defs>${bg}<g fill="url(#g)">${body}</g></svg>`;
  }

  const seg = (k, list) => <div className="segmented dm-seg">{list.map(([id, l]) => <button key={id} type="button" className={o[k] === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(k, id)}>{l}</button>)}</div>;
  const range = (label, k, min, max, step, fmt = (v) => v) => <label className="tool-field"><span className="tool-field-label">{label}: {fmt(o[k])}</span><input type="range" min={min} max={max} step={step} value={o[k]} onChange={(e) => set(k, Number(e.target.value))} /></label>;

  return (
    <div className="tool-panel waveform-image">
      {!buf ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            <div className="dm-preview"><canvas ref={canvasRef} className="wi-canvas" /></div>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={() => canvasRef.current.toBlob((b) => downloadBlob(b, `${name}-wave.png`), 'image/png')}>{t.png}</button>
              <button type="button" className="tool-btn" onClick={() => downloadBlob(new Blob([svg()], { type: 'image/svg+xml' }), `${name}-wave.svg`)}>{t.svg}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="tool-field"><span className="tool-field-label">{t.style}</span>{seg('style', [['bars', t.bars], ['mirror', t.mirror], ['line', t.line], ['dots', t.dots]])}</div>
            <div className="tool-field"><span className="tool-field-label">{t.size}</span>{seg('size', SIZES.map(([w, h], i) => [i, `${w}×${h}`]))}</div>
            {o.style !== 'line' && range(t.count, 'count', 20, 400, 1)}
            {o.style !== 'line' && range(t.gap, 'gap', 0, 0.8, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {(o.style === 'bars' || o.style === 'mirror') && range(t.radius, 'radius', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            <div className="mg-row">
              <label className="tool-field"><span className="tool-field-label">{t.color1}</span><input type="color" value={o.color1} onChange={(e) => set('color1', e.target.value)} /></label>
              <label className="tool-field"><span className="tool-field-label">{t.color2}</span><input type="color" value={o.color2} onChange={(e) => set('color2', e.target.value)} /></label>
              {!o.transparent && <label className="tool-field"><span className="tool-field-label">{t.bg}</span><input type="color" value={o.bg} onChange={(e) => set('bg', e.target.value)} /></label>}
            </div>
            <label className="tool-check"><input type="checkbox" checked={o.transparent} onChange={(e) => set('transparent', e.target.checked)} /> {t.transparent}</label>
            <label className="tool-check"><input type="checkbox" checked={o.normalize} onChange={(e) => set('normalize', e.target.checked)} /> {t.normalize}</label>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default WaveformImage;
