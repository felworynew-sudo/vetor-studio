// Движок умного кадрирования: saliency + лица + объекты → скоринг рамки.
//  • smartcrop.js (MIT) оценивает визуально интересные зоны (детали/края, телесные
//    тона, насыщенность) и перебирает рамки нужной пропорции;
//  • лица (MediaPipe BlazeFace, Apache-2.0) и объекты (DETR через transformers.js)
//    подаются в него как boost-регионы;
//  • затем жёсткое ограничение: лица не режутся, если это геометрически возможно.
// Используется Smart Crop и Social Media Crop Pack. Всё локально в браузере.

const MP_VERSION = '1.0.1';
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let facePromise = null;
function getFaceDetector() {
  if (facePromise) return facePromise;
  facePromise = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
    const make = (delegate) => FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_FACE_MODEL, delegate },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.55,
    });
    try { return await make('GPU'); } catch { return make('CPU'); }
  })().catch((e) => { facePromise = null; throw e; });
  return facePromise;
}

let detrPromise = null;
function getObjectDetector(onProgress) {
  if (detrPromise) return detrPromise;
  detrPromise = (async () => {
    const lib = await import('@huggingface/transformers');
    lib.env.allowLocalModels = false;
    let device = 'wasm';
    try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) device = 'webgpu'; } catch { /* wasm */ }
    return lib.pipeline('object-detection', 'Xenova/detr-resnet-50', { device, progress_callback: onProgress });
  })().catch((e) => { detrPromise = null; throw e; });
  return detrPromise;
}

const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x); const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w); const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

function canvasOf(img, sx, sy, sw, sh, maxSide) {
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { canvas: c, scale: s };
}

// BlazeFace short-range видит лица, занимающие заметную часть кадра. Чтобы ловить и
// мелкие лица на групповых фото, прогоняем ещё сетку перекрывающихся тайлов и
// склеиваем результаты через NMS.
async function detectFaces(img) {
  const det = await getFaceDetector();
  const W = img.naturalWidth; const H = img.naturalHeight;
  const regions = [[0, 0, W, H]];
  if (Math.max(W, H) > 900) {
    const n = Math.max(W, H) > 2400 ? 3 : 2;
    const tw = W / n; const th = H / n;
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const x = Math.max(0, ix * tw - tw * 0.2); const y = Math.max(0, iy * th - th * 0.2);
        regions.push([x, y, Math.min(W - x, tw * 1.4), Math.min(H - y, th * 1.4)]);
      }
    }
  }
  const faces = [];
  for (const [rx, ry, rw, rh] of regions) {
    const { canvas, scale } = canvasOf(img, rx, ry, rw, rh, 1024);
    const res = det.detect(canvas);
    (res.detections || []).forEach((d) => {
      const b = d.boundingBox;
      faces.push({
        x: rx + b.originX / scale, y: ry + b.originY / scale, w: b.width / scale, h: b.height / scale,
        score: d.categories?.[0]?.score ?? 0.5,
      });
    });
  }
  faces.sort((a, b) => b.score - a.score);
  const kept = [];
  faces.forEach((f) => { if (kept.every((k) => iou(k, f) < 0.3)) kept.push(f); });
  return kept;
}

async function detectObjects(url, onProgress) {
  const det = await getObjectDetector(onProgress);
  const out = await det(url, { threshold: 0.6 });
  return out.map((d) => ({
    x: d.box.xmin, y: d.box.ymin, w: d.box.xmax - d.box.xmin, h: d.box.ymax - d.box.ymin, label: d.label, score: d.score,
  }));
}

// Анализ одного изображения: лица + объекты. Любой из детекторов может не
// загрузиться (сеть, старый браузер) — тогда кадрируем по одной saliency.
export async function analyzeImage(img, url, { objects = true, onProgress } = {}) {
  const [faces, objs] = await Promise.all([
    detectFaces(img).catch((e) => { console.warn('faces', e); return []; }),
    objects ? detectObjects(url, onProgress).catch((e) => { console.warn('objects', e); return []; }) : [],
  ]);
  return { faces, objects: objs };
}

export function preloadModels({ objects = true, onProgress } = {}) {
  return Promise.allSettled([getFaceDetector(), objects ? getObjectDetector(onProgress) : null]);
}

const union = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};
// Бокс лица от детектора плотный (брови–подбородок): расширяем до головы с волосами.
const headOf = (f) => ({ x: f.x - f.w * 0.3, y: f.y - f.h * 0.55, w: f.w * 1.6, h: f.h * 1.85 });
const clampBox = (b, W, H) => ({
  x: Math.max(0, Math.min(W - b.w, b.x)), y: Math.max(0, Math.min(H - b.h, b.y)), w: b.w, h: b.h,
});

// Максимальная рамка пропорции ar, помещающаяся в W×H.
function maxFrame(W, H, ar) {
  return W / H > ar ? { w: H * ar, h: H } : { w: W, h: W / ar };
}

// Растягиваем/сдвигаем рамку так, чтобы она целиком вмещала req (если может).
function ensureContains(crop, req, W, H, ar) {
  let { x, y, w, h } = crop;
  const need = Math.max(req.w, req.h * ar);
  if (w < need) {
    const max = maxFrame(W, H, ar);
    const nw = Math.min(max.w, need); const nh = nw / ar;
    x -= (nw - w) / 2; y -= (nh - h) / 2; w = nw; h = nh;
  }
  if (req.w <= w) { if (req.x < x) x = req.x; if (req.x + req.w > x + w) x = req.x + req.w - w; }
  if (req.h <= h) { if (req.y < y) y = req.y; if (req.y + req.h > y + h) y = req.y + req.h - h; }
  return clampBox({ x, y, w, h }, W, H);
}

export async function computeCrop(img, subjects, aspect) {
  const W = img.naturalWidth; const H = img.naturalHeight;
  const ar = aspect.w / aspect.h;
  const faces = subjects?.faces || [];
  const objects = subjects?.objects || [];
  const persons = objects.filter((o) => o.label === 'person');

  // Аватар: квадрат вокруг самого крупного лица, голова ~45% кадра, чуть выше центра.
  if (aspect.circle && faces.length) {
    const f = faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    const size = Math.min(W, H, Math.max(f.w, f.h) * 2.5);
    const cx = f.x + f.w / 2; const cy = f.y + f.h * 0.45;
    return clampBox({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, W, H);
  }

  const boost = [
    ...faces.map((f) => ({ ...headOf(f), weight: 1 })),
    ...persons.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h * 0.45, weight: 0.6 })),
    ...objects.filter((o) => o.label !== 'person').map((o) => ({ ...o, weight: 0.4 })),
  ].map((b) => ({ x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(W, b.w), height: Math.min(H, b.h), weight: b.weight }));

  const mod = await import('smartcrop');
  const smartcrop = mod.default?.crop ? mod.default : (mod.smartcrop || mod);
  const res = await smartcrop.crop(img, {
    width: Math.round(aspect.w * 100), height: Math.round(aspect.h * 100),
    minScale: aspect.circle ? 0.5 : 0.7, boost,
  });
  let crop = { x: res.topCrop.x, y: res.topCrop.y, w: res.topCrop.width, h: res.topCrop.height };

  // Жёсткие ограничения: сначала все головы, иначе — хотя бы главная; без лиц —
  // верх человека (голова/плечи), чтобы не отрезать голову.
  const heads = faces.map(headOf);
  const reqs = [];
  if (heads.length) { reqs.push(union(heads)); reqs.push(headOf(faces[0])); } else if (persons.length) {
    const p = persons.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    reqs.push({ x: p.x, y: p.y, w: p.w, h: p.h * 0.35 });
  }
  const max = maxFrame(W, H, ar);
  for (const req of reqs) {
    if (req.w <= max.w && req.h <= max.h) { crop = ensureContains(crop, req, W, H, ar); break; }
  }
  return clampBox(crop, W, H);
}

// Рендер кропа в canvas (длинная сторона ≤ maxSide), круг — с прозрачными углами.
export function renderCrop(img, crop, { circle = false, maxSide = 2048 } = {}) {
  const s = Math.min(1, maxSide / Math.max(crop.w, crop.h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(crop.w * s)); out.height = Math.max(1, Math.round(crop.h * s));
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (circle) {
    ctx.beginPath(); ctx.arc(out.width / 2, out.height / 2, out.width / 2, 0, Math.PI * 2); ctx.clip();
  }
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  return out;
}

export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}
