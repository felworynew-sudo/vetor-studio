import { useEffect, useRef, useState } from 'react';
import { colorize, erode, generateHeight, normalize } from '../../utils/terrain';

// Генератор ландшафта / карт высот: simplex-fBm и ridged-шум, domain warp, остров,
// гидравлическая эрозия каплями, уровень воды, цветная карта с тенями и 3D-превью
// на three.js. Экспорт: heightmap PNG, цветная карта PNG и RAW 16-bit (.r16) для
// террейнов Unity/Unreal/Blender.

const TEXT = {
  ru: {
    seed: 'Сид', newSeed: 'Новый', size: 'Размер', scale: 'Масштаб форм', octaves: 'Детализация (октавы)', gain: 'Шероховатость', ridged: 'Горные хребты',
    warp: 'Искажение', island: 'Остров', erosion: 'Эрозия (капель, тыс.)', water: 'Уровень воды', height: 'Высота в 3D', generate: 'Сгенерировать', eroding: 'Эрозия…',
    heightPng: 'Heightmap PNG', colorPng: 'Цветная карта PNG', raw: 'RAW 16-bit (.r16)', view: 'Вид', v3d: '3D', vmap: 'Карта', vheight: 'Высоты',
    note: 'Эрозия прорезает русла и сглаживает склоны — рельеф выглядит «настоящим». RAW 16-bit: little-endian, квадрат — импортируется в Unity Terrain и Unreal Landscape.',
  },
  en: {
    seed: 'Seed', newSeed: 'New', size: 'Size', scale: 'Feature scale', octaves: 'Detail (octaves)', gain: 'Roughness', ridged: 'Mountain ridges',
    warp: 'Warp', island: 'Island', erosion: 'Erosion (droplets, k)', water: 'Water level', height: '3D height', generate: 'Generate', eroding: 'Eroding…',
    heightPng: 'Heightmap PNG', colorPng: 'Color map PNG', raw: 'RAW 16-bit (.r16)', view: 'View', v3d: '3D', vmap: 'Map', vheight: 'Heights',
    note: 'Erosion carves riverbeds and smooths slopes — the terrain looks real. RAW 16-bit is little-endian, square — imports into Unity Terrain and Unreal Landscape.',
  },
};

const D = { seed: 1337, size: 512, scale: 3.2, octaves: 6, gain: 0.5, ridged: 0.35, warp: 0.25, island: 0.5, erosion: 60, water: 0.28, height: 0.35 };

function TerrainGenerator({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const [o, setO] = useState(D);
  const [H, setH] = useState(null);
  const [busy, setBusy] = useState('');
  const [view, setView] = useState('3d');
  const mountRef = useRef(null); const threeRef = useRef(null); const mapRef = useRef(null);
  const set = (k, v) => setO((p) => ({ ...p, [k]: v }));

  async function generate() {
    setBusy('…');
    await new Promise((r) => setTimeout(r, 20));
    const h = generateHeight(o.size, o);
    if (o.erosion > 0) {
      await erode(h, o.size, Math.round(o.erosion * 1000 * (o.size / 512) ** 2), (p) => setBusy(`${t.eroding} ${Math.round(p * 100)}%`), o.seed);
      normalize(h);
    }
    setH(h); setBusy('');
  }
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const heightCanvas = () => {
    const c = document.createElement('canvas'); c.width = o.size; c.height = o.size;
    const x = c.getContext('2d'); const img = x.createImageData(o.size, o.size);
    for (let i = 0; i < H.length; i += 1) { const v = Math.max(H[i], o.water) * 255; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0); return c;
  };
  const colorCanvas = () => { const c = document.createElement('canvas'); c.width = o.size; c.height = o.size; c.getContext('2d').putImageData(colorize(H, o.size, o.water), 0, 0); return c; };

  // 2D-вид.
  useEffect(() => {
    if (!H || view === '3d' || !mapRef.current) return;
    const src = view === 'map' ? colorCanvas() : heightCanvas();
    const c = mapRef.current; c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
  }, [H, view, o.water]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3D-превью.
  useEffect(() => {
    if (view !== '3d' || !mountRef.current) return undefined;
    let disposed = false; let raf = 0;
    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;
      const el = mountRef.current; const W = el.clientWidth; const Hh = Math.round(W * 0.62);
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(W, Hh);
      renderer.outputColorSpace = THREE.SRGBColorSpace; el.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#a9c7e8'); scene.fog = new THREE.Fog('#a9c7e8', 3, 7);
      const camera = new THREE.PerspectiveCamera(45, W / Hh, 0.01, 50); camera.position.set(0, 1.4, 2.1);
      const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.6;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3, 1); scene.add(sun);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
      const terrain = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 255, 255), mat); terrain.rotation.x = -Math.PI / 2; scene.add(terrain);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: 0x2a6fb0, transparent: true, opacity: 0.72, roughness: 0.2, metalness: 0.1 }));
      water.rotation.x = -Math.PI / 2; scene.add(water);
      const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
      loop();
      threeRef.current = { THREE, terrain, water, mat, dispose: () => { cancelAnimationFrame(raf); renderer.dispose(); el.innerHTML = ''; } };
      setO((p) => ({ ...p })); // перерисовать с текущей картой
    })();
    return () => { disposed = true; threeRef.current?.dispose(); threeRef.current = null; };
  }, [view]);

  useEffect(() => {
    const th = threeRef.current; if (!th || !H) return;
    const { THREE, terrain, water, mat } = th;
    const pos = terrain.geometry.attributes.position; const seg = 256; const n = o.size;
    for (let j = 0; j < seg; j += 1) {
      for (let i = 0; i < seg; i += 1) {
        const hx = Math.round((i / (seg - 1)) * (n - 1)); const hy = Math.round((j / (seg - 1)) * (n - 1));
        pos.setZ(j * seg + i, Math.max(H[hy * n + hx], o.water * 0.98) * o.height);
      }
    }
    pos.needsUpdate = true; terrain.geometry.computeVertexNormals();
    mat.map?.dispose(); const tex = new THREE.CanvasTexture(colorCanvas()); tex.colorSpace = THREE.SRGBColorSpace; mat.map = tex; mat.needsUpdate = true;
    water.position.y = o.water * o.height;
  }, [H, o.water, o.height, threeRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  function save(kind) {
    if (!H) return;
    const nm = `terrain-${o.seed}-${o.size}`;
    if (kind === 'raw') {
      const buf = new Uint16Array(H.length); for (let i = 0; i < H.length; i += 1) buf[i] = Math.round(Math.max(0, Math.min(1, H[i])) * 65535);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf.buffer], { type: 'application/octet-stream' })); a.download = `${nm}.r16`; document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    (kind === 'height' ? heightCanvas() : colorCanvas()).toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${nm}-${kind}.png`; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }

  const range = (label, key, min, max, step, fmt = (v) => v) => (
    <label className="tool-field"><span className="tool-field-label">{label}: {fmt(o[key])}</span><input type="range" min={min} max={max} step={step} value={o[key]} onChange={(e) => set(key, Number(e.target.value))} /></label>
  );

  return (
    <div className="tool-panel terrain">
      <div className="vz-layout">
        <div className="vz-view">
          <div className="segmented">{[['3d', t.v3d], ['map', t.vmap], ['height', t.vheight]].map(([id, l]) => <button key={id} type="button" className={view === id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setView(id)}>{l}</button>)}</div>
          {view === '3d' ? <div className="pbr-3d tg-3d" ref={mountRef} /> : <canvas ref={mapRef} className="tg-map" />}
          {busy && <div className="vz-status">⏳ {busy}</div>}
          <div className="tool-actions">
            <button type="button" className="tool-btn" onClick={() => save('height')} disabled={!H}>{t.heightPng}</button>
            <button type="button" className="tool-btn" onClick={() => save('color')} disabled={!H}>{t.colorPng}</button>
            <button type="button" className="tool-btn" onClick={() => save('raw')} disabled={!H}>{t.raw}</button>
          </div>
        </div>
        <div className="vz-controls">
          <div className="mg-row">
            <label className="tool-field"><span className="tool-field-label">{t.seed}</span><input className="dm-input" type="number" value={o.seed} onChange={(e) => set('seed', Number(e.target.value) || 1)} /></label>
            <button type="button" className="tool-btn small" onClick={() => set('seed', Math.floor(Math.random() * 99999) + 1)}>🎲 {t.newSeed}</button>
          </div>
          <div className="tool-field"><span className="tool-field-label">{t.size}</span>
            <div className="segmented">{[256, 512, 1024].map((s) => <button key={s} type="button" className={o.size === s ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => set('size', s)}>{s}</button>)}</div>
          </div>
          {range(t.scale, 'scale', 0.5, 10, 0.1)}
          {range(t.octaves, 'octaves', 1, 9, 1)}
          {range(t.gain, 'gain', 0.2, 0.8, 0.01)}
          {range(t.ridged, 'ridged', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
          {range(t.warp, 'warp', 0, 1, 0.01)}
          {range(t.island, 'island', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
          {range(t.erosion, 'erosion', 0, 300, 5)}
          <button type="button" className="tool-btn primary" onClick={generate} disabled={!!busy}>{busy ? busy : t.generate}</button>
          {range(t.water, 'water', 0, 0.8, 0.01, (v) => `${Math.round(v * 100)}%`)}
          {range(t.height, 'height', 0.05, 1, 0.01)}
        </div>
      </div>
      <p className="tool-local-note">🏔 {t.note}</p>
    </div>
  );
}

export default TerrainGenerator;
