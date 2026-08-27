import { useCallback, useEffect, useRef, useState } from 'react';

// CRT / глитч: ретро-эффекты на картинку — скан-линии, RGB-сдвиг (хроматическая
// аберрация), шум, глитч-полосы, виньетка. Живой предпросмотр, экспорт PNG.

const TEXT = {
  ru: { drop: 'Перетащите картинку или нажмите', hint: 'PNG, JPG, WebP — обрабатывается локально', scan: 'Скан-линии', shift: 'RGB-сдвиг', noise: 'Шум', glitch: 'Глитч', vign: 'Виньетка', reroll: 'Перетрясти глитч', change: 'Другое', save: 'Скачать PNG', note: 'Ретро-CRT/глитч. Всё считается локально, файлы не уходят на сервер.' },
  en: { drop: 'Drop an image or click', hint: 'PNG, JPG, WebP — processed locally', scan: 'Scanlines', shift: 'RGB shift', noise: 'Noise', glitch: 'Glitch', vign: 'Vignette', reroll: 'Reshuffle glitch', change: 'Another', save: 'Download PNG', note: 'Retro CRT/glitch. All local, nothing is uploaded.' },
};

function CrtGlitch({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [src, setSrc] = useState('');
  const [scan, setScan] = useState(40);
  const [shift, setShift] = useState(4);
  const [noise, setNoise] = useState(12);
  const [glitch, setGlitch] = useState(20);
  const [vign, setVign] = useState(35);
  const [seed, setSeed] = useState(1);

  const render = useCallback(() => {
    const img = imgRef.current; const canvas = canvasRef.current; if (!img || !canvas) return;
    let w = img.naturalWidth; let h = img.naturalHeight; const cap = 1400; const s = Math.min(1, cap / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
    canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h); const d = id.data; const src2 = new Uint8ClampedArray(d);
    const sh = Math.round(shift); const nz = noise;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const ri = (y * w + Math.min(w - 1, x + sh)) * 4; const bi = (y * w + Math.max(0, x - sh)) * 4;
        d[i] = src2[ri]; d[i + 2] = src2[bi + 2];
        if (nz) { const n = (Math.random() - 0.5) * nz * 2; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        if (scan && y % 3 === 0) { const k = 1 - scan / 100; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
      }
    }
    ctx.putImageData(id, 0, 0);
    // глитч-полосы: случайные горизонтальные срезы сдвигаем
    if (glitch) {
      let sd = seed * 9973; const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
      const bands = Math.round(glitch / 4);
      for (let bIdx = 0; bIdx < bands; bIdx += 1) {
        const by = Math.floor(rnd() * h); const bh = 4 + Math.floor(rnd() * (glitch)); const dx = Math.round((rnd() - 0.5) * glitch * 3);
        const slice = ctx.getImageData(0, by, w, Math.min(bh, h - by));
        ctx.putImageData(slice, dx, by);
      }
    }
    // виньетка
    if (vign) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${vign / 100})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  }, [scan, shift, noise, glitch, vign, seed]);

  useEffect(() => { if (src) render(); }, [src, render]);

  function loadFile(file) { if (!file || !file.type.startsWith('image/')) return; const url = URL.createObjectURL(file); setSrc(url); const img = new Image(); img.onload = () => { imgRef.current = img; render(); }; img.src = url; }
  function save() { canvasRef.current?.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'crt-glitch.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png'); }

  const S = [['scan', scan, setScan, 0, 90], ['shift', shift, setShift, 0, 20], ['noise', noise, setNoise, 0, 60], ['glitch', glitch, setGlitch, 0, 60], ['vign', vign, setVign, 0, 80]];

  return (
    <div className="tool-panel crtglitch">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="iso-layout">
          <div className="iso-stage" style={{ padding: 12, background: '#000' }}><canvas ref={canvasRef} className="grade-canvas" /></div>
          <div className="iso-controls">
            {S.map(([key, v, set, mn, mx]) => (
              <label key={key} className="tool-field"><span className="tool-field-label">{t[key]}: {v}</span><input type="range" min={mn} max={mx} value={v} onChange={(e) => set(Number(e.target.value))} /></label>
            ))}
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
              <button type="button" className="tool-btn" onClick={() => setSeed((v) => v + 1)}>🎲 {t.reroll}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default CrtGlitch;
