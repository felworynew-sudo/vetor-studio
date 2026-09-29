import { useEffect, useRef, useState } from 'react';
import { createWarp } from '../../utils/warpGL';

// Мокапы устройств: скриншот → смартфон, Android, планшет, ноутбук, окно браузера
// или монитор. Рамки рисуются кодом (никаких чужих фото-ассетов), фон — цвет,
// градиент или прозрачный, мягкая тень, 3D-наклон (перспектива через WebGL),
// заголовок и подпись. Экспорт PNG в размерах для сторов, соцсетей и презентаций.

const DEVICES = {
  iphone: { ru: 'Смартфон', en: 'Phone', sw: 1179, sh: 2556, bezel: 44, radius: 170, sr: 128, island: true },
  android: { ru: 'Android', en: 'Android', sw: 1080, sh: 2400, bezel: 40, radius: 110, sr: 80, punch: true },
  tablet: { ru: 'Планшет', en: 'Tablet', sw: 2048, sh: 2732, bezel: 90, radius: 120, sr: 50 },
  laptop: { ru: 'Ноутбук', en: 'Laptop', sw: 2560, sh: 1600, bezel: 70, radius: 60, sr: 18, base: true },
  browser: { ru: 'Окно браузера', en: 'Browser window', sw: 1920, sh: 1080, bezel: 0, radius: 24, sr: 0, browser: true },
  monitor: { ru: 'Монитор', en: 'Monitor', sw: 2560, sh: 1440, bezel: 50, radius: 30, sr: 6, stand: true },
};
const FRAMES = { graphite: ['#1c1c1f', '#3a3a3f'], silver: ['#d7d8dc', '#f3f3f5'], white: ['#f7f7f7', '#ffffff'], blue: ['#27344c', '#3d4f70'] };
const SIZES = [
  { id: 'auto', label: 'Авто', en: 'Auto' }, { id: 'sq', label: '1080×1080', w: 1080, h: 1080 }, { id: 'pt', label: '1080×1350', w: 1080, h: 1350 },
  { id: 'wide', label: '1920×1080', w: 1920, h: 1080 }, { id: 'store', label: 'App Store 1290×2796', w: 1290, h: 2796 }, { id: 'play', label: 'Google Play 1080×1920', w: 1080, h: 1920 },
];

const TEXT = {
  ru: {
    drop: 'Загрузите скриншот', hint: 'PNG, JPG, WebP — всё локально', device: 'Устройство', frame: 'Цвет корпуса', bg: 'Фон', solid: 'Цвет', gradient: 'Градиент', transparent: 'Прозрачный',
    fitM: 'Скриншот', cover: 'Заполнить', contain: 'Целиком', shadow: 'Тень', tiltY: 'Поворот', tiltX: 'Наклон', scale: 'Размер устройства', size: 'Холст',
    title: 'Заголовок', subtitle: 'Подпись', titlePh: 'Всё под рукой', subPh: 'Короткое описание функции', textColor: 'Цвет текста', url: 'Адрес в браузере',
    download: 'Скачать PNG', change: 'Другой скриншот', dark: 'Тёмная тема окна',
    note: 'Рамки нарисованы программно — это не фотографии реальных устройств, их можно свободно использовать в презентациях и сторах.',
  },
  en: {
    drop: 'Upload a screenshot', hint: 'PNG, JPG, WebP — all local', device: 'Device', frame: 'Frame color', bg: 'Background', solid: 'Solid', gradient: 'Gradient', transparent: 'Transparent',
    fitM: 'Screenshot', cover: 'Cover', contain: 'Contain', shadow: 'Shadow', tiltY: 'Turn', tiltX: 'Tilt', scale: 'Device size', size: 'Canvas',
    title: 'Title', subtitle: 'Subtitle', titlePh: 'Everything at hand', subPh: 'A short feature description', textColor: 'Text color', url: 'Browser URL',
    download: 'Download PNG', change: 'Another screenshot', dark: 'Dark window theme',
    note: 'Frames are drawn in code — they are not photos of real devices, so you can use them freely in decks and store listings.',
  },
};

function rr(x, px, py, w, h, r) { x.beginPath(); x.roundRect ? x.roundRect(px, py, w, h, r) : x.rect(px, py, w, h); }

// Рисует устройство с экраном в отдельный canvas (прозрачный фон).
function drawDevice(dev, frame, shot, fit, opts) {
  const b = dev.bezel; const W = dev.sw + b * 2; const topBar = dev.browser ? 110 : 0;
  const baseH = dev.base ? 110 : dev.stand ? 360 : 0;
  const H = dev.sh + b * 2 + topBar + baseH;
  const c = document.createElement('canvas'); c.width = dev.base ? Math.round(W * 1.16) : W; c.height = H;
  const x = c.getContext('2d');
  const ox = (c.width - W) / 2;
  const [f1, f2] = FRAMES[frame];
  // Корпус.
  if (!dev.browser) {
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, f2); g.addColorStop(1, f1);
    x.fillStyle = g; rr(x, ox, 0, W, dev.sh + b * 2, dev.radius); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 3; x.stroke();
  } else {
    x.fillStyle = opts.dark ? '#26272b' : '#ececef'; rr(x, 0, 0, W, dev.sh + topBar, dev.radius); x.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(48 + i * 42, topBar / 2, 13, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = opts.dark ? '#3a3b40' : '#ffffff'; rr(x, 200, topBar / 2 - 26, W - 400, 52, 26); x.fill();
    x.fillStyle = opts.dark ? '#c8c8cc' : '#55565c'; x.font = '500 26px system-ui, sans-serif'; x.textBaseline = 'middle';
    x.fillText(`🔒 ${opts.url || 'vetor-studio.ru'}`, 232, topBar / 2 + 1);
  }
  // Экран со скриншотом.
  const sx = ox + b; const sy = b + topBar;
  x.save(); rr(x, sx, sy, dev.sw, dev.sh, dev.browser ? [0, 0, dev.radius, dev.radius] : dev.sr); x.clip();
  x.fillStyle = '#000'; x.fillRect(sx, sy, dev.sw, dev.sh);
  if (shot) {
    const s = fit === 'cover' ? Math.max(dev.sw / shot.naturalWidth, dev.sh / shot.naturalHeight) : Math.min(dev.sw / shot.naturalWidth, dev.sh / shot.naturalHeight);
    const w = shot.naturalWidth * s; const h = shot.naturalHeight * s;
    x.imageSmoothingQuality = 'high';
    x.drawImage(shot, sx + (dev.sw - w) / 2, sy + (fit === 'cover' ? 0 : (dev.sh - h) / 2), w, h);
  }
  x.restore();
  if (dev.island) { x.fillStyle = '#000'; rr(x, ox + W / 2 - 190, b + 36, 380, 110, 55); x.fill(); }
  if (dev.punch) { x.fillStyle = '#000'; x.beginPath(); x.arc(ox + W / 2, b + 60, 30, 0, Math.PI * 2); x.fill(); }
  if (dev.base) {
    const by = dev.sh + b * 2;
    const g = x.createLinearGradient(0, by, 0, by + baseH); g.addColorStop(0, f2); g.addColorStop(1, f1);
    x.fillStyle = g; x.beginPath(); x.moveTo(0, by); x.lineTo(c.width, by); x.lineTo(c.width - 60, by + baseH); x.lineTo(60, by + baseH); x.closePath(); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.25)'; rr(x, c.width / 2 - 200, by, 400, 26, [0, 0, 20, 20]); x.fill();
  }
  if (dev.stand) {
    const by = dev.sh + b * 2;
    x.fillStyle = f1; x.fillRect(c.width / 2 - 90, by, 180, baseH - 50);
    rr(x, c.width / 2 - 420, H - 60, 840, 60, 24); x.fill();
  }
  return c;
}

function MockupDevice({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const previewRef = useRef(null);
  const [shot, setShot] = useState(null);
  const [device, setDevice] = useState('iphone');
  const [frame, setFrame] = useState('graphite');
  const [fit, setFit] = useState('cover');
  const [bgMode, setBgMode] = useState('gradient');
  const [bg1, setBg1] = useState('#6166ff');
  const [bg2, setBg2] = useState('#ff8bd0');
  const [shadow, setShadow] = useState(0.5);
  const [tiltY, setTiltY] = useState(0);
  const [tiltX, setTiltX] = useState(0);
  const [scale, setScale] = useState(0.9);
  const [sizeId, setSizeId] = useState('sq');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [url, setUrl] = useState('vetor-studio.ru');
  const [dark, setDark] = useState(false);

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const u = URL.createObjectURL(file); const img = new Image(); img.onload = () => setShot(img); img.src = u;
  }

  function compose() {
    const dev = DEVICES[device];
    const devCanvas = drawDevice(dev, frame, shot, fit, { url, dark });
    const size = SIZES.find((s) => s.id === sizeId);
    const pad = 0.08;
    const hasText = title || subtitle;
    let W; let H;
    if (size.w) { W = size.w; H = size.h; } else { W = Math.round(devCanvas.width * 1.3); H = Math.round(devCanvas.height * (hasText ? 1.45 : 1.3)); }
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const x = out.getContext('2d');
    if (bgMode === 'solid') { x.fillStyle = bg1; x.fillRect(0, 0, W, H); }
    if (bgMode === 'gradient') { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, bg1); g.addColorStop(1, bg2); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    // Текст сверху.
    let top = H * pad;
    if (hasText) {
      x.fillStyle = textColor; x.textAlign = 'center'; x.textBaseline = 'top';
      const ts = Math.round(Math.min(W, H) * 0.065);
      if (title) { x.font = `800 ${ts}px system-ui, -apple-system, sans-serif`; x.fillText(title, W / 2, top, W * 0.9); top += ts * 1.25; }
      if (subtitle) { x.globalAlpha = 0.8; x.font = `500 ${Math.round(ts * 0.52)}px system-ui, sans-serif`; x.fillText(subtitle, W / 2, top, W * 0.9); x.globalAlpha = 1; top += ts * 0.8; }
      top += H * 0.03;
    }
    // Место под устройство.
    const areaW = W * (1 - pad * 2); const areaH = H - top - H * pad;
    // scale — доля доступного места, которую занимает устройство.
    const k = Math.min(areaW / devCanvas.width, areaH / devCanvas.height) * scale;
    const dw = devCanvas.width * k; const dh = devCanvas.height * k;
    const cx = W / 2; const cy = top + areaH / 2;
    // Углы с 3D-наклоном: поворачиваем прямоугольник вокруг центра и проецируем.
    const ry = (tiltY * Math.PI) / 180; const rx = (tiltX * Math.PI) / 180; const f = Math.max(dw, dh) * 2.2;
    const corners = [[-dw / 2, -dh / 2], [dw / 2, -dh / 2], [dw / 2, dh / 2], [-dw / 2, dh / 2]].map(([px, py]) => {
      let X = px * Math.cos(ry); let Z = px * Math.sin(ry);
      const Y = py * Math.cos(rx) - Z * Math.sin(rx); Z = py * Math.sin(rx) + Z * Math.cos(rx);
      const s = f / (f + Z); return [cx + X * s, cy + Y * s];
    });
    if (shadow > 0) {
      x.save(); x.shadowColor = `rgba(0,0,0,${0.55 * shadow})`; x.shadowBlur = Math.max(dw, dh) * 0.08; x.shadowOffsetY = dh * 0.03;
      x.fillStyle = 'rgba(0,0,0,0.01)'; x.beginPath(); corners.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
      x.fillStyle = `rgba(0,0,0,${0.2 * shadow})`; x.fill(); x.restore();
    }
    if (!tiltX && !tiltY) {
      x.drawImage(devCanvas, cx - dw / 2, cy - dh / 2, dw, dh);
      return out;
    }
    const gl = document.createElement('canvas'); gl.width = W; gl.height = H;
    const w = createWarp(gl);
    if (!w) { x.drawImage(devCanvas, cx - dw / 2, cy - dh / 2, dw, dh); return out; }
    w.setScene(out); w.setDesign(devCanvas); w.render(corners, { mode: 0, fit: 'stretch' });
    const fin = document.createElement('canvas'); fin.width = W; fin.height = H;
    fin.getContext('2d').drawImage(gl, 0, 0); w.dispose();
    return fin;
  }

  useEffect(() => {
    if (!shot) return undefined;
    const timer = setTimeout(() => {
      const c = compose(); const p = previewRef.current; if (!p) return;
      const k = Math.min(1, 900 / Math.max(c.width, c.height));
      p.width = Math.round(c.width * k); p.height = Math.round(c.height * k);
      const x = p.getContext('2d'); x.clearRect(0, 0, p.width, p.height); x.drawImage(c, 0, 0, p.width, p.height);
    }, 80);
    return () => clearTimeout(timer);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function download() {
    compose().toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `mockup-${device}.png`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }

  const seg = (value, set, items) => <div className="segmented dm-seg">{items.map(([id, l]) => <button key={id} type="button" className={value === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set(id)}>{l}</button>)}</div>;
  const range = (label, value, set, min, max, step = 1, fmt = (v) => v) => (
    <label className="tool-field"><span className="tool-field-label">{label}: {fmt(value)}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} /></label>
  );

  return (
    <div className="tool-panel device-mockup">
      {!shot ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            <div className="dm-preview"><canvas ref={previewRef} /></div>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={download}>{t.download}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="tool-field"><span className="tool-field-label">{t.device}</span>{seg(device, setDevice, Object.entries(DEVICES).map(([id, d]) => [id, d[language] || d.ru]))}</div>
            {device !== 'browser' && <div className="tool-field"><span className="tool-field-label">{t.frame}</span>
              <div className="dm-frames">{Object.entries(FRAMES).map(([id, [a, b]]) => <button key={id} type="button" className={frame === id ? 'dm-frame is-active' : 'dm-frame'} style={{ background: `linear-gradient(135deg, ${b}, ${a})` }} onClick={() => setFrame(id)} title={id} />)}</div>
            </div>}
            {device === 'browser' && (
              <>
                <label className="tool-field"><span className="tool-field-label">{t.url}</span><input className="dm-input" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
                <label className="tool-check"><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> {t.dark}</label>
              </>
            )}
            <div className="tool-field"><span className="tool-field-label">{t.fitM}</span>{seg(fit, setFit, [['cover', t.cover], ['contain', t.contain]])}</div>
            <div className="tool-field"><span className="tool-field-label">{t.bg}</span>{seg(bgMode, setBgMode, [['gradient', t.gradient], ['solid', t.solid], ['transparent', t.transparent]])}
              {bgMode !== 'transparent' && <span className="mg-color-row"><input type="color" value={bg1} onChange={(e) => setBg1(e.target.value)} />{bgMode === 'gradient' && <input type="color" value={bg2} onChange={(e) => setBg2(e.target.value)} />}</span>}
            </div>
            <div className="tool-field"><span className="tool-field-label">{t.size}</span>{seg(sizeId, setSizeId, SIZES.map((s) => [s.id, language === 'en' && s.en ? s.en : s.label]))}</div>
            {range(t.scale, scale, setScale, 0.4, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {range(t.shadow, shadow, setShadow, 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            {range(t.tiltY, tiltY, setTiltY, -35, 35, 1, (v) => `${v}°`)}
            {range(t.tiltX, tiltX, setTiltX, -30, 30, 1, (v) => `${v}°`)}
            <label className="tool-field"><span className="tool-field-label">{t.title}</span><input className="dm-input" value={title} placeholder={t.titlePh} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="tool-field"><span className="tool-field-label">{t.subtitle}</span><input className="dm-input" value={subtitle} placeholder={t.subPh} onChange={(e) => setSubtitle(e.target.value)} /></label>
            {(title || subtitle) && <label className="tool-field"><span className="tool-field-label">{t.textColor}</span><input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></label>}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">ℹ️ {t.note}</p>
    </div>
  );
}

export default MockupDevice;
