import { useCallback, useEffect, useRef, useState } from 'react';

// Генератор mesh-градиентов: несколько цветовых точек сливаются в мягкий
// многоцветный фон (модный «meш-градиент»). Реролл, число точек, экспорт CSS и
// PNG. Локально.

const TEXT = {
  ru: { points: 'Точек', reroll: 'Другой', copy: 'Копировать CSS', copied: 'Скопировано', save: 'Скачать PNG', note: 'Модный многоцветный фон. CSS работает во всех современных браузерах; PNG — готовая картинка.' },
  en: { points: 'Points', reroll: 'Reroll', copy: 'Copy CSS', copied: 'Copied', save: 'Download PNG', note: 'A trendy multicolor background. CSS works in all modern browsers; PNG is a ready image.' },
};

const rand = (a, b) => a + Math.random() * (b - a);
function makePoints(n) {
  const baseHue = Math.random() * 360;
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(rand(5, 95)), y: Math.round(rand(5, 95)),
    h: Math.round((baseHue + i * (360 / n) + rand(-25, 25)) % 360), s: Math.round(rand(65, 90)), l: Math.round(rand(45, 65)),
  }));
}
const hsl = (p) => `hsl(${p.h}, ${p.s}%, ${p.l}%)`;

function MeshGradient({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const canvasRef = useRef(null);
  const [count, setCount] = useState(4);
  const [pts, setPts] = useState(() => makePoints(4));
  const [copied, setCopied] = useState(false);

  const cssBg = `${hsl(pts[0])}`;
  const layers = pts.map((p) => `radial-gradient(at ${p.x}% ${p.y}%, ${hsl(p)} 0px, transparent 55%)`).join(',\n  ');
  const css = `background-color: ${cssBg};\nbackground-image:\n  ${layers};`;
  const styleBg = { backgroundColor: cssBg, backgroundImage: pts.map((p) => `radial-gradient(at ${p.x}% ${p.y}%, ${hsl(p)} 0px, transparent 55%)`).join(', ') };

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return; const W = 800; const H = 600; c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.fillStyle = cssBg; ctx.fillRect(0, 0, W, H);
    pts.forEach((p) => {
      const g = ctx.createRadialGradient(p.x / 100 * W, p.y / 100 * H, 0, p.x / 100 * W, p.y / 100 * H, Math.max(W, H) * 0.55);
      g.addColorStop(0, hsl(p)); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
  }, [pts]);

  useEffect(() => { draw(); }, [draw]);

  function reroll() { setPts(makePoints(count)); }
  function setN(n) { setCount(n); setPts(makePoints(n)); }
  function copy() { navigator.clipboard?.writeText(css).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }); }
  function save() { canvasRef.current?.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mesh-gradient.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'image/png'); }

  return (
    <div className="tool-panel meshgrad">
      <div className="iso-layout">
        <div className="iso-stage mesh-stage" style={styleBg} />
        <div className="iso-controls">
          <label className="tool-field"><span className="tool-field-label">{t.points}: {count}</span><input type="range" min="2" max="7" value={count} onChange={(e) => setN(Number(e.target.value))} /></label>
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={reroll}>🎲 {t.reroll}</button>
            <button type="button" className="tool-btn" onClick={save}>{t.save}</button>
            <button type="button" className="tool-btn" onClick={copy}>{copied ? `✓ ${t.copied}` : t.copy}</button>
          </div>
          <canvas ref={canvasRef} hidden />
        </div>
      </div>
      <pre className="bs-code"><code>{css}</code></pre>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default MeshGradient;
