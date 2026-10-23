// Чистая математика реставрации фото — без DOM и onnxruntime, поэтому проверяется в node
// (scripts/test-photo-restore.mjs). Порядок и формулы повторяют эталонный Python-конвейер restore-lab:
// детектор лиц YuNet (декодирование + NMS), выравнивание лица по шаблону FFHQ-512, плитки с окном Ханна,
// подгонка цвета в Lab.

// ---------- детектор лиц YuNet (MIT, 232 КБ) ----------

export const YUNET_SIZE = 640;
// Пять точек шаблона выровненного лица 512×512 (как у GFPGAN/RestoreFormer): глаза, нос, углы рта.
export const TEMPLATE_512 = [[192.98, 239.95], [318.9, 240.19], [256.63, 314.01], [201.26, 371.41], [313.09, 371.15]];

// boxes — [x, y, w, h]; возвращает индексы оставшихся рамок по убыванию уверенности.
export function nms(boxes, scores, thr) {
  const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
  const keep = [];
  while (order.length) {
    const i = order.shift();
    keep.push(i);
    const bi = boxes[i];
    for (let k = order.length - 1; k >= 0; k -= 1) {
      const bj = boxes[order[k]];
      const iw = Math.min(bi[0] + bi[2], bj[0] + bj[2]) - Math.max(bi[0], bj[0]);
      const ih = Math.min(bi[1] + bi[3], bj[1] + bj[3]) - Math.max(bi[1], bj[1]);
      const inter = Math.max(0, iw) * Math.max(0, ih);
      const union = bi[2] * bi[3] + bj[2] * bj[3] - inter;
      if (inter / (union + 1e-9) > thr) order.splice(k, 1);
    }
  }
  return keep;
}

// out — 12 выходов YuNet по порядку: cls8/16/32, obj8/16/32, bbox8/16/32, kps8/16/32 (Float32Array).
// Возвращает лица в координатах входа 640×640: { box:[x,y,w,h], score, kps:[[x,y]×5] }.
export function decodeYunet(out, { scoreThr = 0.6, nmsThr = 0.3, size = YUNET_SIZE } = {}) {
  const found = [];
  [8, 16, 32].forEach((stride, lvl) => {
    const n = size / stride;
    const cls = out[lvl]; const obj = out[3 + lvl]; const bbox = out[6 + lvl]; const kps = out[9 + lvl];
    for (let i = 0; i < n * n; i += 1) {
      const c = Math.min(1, Math.max(0, cls[i])); const o = Math.min(1, Math.max(0, obj[i]));
      const s = Math.sqrt(c * o);
      if (s < scoreThr) continue; // eslint-disable-line no-continue
      const r = Math.floor(i / n); const col = i % n;
      const cx = (col + bbox[i * 4]) * stride; const cy = (r + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride; const h = Math.exp(bbox[i * 4 + 3]) * stride;
      const pts = [];
      for (let j = 0; j < 5; j += 1) pts.push([(kps[i * 10 + 2 * j] + col) * stride, (kps[i * 10 + 2 * j + 1] + r) * stride]);
      found.push({ box: [cx - w / 2, cy - h / 2, w, h], score: s, kps: pts });
    }
  });
  const keep = nms(found.map((f) => f.box), found.map((f) => f.score), nmsThr);
  return keep.map((k) => found[k]);
}

// Вписывание произвольного кадра в 640×640 слева-сверху: масштаб k, чтобы вернуть координаты обратно.
export function yunetScale(w, h) {
  const k = YUNET_SIZE / Math.max(w, h);
  return { k, nw: Math.max(1, Math.round(w * k)), nh: Math.max(1, Math.round(h * k)) };
}

export function scaleFace(f, k) {
  return { box: f.box.map((v) => v / k), score: f.score, kps: f.kps.map(([x, y]) => [x / k, y / k]) };
}

// ---------- выравнивание ----------

// Подобие (поворот + масштаб + сдвиг) по МНК: x' = a·x − b·y + tx, y' = b·x + a·y + ty.
export function similarity(src, dst) {
  const n = src.length;
  let msx = 0; let msy = 0; let mdx = 0; let mdy = 0;
  src.forEach(([x, y], i) => { msx += x; msy += y; mdx += dst[i][0]; mdy += dst[i][1]; });
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let na = 0; let nb = 0; let den = 0;
  src.forEach(([x, y], i) => {
    const sx = x - msx; const sy = y - msy; const dx = dst[i][0] - mdx; const dy = dst[i][1] - mdy;
    na += sx * dx + sy * dy; nb += sx * dy - sy * dx; den += sx * sx + sy * sy;
  });
  const a = na / den; const b = nb / den;
  return { a, b, tx: mdx - (a * msx - b * msy), ty: mdy - (b * msx + a * msy) };
}

export function invertSimilarity({ a, b, tx, ty }) {
  const d = a * a + b * b;
  const ia = a / d; const ib = -b / d;
  return { a: ia, b: ib, tx: -(ia * tx - ib * ty), ty: -(ib * tx + ia * ty) };
}

export const applySimilarity = ({ a, b, tx, ty }, [x, y]) => [a * x - b * y + tx, b * x + a * y + ty];

// Матрица для CanvasRenderingContext2D.setTransform(a, b, c, d, e, f) из подобия.
export const canvasMatrix = ({ a, b, tx, ty }) => [a, b, -b, a, tx, ty];

// Подобие «кадр → выровненный кроп size×size».
export function faceToCrop(kps, size = 512) {
  const k = size / 512;
  return similarity(kps, TEMPLATE_512.map(([x, y]) => [x * k, y * k]));
}

// Насколько далеко за границы кадра выходит кроп (в пикселях кадра) — столько надо дополнить отражением.
export function overhang(m, size, w, h) {
  const inv = invertSimilarity(m);
  let need = 0;
  [[0, 0], [size, 0], [0, size], [size, size]].forEach((c) => {
    const [x, y] = applySimilarity(inv, c);
    need = Math.max(need, -x, -y, x - w, y - h);
  });
  return Math.max(0, Math.ceil(need));
}

// Мягкая маска вклейки лица: 1 в центре, плавно к нулю у краёв кропа (alpha 0..255).
export function featherMask(size, frac = 0.18) {
  const out = new Uint8Array(size * size);
  const k = size * frac;
  const sm = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.min(x + 0.5, y + 0.5, size - x - 0.5, size - y - 0.5);
      out[y * size + x] = Math.round(255 * sm((d - 0.4 * k) / (1.2 * k)));
    }
  }
  return out;
}

// ---------- плитки ----------

// Окно Ханна по краям плитки: перекрытия смешиваются без швов.
export function tileWindow(h, w, overlap) {
  const ramp = (n) => {
    const r = new Float32Array(n).fill(1);
    const k = Math.min(overlap, n >> 1);
    for (let i = 0; i < k; i += 1) {
      const s = 0.5 - 0.5 * Math.cos(Math.PI * ((i + 0.5) / k));
      r[i] = Math.min(r[i], s); r[n - 1 - i] = Math.min(r[n - 1 - i], s);
    }
    return r;
  };
  const ry = ramp(h); const rx = ramp(w);
  const o = new Float32Array(h * w);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) o[y * w + x] = ry[y] * rx[x];
  return o;
}

export function planTiles(w, h, tile, overlap, mult = 16) {
  const step = Math.max(mult, tile - 2 * overlap);
  const axis = (n) => {
    if (n <= tile) return [0];
    const a = [];
    for (let p = 0; p < n - tile + step; p += step) a.push(Math.min(p, n - tile));
    return [...new Set(a)];
  };
  const tiles = [];
  axis(h).forEach((y0) => axis(w).forEach((x0) => tiles.push({ x0, y0, tw: Math.min(tile, w), th: Math.min(tile, h) })));
  return tiles;
}

const reflect = (i, n) => {
  if (n === 1) return 0;
  let k = i;
  while (k < 0 || k >= n) k = k < 0 ? -k : 2 * (n - 1) - k;
  return k;
};

// Кусок CHW-картинки, дополненный отражением до кратного mult.
export function extractPatch(chw, c, w, h, x0, y0, tw, th, mult = 16) {
  const pw = tw + ((mult - (tw % mult)) % mult); const ph = th + ((mult - (th % mult)) % mult);
  const out = new Float32Array(c * ph * pw);
  for (let ch = 0; ch < c; ch += 1) {
    for (let y = 0; y < ph; y += 1) {
      const yy = y0 + reflect(y, th); // дополнение — зеркало относительно границы самого куска (как np.pad reflect)
      for (let x = 0; x < pw; x += 1) {
        const xx = x0 + reflect(x, tw);
        out[ch * ph * pw + y * pw + x] = chw[ch * h * w + yy * w + xx];
      }
    }
  }
  return { data: out, pw, ph };
}

// run(patch, pw, ph) -> { имя: { data: Float32Array(c·ph·pw), c } }; результат собирается в картинку той же высоты/ширины.
export async function tileApply(run, chw, c, w, h, { tile = 512, overlap = 48, mult = 16, shouldStop, onProgress } = {}) {
  const tiles = planTiles(w, h, tile, overlap, mult);
  const acc = {}; const wsum = new Float32Array(w * h);
  for (let t = 0; t < tiles.length; t += 1) {
    if (shouldStop?.()) throw new Error('stopped');
    const { x0, y0, tw, th } = tiles[t];
    const { data, pw, ph } = extractPatch(chw, c, w, h, x0, y0, tw, th, mult);
    const res = await run(data, pw, ph); // eslint-disable-line no-await-in-loop
    const win = tileWindow(th, tw, overlap);
    Object.entries(res).forEach(([name, { data: d, c: oc }]) => {
      if (!acc[name]) acc[name] = { data: new Float32Array(oc * w * h), c: oc };
      const a = acc[name].data;
      for (let ch = 0; ch < oc; ch += 1) {
        for (let y = 0; y < th; y += 1) {
          for (let x = 0; x < tw; x += 1) a[ch * w * h + (y0 + y) * w + x0 + x] += d[ch * ph * pw + y * pw + x] * win[y * tw + x];
        }
      }
    });
    for (let y = 0; y < th; y += 1) for (let x = 0; x < tw; x += 1) wsum[(y0 + y) * w + x0 + x] += win[y * tw + x];
    onProgress?.((t + 1) / tiles.length);
  }
  Object.values(acc).forEach(({ data, c: oc }) => {
    for (let ch = 0; ch < oc; ch += 1) for (let i = 0; i < w * h; i += 1) data[ch * w * h + i] /= Math.max(wsum[i], 1e-6);
  });
  return acc;
}

// ---------- цвет (Lab, D65) ----------

const M = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]];
const MI = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
const WP = [0.95047, 1.0, 1.08883];
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const fwd = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const inv = (f) => (f ** 3 > 0.008856 ? f ** 3 : (f - 16 / 116) / 7.787);

// rgb: Float32Array(3·n) чересстрочно [0,1] → L (0..1) и ab (−1..1, т.е. Lab/110)
export function rgbToLab(rgb) {
  const n = rgb.length / 3; const L = new Float32Array(n); const ab = new Float32Array(2 * n);
  for (let i = 0; i < n; i += 1) {
    const r = toLin(Math.min(1, Math.max(0, rgb[i * 3]))); const g = toLin(Math.min(1, Math.max(0, rgb[i * 3 + 1]))); const b = toLin(Math.min(1, Math.max(0, rgb[i * 3 + 2])));
    const fx = fwd((M[0][0] * r + M[0][1] * g + M[0][2] * b) / WP[0]);
    const fy = fwd((M[1][0] * r + M[1][1] * g + M[1][2] * b) / WP[1]);
    const fz = fwd((M[2][0] * r + M[2][1] * g + M[2][2] * b) / WP[2]);
    L[i] = (116 * fy - 16) / 100; ab[i * 2] = (500 * (fx - fy)) / 110; ab[i * 2 + 1] = (200 * (fy - fz)) / 110;
  }
  return { L, ab };
}

export function labToRgb(L, ab) {
  const n = L.length; const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i += 1) {
    const fy = (L[i] * 100 + 16) / 116; const fx = (ab[i * 2] * 110) / 500 + fy; const fz = fy - (ab[i * 2 + 1] * 110) / 200;
    const x = inv(fx) * WP[0]; const y = inv(fy) * WP[1]; const z = inv(fz) * WP[2];
    for (let c = 0; c < 3; c += 1) out[i * 3 + c] = Math.min(1, Math.max(0, fromLin(Math.max(0, MI[c][0] * x + MI[c][1] * y + MI[c][2] * z))));
  }
  return out;
}

// Подгоняем среднее/разброс цветности (ab) восстановленного лица под исходное — вклейка без цветной рамки.
export function matchColor(dst, ref) {
  const a = rgbToLab(dst); const b = rgbToLab(ref); const n = a.L.length;
  const stat = (ab) => {
    const m = [0, 0]; for (let i = 0; i < n; i += 1) { m[0] += ab[i * 2]; m[1] += ab[i * 2 + 1]; }
    m[0] /= n; m[1] /= n;
    const s = [0, 0]; for (let i = 0; i < n; i += 1) { s[0] += (ab[i * 2] - m[0]) ** 2; s[1] += (ab[i * 2 + 1] - m[1]) ** 2; }
    return { m, s: [Math.sqrt(s[0] / n), Math.sqrt(s[1] / n)] };
  };
  const sa = stat(a.ab); const sb = stat(b.ab);
  const ab = new Float32Array(2 * n);
  for (let i = 0; i < n; i += 1) {
    for (let c = 0; c < 2; c += 1) ab[i * 2 + c] = ((a.ab[i * 2 + c] - sa.m[c]) / (sa.s[c] + 1e-4)) * sb.s[c] + sb.m[c];
  }
  return labToRgb(a.L, ab);
}

// Серая ли картинка (чёрно-белое фото): средний модуль цветности на прореженной сетке.
export function isGrayscale(rgb, w, h, thr = 0.012) {
  const pick = [];
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) pick.push(y * w + x);
  const sample = new Float32Array(pick.length * 3);
  pick.forEach((p, i) => { sample[i * 3] = rgb[p * 3]; sample[i * 3 + 1] = rgb[p * 3 + 1]; sample[i * 3 + 2] = rgb[p * 3 + 2]; });
  const { ab } = rgbToLab(sample);
  let s = 0; for (let i = 0; i < ab.length; i += 1) s += Math.abs(ab[i]);
  return s / ab.length < thr;
}
