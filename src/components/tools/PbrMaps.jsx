import { useEffect, useRef, useState } from 'react';
import { computeMaps } from '../../utils/pbrMaps';

// Генератор PBR-карт: фото поверхности → Normal, Height (displacement), AO и
// Roughness + живой 3D-превью на three.js (плоскость, сфера или куб со светом,
// который можно крутить). Экспорт каждой карты PNG или ZIP. Всё локально.

const TEXT = {
  ru: {
    drop: 'Загрузите фото поверхности', hint: 'Лучше бесшовную фактуру: камень, кирпич, дерево, ткань, кожа',
    height: 'Высота', invert: 'Инвертировать (светлое — углубления)', smooth: 'Сглаживание', contrast: 'Контраст высоты', large: 'Крупный рельеф',
    normal: 'Нормали', strength: 'Сила нормалей', directx: 'DirectX (Y−) — для Unreal; выкл — OpenGL (Unity, Blender, three.js)',
    ao: 'Ambient Occlusion', aoStrength: 'Сила AO', aoRadius: 'Радиус AO', rough: 'Шероховатость', roughBase: 'База', roughVar: 'Вариация', roughInvert: 'Светлое — шероховатее',
    shape: 'Форма', plane: 'Плоскость', sphere: 'Сфера', cube: 'Куб', disp: 'Выдавливание', size: 'Размер карт', zip: 'Скачать всё (ZIP)', change: 'Другое фото',
    maps: { base: 'Цвет', normal: 'Normal', height: 'Height', ao: 'AO', rough: 'Roughness' },
    note: 'Крутите 3D-превью мышью. Карты подходят для Blender, Unity, Unreal, three.js, Substance. Всё считается в браузере.',
  },
  en: {
    drop: 'Upload a surface photo', hint: 'A seamless texture works best: stone, brick, wood, fabric, leather',
    height: 'Height', invert: 'Invert (light = recesses)', smooth: 'Smoothing', contrast: 'Height contrast', large: 'Large-scale relief',
    normal: 'Normals', strength: 'Normal strength', directx: 'DirectX (Y−) — for Unreal; off — OpenGL (Unity, Blender, three.js)',
    ao: 'Ambient Occlusion', aoStrength: 'AO strength', aoRadius: 'AO radius', rough: 'Roughness', roughBase: 'Base', roughVar: 'Variation', roughInvert: 'Light = rougher',
    shape: 'Shape', plane: 'Plane', sphere: 'Sphere', cube: 'Cube', disp: 'Displacement', size: 'Map size', zip: 'Download all (ZIP)', change: 'Another photo',
    maps: { base: 'Color', normal: 'Normal', height: 'Height', ao: 'AO', rough: 'Roughness' },
    note: 'Rotate the 3D preview with the mouse. The maps work in Blender, Unity, Unreal, three.js, Substance. Everything runs in the browser.',
  },
};

const DEFAULTS = { invert: false, smooth: 1, contrast: 1, largeScale: 0.4, strength: 3, directx: false, aoStrength: 1, aoRadius: 0.01, roughBase: 0.7, roughVar: 0.4, roughInvert: false };

const toCanvas = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c; };

function PbrMaps({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const [src, setSrc] = useState('');
  const [name, setName] = useState('texture');
  const [o, setO] = useState(DEFAULTS);
  const [shape, setShape] = useState('plane');
  const [disp, setDisp] = useState(0.06);
  const [size, setSize] = useState(1024);
  const [maps, setMaps] = useState(null); // canvases
  const set = (k, v) => setO((p) => ({ ...p, [k]: v }));

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setName(file.name.replace(/\.[^.]+$/, ''));
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { imgRef.current = img; setSrc((p) => { if (p) URL.revokeObjectURL(p); return url; }); }; img.src = url;
  }

  // Расчёт карт.
  useEffect(() => {
    const img = imgRef.current; if (!img || !src) return undefined;
    const timer = setTimeout(() => {
      const k = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
      const m = computeMaps(x.getImageData(0, 0, c.width, c.height), o);
      setMaps({ base: c, normal: toCanvas(m.normal), height: toCanvas(m.height), ao: toCanvas(m.ao), rough: toCanvas(m.rough) });
    }, 200);
    return () => clearTimeout(timer);
  }, [src, o, size]);

  // Сцена three.js (создаётся один раз, когда есть куда монтировать).
  useEffect(() => {
    if (!src || !mountRef.current || threeRef.current) return undefined;
    let disposed = false; let raf = 0;
    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;
      const el = mountRef.current; const W = el.clientWidth; const H = Math.round(W * 0.7);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(W, H);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100); camera.position.set(0, 0.9, 2.2);
      const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const light = new THREE.PointLight(0xffffff, 6, 10); scene.add(light);
      const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(2, 3, 2); scene.add(dir);
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6, 256, 256), material);
      mesh.rotation.x = -Math.PI / 2.6; scene.add(mesh);
      const t0 = performance.now();
      const loop = () => {
        const tt = (performance.now() - t0) / 1000;
        light.position.set(Math.cos(tt * 0.8) * 1.2, 0.9, Math.sin(tt * 0.8) * 1.2);
        controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
      };
      loop();
      threeRef.current = { THREE, renderer, scene, mesh, material, dispose: () => { cancelAnimationFrame(raf); renderer.dispose(); el.innerHTML = ''; } };
      setMaps((m) => (m ? { ...m } : m)); // перерисовать с картами
    })();
    return () => { disposed = true; threeRef.current?.dispose(); threeRef.current = null; };
  }, [src]);

  // Обновление материала и формы.
  useEffect(() => {
    const th = threeRef.current; if (!th || !maps) return;
    const { THREE, material, mesh } = th;
    const tex = (c, color) => { const tx = new THREE.CanvasTexture(c); tx.wrapS = THREE.RepeatWrapping; tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; tx.anisotropy = 4; return tx; };
    ['map', 'normalMap', 'aoMap', 'roughnessMap', 'displacementMap'].forEach((k) => material[k]?.dispose());
    material.map = tex(maps.base, true); material.normalMap = tex(maps.normal);
    material.normalScale.set(1, o.directx ? -1 : 1);
    material.aoMap = tex(maps.ao); material.roughnessMap = tex(maps.rough); material.displacementMap = tex(maps.height);
    material.displacementScale = disp; material.displacementBias = -disp / 2; material.roughness = 1; material.metalness = 0;
    material.needsUpdate = true;
    const geo = shape === 'sphere' ? new THREE.SphereGeometry(0.75, 256, 192) : shape === 'cube' ? new THREE.BoxGeometry(1.1, 1.1, 1.1, 128, 128, 128) : new THREE.PlaneGeometry(1.6, 1.6, 256, 256);
    if (mesh.geometry.type !== geo.type) { mesh.geometry.dispose(); mesh.geometry = geo; mesh.rotation.x = shape === 'plane' ? -Math.PI / 2.6 : 0; } else geo.dispose();
  }, [maps, shape, disp, o.directx]);

  function saveOne(key) {
    maps[key].toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${name}_${key}.png`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }
  async function saveZip() {
    const { zipSync } = await import('fflate');
    const files = {};
    for (const key of ['base', 'normal', 'height', 'ao', 'rough']) {
      const b = await new Promise((r) => maps[key].toBlob(r, 'image/png')); // eslint-disable-line no-await-in-loop
      files[`${name}_${key === 'rough' ? 'roughness' : key === 'base' ? 'basecolor' : key}.png`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }]; // eslint-disable-line no-await-in-loop
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' })); a.download = `${name}_pbr.zip`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const range = (label, key, min, max, step, fmt = (v) => v) => (
    <label className="tool-field"><span className="tool-field-label">{label}: {fmt(o[key])}</span><input type="range" min={min} max={max} step={step} value={o[key]} onChange={(e) => set(key, Number(e.target.value))} /></label>
  );

  return (
    <div className="tool-panel pbr-maps">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="vz-layout">
          <div className="vz-view">
            <div className="pbr-3d" ref={mountRef} />
            <div className="tool-field">
              <span className="tool-field-label">{t.shape}</span>
              <div className="segmented">{[['plane', t.plane], ['sphere', t.sphere], ['cube', t.cube]].map(([id, l]) => <button key={id} type="button" className={shape === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setShape(id)}>{l}</button>)}</div>
            </div>
            <label className="tool-field"><span className="tool-field-label">{t.disp}: {disp.toFixed(2)}</span><input type="range" min="0" max="0.25" step="0.01" value={disp} onChange={(e) => setDisp(Number(e.target.value))} /></label>
            {maps && (
              <div className="pbr-maps-grid">
                {Object.keys(t.maps).map((k) => (
                  <button key={k} type="button" className="pbr-map" onClick={() => saveOne(k)} title="PNG">
                    <img src={maps[k].toDataURL('image/jpeg', 0.7)} alt="" />
                    <span>{t.maps[k]} ↓</span>
                  </button>
                ))}
              </div>
            )}
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={saveZip} disabled={!maps}>{t.zip}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
          </div>
          <div className="vz-controls">
            <div className="grade-group-title">{t.height}</div>
            <label className="tool-check"><input type="checkbox" checked={o.invert} onChange={(e) => set('invert', e.target.checked)} /> {t.invert}</label>
            {range(t.smooth, 'smooth', 0, 6, 1)}
            {range(t.contrast, 'contrast', 0.3, 3, 0.05)}
            {range(t.large, 'largeScale', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
            <div className="grade-group-title">{t.normal}</div>
            {range(t.strength, 'strength', 0.2, 12, 0.1)}
            <label className="tool-check"><input type="checkbox" checked={o.directx} onChange={(e) => set('directx', e.target.checked)} /> {t.directx}</label>
            <div className="grade-group-title">{t.ao}</div>
            {range(t.aoStrength, 'aoStrength', 0, 4, 0.05)}
            {range(t.aoRadius, 'aoRadius', 0.002, 0.05, 0.001, (v) => `${(v * 100).toFixed(1)}%`)}
            <div className="grade-group-title">{t.rough}</div>
            {range(t.roughBase, 'roughBase', 0, 1, 0.01)}
            {range(t.roughVar, 'roughVar', 0, 1.5, 0.01)}
            <label className="tool-check"><input type="checkbox" checked={o.roughInvert} onChange={(e) => set('roughInvert', e.target.checked)} /> {t.roughInvert}</label>
            <div className="tool-field"><span className="tool-field-label">{t.size}</span>
              <div className="segmented">{[512, 1024, 2048].map((s) => <button key={s} type="button" className={size === s ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setSize(s)}>{s}</button>)}</div>
            </div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🧊 {t.note}</p>
    </div>
  );
}

export default PbrMaps;
