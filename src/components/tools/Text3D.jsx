import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

// Создатель 3D-текста: объёмные буквы с экструзией, фаской и скруглением,
// материал (цвет/металл/шероховатость), поворот ракурса мышью и угол обзора,
// свой шрифт (TTF/OTF). Экспорт PNG. Всё локально через three.js.

const TEXT = {
  ru: {
    text: 'Текст', font: 'Свой шрифт (TTF/OTF)', builtin: 'Встроенный',
    depth: 'Толщина', bevel: 'Фаска', curve: 'Скругление', size: 'Размер',
    color: 'Цвет', metal: 'Металл', rough: 'Шероховатость', bg: 'Фон', fov: 'Угол обзора',
    save: 'Скачать PNG', drag: '🖱 Тяните — вращать, колесо — зум', building: 'Строю…',
    note: 'Объёмный текст рендерится локально в браузере (three.js). Загрузите свой шрифт или используйте встроенный.',
    err: 'Не удалось прочитать шрифт',
  },
  en: {
    text: 'Text', font: 'Custom font (TTF/OTF)', builtin: 'Built-in',
    depth: 'Depth', bevel: 'Bevel', curve: 'Smoothness', size: 'Size',
    color: 'Color', metal: 'Metal', rough: 'Roughness', bg: 'Background', fov: 'Field of view',
    save: 'Download PNG', drag: '🖱 Drag to rotate, wheel to zoom', building: 'Building…',
    note: 'Volumetric text renders locally in your browser (three.js). Upload your font or use the built-in one.',
    err: 'Could not read the font',
  },
};

const BUILTIN_FONT = '/tools/fonts/PixelOperator.ttf';

function Text3D({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const mountRef = useRef(null);
  const fontInputRef = useRef(null);
  const S = useRef({});
  const fontRef = useRef(null);

  const [text, setText] = useState('Vetor');
  const [depth, setDepth] = useState(0.3);
  const [bevel, setBevel] = useState(0.03);
  const [curve, setCurve] = useState(4);
  const [color, setColor] = useState('#6166ff');
  const [metal, setMetal] = useState(0.4);
  const [rough, setRough] = useState(0.35);
  const [bg, setBg] = useState('#12131a');
  const [fov, setFov] = useState(40);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const initScene = useCallback(() => {
    if (S.current.renderer || !mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth; const h = mount.clientHeight || 420;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, w / h, 0.01, 100);
    camera.position.set(0, 0.6, 4);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ab0ff, 0.5); rim.position.set(-3, -1, -2); scene.add(rim);
    S.current = { renderer, scene, camera, controls, mesh: null };
    const loop = () => { const st = S.current; if (!st.renderer) return; st.raf = requestAnimationFrame(loop); st.controls.update(); st.renderer.render(st.scene, st.camera); };
    loop();
    const onResize = () => { const st = S.current; if (!st.renderer) return; const nw = mount.clientWidth; const nh = mount.clientHeight || 420; st.camera.aspect = nw / nh; st.camera.updateProjectionMatrix(); st.renderer.setSize(nw, nh); };
    S.current.onResize = onResize; window.addEventListener('resize', onResize);
  }, [fov]);

  const build = useCallback(() => {
    const st = S.current; const font = fontRef.current;
    if (!st.scene || !font || !text.trim()) return;
    if (st.mesh) { st.scene.remove(st.mesh); st.mesh.geometry.dispose(); st.mesh.material.dispose(); st.mesh = null; }
    let geo;
    try {
      geo = new TextGeometry(text, {
        font, size: 1, depth, curveSegments: Math.max(1, curve),
        bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3,
      });
    } catch { return; }
    geo.computeBoundingBox();
    const bb = geo.boundingBox; const cx = -(bb.max.x + bb.min.x) / 2; const cy = -(bb.max.y + bb.min.y) / 2; const cz = -(bb.max.z + bb.min.z) / 2;
    geo.translate(cx, cy, cz);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: metal, roughness: rough });
    const mesh = new THREE.Mesh(geo, mat); st.scene.add(mesh); st.mesh = mesh;
    // подгон камеры под ширину текста
    const width = (bb.max.x - bb.min.x) || 2;
    st.camera.position.set(0, 0.3, width * 0.9 + 2); st.controls.target.set(0, 0, 0); st.controls.update();
  }, [text, depth, bevel, curve, color, metal, rough]);

  function loadFontArrayBuffer(ab, name) {
    try {
      const json = new TTFLoader().parse(ab);
      fontRef.current = new FontLoader().parse(json);
      setErr(''); initScene(); build();
    } catch { setErr(t.err); }
    setBusy(false);
  }
  function loadFontFile(file) {
    if (!file) return; setBusy(true);
    const r = new FileReader(); r.onload = () => loadFontArrayBuffer(r.result, file.name); r.readAsArrayBuffer(file);
  }

  // Стартовый встроенный шрифт.
  useEffect(() => {
    let alive = true; setBusy(true);
    fetch(BUILTIN_FONT).then((res) => res.arrayBuffer()).then((ab) => { if (alive) loadFontArrayBuffer(ab, 'builtin'); }).catch(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (fontRef.current) build(); }, [build]);
  useEffect(() => { if (S.current.scene) S.current.scene.background = new THREE.Color(bg); }, [bg]);
  useEffect(() => { const st = S.current; if (st.camera) { st.camera.fov = fov; st.camera.updateProjectionMatrix(); } }, [fov]);
  useEffect(() => () => {
    const st = S.current; if (st.raf) cancelAnimationFrame(st.raf); if (st.onResize) window.removeEventListener('resize', st.onResize);
    if (st.controls) st.controls.dispose(); if (st.renderer) { st.renderer.dispose(); st.renderer.domElement.remove(); } S.current = {};
  }, []);

  function save() {
    const st = S.current; if (!st.renderer) return; st.renderer.render(st.scene, st.camera);
    const a = document.createElement('a'); a.href = st.renderer.domElement.toDataURL('image/png'); a.download = '3d-text.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const Slider = ({ label, val, set, min, max, step }) => (
    <div className="tool-field">
      <span className="tool-field-label">{label}: {val}</span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  return (
    <div className="tool-panel text3d">
      <div className="iso-layout">
        <div className="iso-stage">
          <div ref={mountRef} className="iso-mount" />
          <span className="iso-drag">{busy ? t.building : t.drag}</span>
        </div>
        <div className="iso-controls">
          <div className="tool-field">
            <span className="tool-field-label">{t.text}</span>
            <input type="text" className="yt-input" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <Slider label={t.depth} val={depth} set={setDepth} min={0.05} max={1.2} step={0.05} />
          <Slider label={t.bevel} val={bevel} set={setBevel} min={0} max={0.15} step={0.01} />
          <Slider label={t.curve} val={curve} set={setCurve} min={1} max={12} step={1} />
          <div className="t3-row">
            <label className="t3-color"><span className="tool-field-label">{t.color}</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
            <label className="t3-color"><span className="tool-field-label">{t.bg}</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
          </div>
          <Slider label={t.metal} val={metal} set={setMetal} min={0} max={1} step={0.05} />
          <Slider label={t.rough} val={rough} set={setRough} min={0} max={1} step={0.05} />
          <Slider label={t.fov} val={fov} set={setFov} min={15} max={80} step={1} />
          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
            <button type="button" className="tool-btn" onClick={() => fontInputRef.current?.click()}>{t.font}</button>
          </div>
          {err && <p className="color-invalid">{err}</p>}
        </div>
      </div>
      <input ref={fontInputRef} type="file" accept=".ttf,.otf,font/*" hidden onChange={(e) => { loadFontFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Text3D;
