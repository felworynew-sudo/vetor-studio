import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

// Лаборатория переливающихся 3D-форм: сфера/куб/кристалл/тор/капсула/лепестки/
// метаболы, деформированные шумом (fbm) + лепестковой волной + твистом на
// вершинном шейдере, раскрашенные трёхцветным градиентом с fresnel-подсветкой
// во фрагментном. Bloom-свечение (UnrealBloomPass). Вращение мышью, рандом,
// экспорт PNG. Всё считается локально через three.js.

const SHAPES = ['sphere', 'roundedCube', 'cube', 'icosahedron', 'torus', 'capsule', 'petals', 'metaballs'];
const PALETTE = ['#ff4000', '#ff7a00', '#ffb000', '#ffe000', '#ff206e', '#ff00c8', '#cf3cff', '#755cff', '#00bfff', '#00f0c8', '#52ff7a'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rf = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rf(a, b + 1));

const SHAPE_LABEL = {
  ru: { sphere: 'Сфера', roundedCube: 'Кристалл', cube: 'Куб', icosahedron: 'Икосаэдр', torus: 'Тор', capsule: 'Капсула', petals: 'Лепестки', metaballs: 'Метаболы' },
  en: { sphere: 'Sphere', roundedCube: 'Crystal', cube: 'Cube', icosahedron: 'Icosahedron', torus: 'Torus', capsule: 'Capsule', petals: 'Petals', metaballs: 'Metaballs' },
};

const TEXT = {
  ru: {
    animate: 'Анимация', autoRotate: 'Автовращение', colors: 'Цвета',
    deform: 'Деформация', noiseStrength: 'Сила шума', noiseDensity: 'Плотность шума', speed: 'Скорость',
    lobes: 'Лепестков (волна)', lobeStrength: 'Сила волны', twist: 'Скрутка',
    special: 'Спецпараметры', petalCount: 'Число лепестков', metaballCount: 'Число метаболов', metaballRes: 'Детализация метаболов',
    glow: 'Свечение (bloom)', strength: 'Сила', radius: 'Радиус', threshold: 'Порог',
    randomize: '🎲 Случайно', save: 'Скачать PNG', drag: '🖱 Тяните — вращать, колесо — зум',
    note: 'Форма и шейдер считаются локально в браузере (three.js).',
  },
  en: {
    animate: 'Animate', autoRotate: 'Auto-rotate', colors: 'Colors',
    deform: 'Deformation', noiseStrength: 'Noise strength', noiseDensity: 'Noise density', speed: 'Speed',
    lobes: 'Lobes (wave)', lobeStrength: 'Lobe strength', twist: 'Twist',
    special: 'Special', petalCount: 'Petal count', metaballCount: 'Metaball count', metaballRes: 'Metaball detail',
    glow: 'Glow (bloom)', strength: 'Strength', radius: 'Radius', threshold: 'Threshold',
    randomize: '🎲 Randomize', save: 'Download PNG', drag: '🖱 Drag to rotate, wheel to zoom',
    note: 'The shape and shader run locally in your browser (three.js).',
  },
};

const VERTEX_SHADER = `
  uniform float time, noiseStrength, noiseDensity, speed, lobes, lobeStrength, twist;
  varying vec3 vWorldPos, vObjPos, vNormalW;

  float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(.11, .17, .23)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    float a = hash(i + vec3(0,0,0)); float b = hash(i + vec3(1,0,0)); float c = hash(i + vec3(0,1,0)); float d = hash(i + vec3(1,1,0));
    float e = hash(i + vec3(0,0,1)); float f1 = hash(i + vec3(1,0,1)); float g = hash(i + vec3(0,1,1)); float h = hash(i + vec3(1,1,1));
    return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,f1,f.x), mix(g,h,f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float o = 0.0; float amp = 0.5; for (int i = 0; i < 5; i++) { o += noise3(p) * amp; p *= 2.03; amp *= 0.5; } return o; }
  mat2 r2(float a) { float s = sin(a); float c = cos(a); return mat2(c, -s, s, c); }

  void main() {
    vec3 p = position;
    float t = time * speed;
    p.xz = r2(twist * p.y) * p.xz;
    float ang = atan(p.z, p.x);
    float n = fbm(p * noiseDensity + vec3(t * .60, -t * .37, t * .41));
    n = (n - .5) * 2.0;
    vec3 np = normalize(p + vec3(0.0001));
    float equator = 1.0 - abs(np.y);
    float petals = sin(ang * max(lobes, 1.0) + t * .8) * lobeStrength * equator;
    vec3 displaced = p + normal * (n * noiseStrength + petals);
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = world.xyz; vObjPos = displaced; vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const FRAGMENT_SHADER = `
  uniform float time; uniform vec3 colorA, colorB, colorC;
  varying vec3 vWorldPos, vObjPos, vNormalW;
  void main() {
    vec3 N = normalize(vNormalW); vec3 V = normalize(cameraPosition - vWorldPos);
    float a = atan(vObjPos.z, vObjPos.x); float y = vObjPos.y; float r = length(vObjPos.xz);
    float g1 = .5 + .5 * sin(a * 1.45 + y * 2.15 + time * .72);
    float g2 = .5 + .5 * sin(r * 4.0 - time * .91 + y * 1.25);
    float g3 = .5 + .5 * cos(y * 3.1 + a * .6 + time * .53);
    vec3 col = mix(colorA, colorB, g1); col = mix(col, colorC, g2 * .67); col += colorB * g3 * .10;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    col += fresnel * .38; col *= 1.18;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const DEFAULT_PARAMS = {
  shape: 'sphere', colorA: '#ff4200', colorB: '#ffb300', colorC: '#ff00c8',
  animate: true, autoRotate: true,
  noiseStrength: 0.18, noiseDensity: 1.6, speed: 0.48,
  lobes: 4, lobeStrength: 0.08, twist: 0.12,
  petalCount: 5, metaballCount: 5, metaballResolution: 42,
  bloomStrength: 0.85, bloomRadius: 0.55, bloomThreshold: 0.28,
};

function makePetalGeometry(count) {
  const fn = (u, v, target) => {
    const U = u * Math.PI * 2; const V = v * Math.PI;
    const equator = Math.sin(V) ** 1.25;
    const flower = Math.cos(U * count) * equator;
    const radius = 0.88 + 0.21 * flower;
    target.set(radius * Math.sin(V) * Math.cos(U), 1.02 * Math.cos(V) * (1 + 0.08 * flower), radius * Math.sin(V) * Math.sin(U));
  };
  return new ParametricGeometry(fn, 150, 80);
}
function makeGeometry(shape, petalCount) {
  switch (shape) {
    case 'sphere': return new THREE.SphereGeometry(1.12, 128, 96);
    case 'roundedCube': return new RoundedBoxGeometry(1.82, 1.82, 1.82, 10, 0.36);
    case 'cube': return new THREE.BoxGeometry(1.75, 1.75, 1.75, 40, 40, 40);
    case 'icosahedron': return new THREE.IcosahedronGeometry(1.2, 5);
    case 'torus': return new THREE.TorusGeometry(0.86, 0.38, 72, 160);
    case 'capsule': return new THREE.CapsuleGeometry(0.66, 1.05, 20, 40);
    case 'petals': return makePetalGeometry(petalCount);
    default: return new THREE.SphereGeometry(1.12, 128, 96);
  }
}

function BlobLab({ language = 'ru' }) {
  const t = TEXT[language] || TEXT.ru;
  const shapeLabel = SHAPE_LABEL[language] || SHAPE_LABEL.ru;
  const mountRef = useRef(null);
  const S = useRef({});
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const paramsRef = useRef(params); paramsRef.current = params;
  const [bg, setBg] = useState('#0b0b0f');

  const patch = (upd) => setParams((p) => ({ ...p, ...upd }));

  const createShaderMaterial = useCallback(() => new THREE.ShaderMaterial({
    depthWrite: true,
    depthTest: true,
    uniforms: {
      time: { value: 0 },
      colorA: { value: new THREE.Color(paramsRef.current.colorA) },
      colorB: { value: new THREE.Color(paramsRef.current.colorB) },
      colorC: { value: new THREE.Color(paramsRef.current.colorC) },
      noiseStrength: { value: paramsRef.current.noiseStrength },
      noiseDensity: { value: paramsRef.current.noiseDensity },
      speed: { value: paramsRef.current.speed },
      lobes: { value: paramsRef.current.lobes },
      lobeStrength: { value: paramsRef.current.lobeStrength },
      twist: { value: paramsRef.current.twist },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  }), []);

  const disposeCurrent = useCallback(() => {
    const st = S.current; if (!st.object) return;
    st.scene.remove(st.object);
    if (!st.isMetaballs && st.object.geometry) st.object.geometry.dispose();
    if (st.object.material) st.object.material.dispose();
    st.object = null; st.material = null; st.isMetaballs = false;
  }, []);

  const rebuildObject = useCallback(() => {
    const st = S.current; if (!st.scene) return;
    disposeCurrent();
    const p = paramsRef.current;
    if (p.shape === 'metaballs') {
      const material = createShaderMaterial();
      const mc = new MarchingCubes(p.metaballResolution, material, true, false, 100000);
      mc.scale.set(2.1, 2.1, 2.1); mc.isolation = 80;
      st.object = mc; st.material = material; st.isMetaballs = true;
      st.scene.add(mc);
    } else {
      const mesh = new THREE.Mesh(makeGeometry(p.shape, p.petalCount), createShaderMaterial());
      st.object = mesh; st.material = mesh.material; st.isMetaballs = false;
      st.scene.add(mesh);
    }
  }, [disposeCurrent, createShaderMaterial]);

  // --- инициализация сцены (один раз) ---
  const initScene = useCallback(() => {
    if (S.current.renderer || !mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth; const h = mount.clientHeight || 440;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene(); scene.background = new THREE.Color(bg);
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(0, 0, 8.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 3.5; controls.maxDistance = 14;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), paramsRef.current.bloomStrength, paramsRef.current.bloomRadius, paramsRef.current.bloomThreshold);
    composer.addPass(bloomPass);

    S.current = { renderer, scene, camera, controls, composer, bloomPass, object: null, material: null, isMetaballs: false };
    rebuildObject();

    const loop = (ms) => {
      const st = S.current; if (!st.renderer) return;
      st.raf = requestAnimationFrame(loop);
      const time = ms * 0.001;
      const p = paramsRef.current;
      if (st.material) {
        const u = st.material.uniforms;
        u.time.value = p.animate ? time : 0;
        u.colorA.value.set(p.colorA); u.colorB.value.set(p.colorB); u.colorC.value.set(p.colorC);
        u.noiseStrength.value = p.noiseStrength; u.noiseDensity.value = p.noiseDensity; u.speed.value = p.speed;
        u.lobes.value = p.lobes; u.lobeStrength.value = p.lobeStrength; u.twist.value = p.twist;
      }
      if (st.isMetaballs && st.object) {
        const mc = st.object; mc.reset();
        const count = p.metaballCount; const strength = 1.05 / (((Math.sqrt(count) - 1) / 4) + 1);
        for (let i = 0; i < count; i += 1) {
          const x = 0.5 + 0.22 * Math.sin(time * 0.55 + i * 1.31);
          const y = 0.5 + 0.22 * Math.cos(time * 0.71 + i * 1.77);
          const z = 0.5 + 0.22 * Math.sin(time * 0.87 + i * 2.19);
          mc.addBall(x, y, z, strength * (1 + 0.15 * Math.sin(time + i)), 12);
        }
      }
      if (st.object && p.autoRotate) { st.object.rotation.y = time * 0.18; st.object.rotation.x = Math.sin(time * 0.28) * 0.10; }
      st.controls.update();
      st.composer.render();
    };
    loop(0);

    const onResize = () => {
      const st = S.current; if (!st.renderer) return;
      const nw = mount.clientWidth; const nh = mount.clientHeight || 440;
      st.camera.aspect = nw / nh; st.camera.updateProjectionMatrix();
      st.renderer.setSize(nw, nh); st.composer.setSize(nw, nh);
    };
    S.current.onResize = onResize; window.addEventListener('resize', onResize);
  }, [bg, rebuildObject]);

  useEffect(() => { initScene(); }, [initScene]);
  // Смена формы/числа лепестков/детализации метаболов требует пересборки геометрии.
  useEffect(() => { if (S.current.scene) rebuildObject(); }, [params.shape, params.petalCount, params.metaballResolution, rebuildObject]);
  useEffect(() => { if (S.current.scene) S.current.scene.background = new THREE.Color(bg); }, [bg]);
  useEffect(() => {
    const st = S.current; if (!st.bloomPass) return;
    st.bloomPass.strength = params.bloomStrength; st.bloomPass.radius = params.bloomRadius; st.bloomPass.threshold = params.bloomThreshold;
  }, [params.bloomStrength, params.bloomRadius, params.bloomThreshold]);
  useEffect(() => () => {
    const st = S.current; if (st.raf) cancelAnimationFrame(st.raf);
    if (st.onResize) window.removeEventListener('resize', st.onResize);
    if (st.controls) st.controls.dispose();
    if (st.renderer) { st.renderer.dispose(); st.renderer.domElement.remove(); }
    S.current = {};
  }, []);

  function randomize() {
    patch({
      shape: pick(SHAPES),
      colorA: pick(PALETTE), colorB: pick(PALETTE), colorC: pick(PALETTE),
      noiseStrength: rf(0.03, 0.42), noiseDensity: rf(0.5, 4.0), speed: rf(0.15, 1.0),
      lobes: ri(0, 9), lobeStrength: rf(0, 0.22), twist: rf(-0.75, 0.75),
      petalCount: ri(3, 9), metaballCount: ri(3, 8),
      bloomStrength: rf(0.8, 1.8), bloomRadius: rf(0.25, 0.9), bloomThreshold: rf(0, 0.08),
    });
  }
  function save() {
    const st = S.current; if (!st.renderer) return;
    st.composer.render();
    const a = document.createElement('a'); a.href = st.renderer.domElement.toDataURL('image/png'); a.download = 'blob-lab.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  const Slider = ({ label, val, set, min, max, step }) => (
    <div className="tool-field">
      <span className="tool-field-label">{label}: {val}</span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  return (
    <div className="tool-panel blob-lab">
      <div className="iso-layout">
        <div className="iso-stage">
          <div ref={mountRef} className="iso-mount" />
          <span className="iso-drag">{t.drag}</span>
        </div>
        <div className="iso-controls">
          <div className="segmented bl-shapes">
            {SHAPES.map((s) => (
              <button key={s} type="button" className={params.shape === s ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => patch({ shape: s })}>{shapeLabel[s]}</button>
            ))}
          </div>
          <label className="rec-opt"><input type="checkbox" checked={params.animate} onChange={(e) => patch({ animate: e.target.checked })} /> {t.animate}</label>
          <label className="rec-opt"><input type="checkbox" checked={params.autoRotate} onChange={(e) => patch({ autoRotate: e.target.checked })} /> {t.autoRotate}</label>

          <div className="bl-title">{t.colors}</div>
          <div className="t3-row">
            <label className="t3-color"><span className="tool-field-label">A</span><input type="color" value={params.colorA} onChange={(e) => patch({ colorA: e.target.value })} /></label>
            <label className="t3-color"><span className="tool-field-label">B</span><input type="color" value={params.colorB} onChange={(e) => patch({ colorB: e.target.value })} /></label>
            <label className="t3-color"><span className="tool-field-label">C</span><input type="color" value={params.colorC} onChange={(e) => patch({ colorC: e.target.value })} /></label>
          </div>

          <div className="bl-title">{t.deform}</div>
          <Slider label={t.noiseStrength} val={params.noiseStrength} set={(v) => patch({ noiseStrength: v })} min={0} max={0.8} step={0.01} />
          <Slider label={t.noiseDensity} val={params.noiseDensity} set={(v) => patch({ noiseDensity: v })} min={0.2} max={6} step={0.1} />
          <Slider label={t.speed} val={params.speed} set={(v) => patch({ speed: v })} min={0} max={2} step={0.05} />
          <Slider label={t.lobes} val={params.lobes} set={(v) => patch({ lobes: v })} min={0} max={12} step={1} />
          <Slider label={t.lobeStrength} val={params.lobeStrength} set={(v) => patch({ lobeStrength: v })} min={0} max={0.5} step={0.01} />
          <Slider label={t.twist} val={params.twist} set={(v) => patch({ twist: v })} min={-1.5} max={1.5} step={0.05} />

          {(params.shape === 'petals' || params.shape === 'metaballs') && <div className="bl-title">{t.special}</div>}
          {params.shape === 'petals' && <Slider label={t.petalCount} val={params.petalCount} set={(v) => patch({ petalCount: v })} min={2} max={12} step={1} />}
          {params.shape === 'metaballs' && <Slider label={t.metaballCount} val={params.metaballCount} set={(v) => patch({ metaballCount: v })} min={2} max={10} step={1} />}
          {params.shape === 'metaballs' && <Slider label={t.metaballRes} val={params.metaballResolution} set={(v) => patch({ metaballResolution: v })} min={24} max={64} step={2} />}

          <div className="bl-title">{t.glow}</div>
          <Slider label={t.strength} val={params.bloomStrength} set={(v) => patch({ bloomStrength: v })} min={0} max={3} step={0.05} />
          <Slider label={t.radius} val={params.bloomRadius} set={(v) => patch({ bloomRadius: v })} min={0} max={1} step={0.02} />
          <Slider label={t.threshold} val={params.bloomThreshold} set={(v) => patch({ bloomThreshold: v })} min={0} max={1} step={0.01} />

          <div className="tool-actions">
            <button type="button" className="tool-btn primary" onClick={save}>{t.save}</button>
            <button type="button" className="tool-btn" onClick={randomize}>{t.randomize}</button>
          </div>
        </div>
      </div>
      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}

export default BlobLab;
