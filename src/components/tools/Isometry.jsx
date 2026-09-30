import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Export3DPanel from './shared/Export3DPanel';

// 3D-экструзия: картинка (или SVG) ужимается до пиксельной сетки, и каждый
// непрозрачный пиксель выдавливается в объёмный кубик — получается воксельная
// 3D-модель, которую можно крутить мышью, сохранить в PNG или выгрузить в
// GLB/STL/OBJ. Модель — одна сетка: внутренние грани между соседями отброшены,
// цвет пикселя — в цветах вершин. В духе пиксель-арта.

const srgbToLinear = (c) => (c < 0.04045 ? c * 0.0773993808 : (c * 0.9478672986 + 0.0521327014) ** 2.4);

// Воксельная сетка: лицевая/тыльная грань у каждой клетки, боковые — только на границе.
function voxelGeometry(filled, colors, W, H, dz) {
  const pos = []; const nor = []; const col = []; const idx = [];
  const face = (verts, n, c) => {
    const base = pos.length / 3;
    verts.forEach((v) => { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]); });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && filled[y * W + x];
  const z0 = -dz / 2; const z1 = dz / 2;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!filled[y * W + x]) continue;
      const c = colors[y * W + x]; const x0 = x - W / 2; const x1 = x0 + 1; const yt = H / 2 - y; const yb = yt - 1;
      face([[x0, yb, z1], [x1, yb, z1], [x1, yt, z1], [x0, yt, z1]], [0, 0, 1], c);
      face([[x1, yb, z0], [x0, yb, z0], [x0, yt, z0], [x1, yt, z0]], [0, 0, -1], c);
      if (!at(x - 1, y)) face([[x0, yb, z0], [x0, yb, z1], [x0, yt, z1], [x0, yt, z0]], [-1, 0, 0], c);
      if (!at(x + 1, y)) face([[x1, yb, z1], [x1, yb, z0], [x1, yt, z0], [x1, yt, z1]], [1, 0, 0], c);
      if (!at(x, y - 1)) face([[x0, yt, z1], [x1, yt, z1], [x1, yt, z0], [x0, yt, z0]], [0, 1, 0], c);
      if (!at(x, y + 1)) face([[x0, yb, z0], [x1, yb, z0], [x1, yb, z1], [x0, yb, z1]], [0, -1, 0], c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

const TEXT = {
  ru: {
    drop: 'Перетащите картинку или SVG', hint: 'PNG, JPG, WebP, SVG — лучше пиксель-арт или логотип',
    res: 'Детализация', depth: 'Толщина', bg: 'Фон', reset: 'Сбросить вид', save: 'Скачать PNG',
    change: 'Другое', spin: 'Вращение', drag: '🖱 Тяните — вращать, колесо — зум',
    note: 'Каждый пиксель становится 3D-кубиком. Экспорт GLB/STL/OBJ. Всё считается локально в браузере.',
  },
  en: {
    drop: 'Drop an image or SVG', hint: 'PNG, JPG, WebP, SVG — pixel art or a logo works best',
    res: 'Detail', depth: 'Thickness', bg: 'Background', reset: 'Reset view', save: 'Download PNG',
    change: 'Another', spin: 'Auto-spin', drag: '🖱 Drag to rotate, wheel to zoom',
    note: 'Every pixel becomes a 3D cube. GLB/STL/OBJ export. Everything runs locally in your browser.',
  },
};

function Isometry({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const inputRef = useRef(null);
  const mountRef = useRef(null);
  const S = useRef({}); // three-объекты вне React-цикла
  const imgRef = useRef(null);

  const [src, setSrc] = useState('');
  const [res, setRes] = useState(48);
  const [depth, setDepth] = useState(1);
  const [bg, setBg] = useState('#12131a');
  const [spin, setSpin] = useState(false);
  const spinRef = useRef(spin); spinRef.current = spin;

  // --- инициализация сцены (один раз) ---
  const initScene = useCallback(() => {
    if (S.current.renderer || !mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth; const h = mount.clientHeight || 420;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 2000);
    camera.position.set(28, 30, 46);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(1, 2, 1.5); scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x8ea2ff, 0.35); dir2.position.set(-1, -0.5, -1); scene.add(dir2);
    S.current = { renderer, scene, camera, controls, mesh: null };
    const loop = () => {
      const st = S.current; if (!st.renderer) return;
      st.raf = requestAnimationFrame(loop);
      if (spinRef.current && st.mesh) st.mesh.rotation.y += 0.01;
      st.controls.update();
      st.renderer.render(st.scene, st.camera);
    };
    loop();
    const onResize = () => {
      const st = S.current; if (!st.renderer) return;
      const nw = mount.clientWidth; const nh = mount.clientHeight || 420;
      st.camera.aspect = nw / nh; st.camera.updateProjectionMatrix(); st.renderer.setSize(nw, nh);
    };
    S.current.onResize = onResize; window.addEventListener('resize', onResize);
  }, []);

  // --- построение вокселей из картинки ---
  const build = useCallback(() => {
    const st = S.current; const img = imgRef.current;
    if (!st.scene || !img) return;
    const W = Math.max(4, Math.min(160, res));
    const H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    // непрозрачные пиксели → воксели (цвет в линейном пространстве)
    const filled = new Uint8Array(W * H); const colors = new Array(W * H); let count = 0;
    for (let i = 0; i < W * H; i += 1) {
      if (d[i * 4 + 3] > 24) { filled[i] = 1; count += 1; colors[i] = [srgbToLinear(d[i * 4] / 255), srgbToLinear(d[i * 4 + 1] / 255), srgbToLinear(d[i * 4 + 2] / 255)]; }
    }
    if (st.mesh) { st.scene.remove(st.mesh); st.mesh.geometry.dispose(); st.mesh.material.dispose(); st.mesh = null; }
    if (!count) return;
    const dz = Math.max(0.2, depth) * Math.max(W, H) * 0.12;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05, vertexColors: true });
    const mesh = new THREE.Mesh(voxelGeometry(filled, colors, W, H, dz), mat); mesh.name = 'voxels';
    st.scene.add(mesh); st.mesh = mesh;
    // подгоняем камеру под размер
    const span = Math.max(W, H);
    st.camera.position.set(span * 0.6, span * 0.65, span * 1.0);
    st.controls.target.set(0, 0, 0); st.controls.update();
  }, [res, depth]);

  function loadFile(file) {
    if (!file || !(file.type.startsWith('image/') || /\.svg$/i.test(file.name))) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => { imgRef.current = img; initScene(); build(); };
    img.src = url;
  }

  useEffect(() => { if (src) build(); }, [res, depth, build, src]);
  useEffect(() => { if (S.current.scene) S.current.scene.background = bg === 'transparent' ? null : new THREE.Color(bg); }, [bg]);
  useEffect(() => () => {
    const st = S.current; if (st.raf) cancelAnimationFrame(st.raf);
    if (st.onResize) window.removeEventListener('resize', st.onResize);
    if (st.controls) st.controls.dispose();
    if (st.renderer) { st.renderer.dispose(); st.renderer.domElement.remove(); }
    S.current = {};
  }, []);

  function resetView() {
    const st = S.current; if (!st.mesh) return;
    st.mesh.rotation.set(0, 0, 0);
    const span = 48; st.camera.position.set(span * 0.6, span * 0.65, span); st.controls.target.set(0, 0, 0); st.controls.update();
  }
  function save() {
    const st = S.current; if (!st.renderer) return;
    st.renderer.render(st.scene, st.camera);
    const a = document.createElement('a'); a.href = st.renderer.domElement.toDataURL('image/png'); a.download = '3d-extrude.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="tool-panel isometry">
      {!src ? (
        <button type="button" className="tool-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
          <span className="tool-dropzone-title">{t.drop}</span>
          <span className="tool-dropzone-hint">{t.hint}</span>
        </button>
      ) : (
        <div className="iso-layout">
          <div className="iso-stage">
            <div ref={mountRef} className="iso-mount" />
            <span className="iso-drag">{t.drag}</span>
          </div>
          <div className="iso-controls">
            <div className="tool-field">
              <span className="tool-field-label">{t.res}: {res}px</span>
              <input type="range" min="8" max="128" value={res} onChange={(e) => setRes(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.depth}: {depth}</span>
              <input type="range" min="0.2" max="4" step="0.1" value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
            </div>
            <div className="tool-field">
              <span className="tool-field-label">{t.bg}</span>
              <input type="color" value={bg === 'transparent' ? '#12131a' : bg} onChange={(e) => setBg(e.target.value)} />
            </div>
            <label className="rec-opt"><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> {t.spin}</label>
            <div className="tool-actions">
              <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
              <button type="button" className="tool-btn" onClick={resetView}>{t.reset}</button>
              <button type="button" className="tool-btn ghost" onClick={() => inputRef.current?.click()}>{t.change}</button>
            </div>
            <Export3DPanel language={language} getMesh={() => S.current.mesh} baseName="voxel-model" />
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,.svg" hidden onChange={(e) => { loadFile(e.target.files[0]); e.target.value = ''; }} />
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default Isometry;
