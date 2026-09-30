import { useState } from 'react';
import { exportMesh } from '../../../utils/export3d';

// Панель экспорта 3D-модели: ширина в мм + GLB / STL / OBJ.
const TEXT = {
  ru: { title: 'Экспорт модели', width: 'Ширина, мм', hint: 'GLB — для веба, Blender, AR; STL — для 3D-печати (лежит на столе); OBJ — универсальный, с цветами вершин.' },
  en: { title: 'Export model', width: 'Width, mm', hint: 'GLB for web, Blender, AR; STL for 3D printing (lies flat); OBJ is universal, with vertex colors.' },
};

export default function Export3DPanel({ language = 'ru', getMesh, baseName = 'model' }) {
  const t = TEXT[language] || TEXT.ru;
  const [width, setWidth] = useState(100);
  const [busy, setBusy] = useState('');
  async function run(fmt) {
    const mesh = getMesh(); if (!mesh) return;
    setBusy(fmt);
    try { await exportMesh(mesh, fmt, Math.max(1, width), baseName); } finally { setBusy(''); }
  }
  return (
    <div className="tool-field">
      <span className="tool-field-label">{t.title}</span>
      <div className="tool-actions">
        <label className="tool-field"><span className="tool-field-label">{t.width}</span><input type="number" className="wm-text-input" style={{ width: 90 }} min="1" max="5000" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
        {['glb', 'stl', 'obj'].map((f) => <button key={f} type="button" className="tool-btn small" disabled={!!busy} onClick={() => run(f)}>{busy === f ? '…' : f.toUpperCase()}</button>)}
      </div>
      <span className="tool-field-label">{t.hint}</span>
    </div>
  );
}
