// Content-aware fill: многомасштабный PatchMatch (Barnes et al., 2009) + голосование
// патчей (Wexler et al., 2007) — тот же принцип, что у «Заливки с учётом содержимого».
// Вход: RGB Float32 (w*h*3), маска Uint8 (1 — дыра). Выход: RGB с заполненной дырой.

const R = 3; // радиус патча → 7×7

function downsample(img, mask, w, h) {
  const W = Math.max(1, w >> 1); const H = Math.max(1, h >> 1);
  const o = new Float32Array(W * H * 3); const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let hole = 0; const acc = [0, 0, 0]; let n = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = Math.min(w - 1, x * 2 + dx); const sy = Math.min(h - 1, y * 2 + dy); const i = sy * w + sx;
          if (mask[i]) hole = 1; else { acc[0] += img[i * 3]; acc[1] += img[i * 3 + 1]; acc[2] += img[i * 3 + 2]; n += 1; }
        }
      }
      const j = y * W + x; m[j] = hole;
      if (n) { o[j * 3] = acc[0] / n; o[j * 3 + 1] = acc[1] / n; o[j * 3 + 2] = acc[2] / n; }
    }
  }
  return { img: o, mask: m, w: W, h: H };
}

// Грубое начальное заполнение: «луковая шелуха» — средним из известных соседей.
function onionFill(img, mask, w, h) {
  const known = new Uint8Array(w * h); for (let i = 0; i < w * h; i += 1) known[i] = mask[i] ? 0 : 1;
  let left = mask.reduce((s, v) => s + v, 0); let guard = 0;
  while (left > 0 && guard < w + h) {
    guard += 1; const add = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x; if (known[i]) continue; // eslint-disable-line no-continue
        let n = 0; const a = [0, 0, 0];
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx; const yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; // eslint-disable-line no-continue
          const j = yy * w + xx; if (known[j]) { a[0] += img[j * 3]; a[1] += img[j * 3 + 1]; a[2] += img[j * 3 + 2]; n += 1; }
        }
        if (n) add.push([i, a[0] / n, a[1] / n, a[2] / n]);
      }
    }
    if (!add.length) break;
    add.forEach(([i, r, g, b]) => { img[i * 3] = r; img[i * 3 + 1] = g; img[i * 3 + 2] = b; known[i] = 1; left -= 1; });
  }
}

function solveLevel(img, mask, w, h, nnf, iters, rnd) {
  // Допустимые центры-источники: патч целиком вне дыры и внутри кадра.
  const valid = new Uint8Array(w * h); const sources = [];
  const blocked = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (mask[y * w + x]) {
    for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) { const xx = x + dx; const yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) blocked[yy * w + xx] = 1; }
  }
  for (let y = R; y < h - R; y += 1) for (let x = R; x < w - R; x += 1) { const i = y * w + x; if (!blocked[i]) { valid[i] = 1; sources.push(i); } }
  if (!sources.length) return nnf;
  // Цели: центры патчей, задевающих дыру (дыра, расширенная на R), не у самого края.
  const targets = [];
  for (let y = R; y < h - R; y += 1) for (let x = R; x < w - R; x += 1) if (blocked[y * w + x]) targets.push(y * w + x);
  const tIndex = new Int32Array(w * h).fill(-1); targets.forEach((t, k) => { tIndex[t] = k; });
  const nn = new Int32Array(targets.length); const dist = new Float32Array(targets.length);
  const dPatch = (t, s, best) => {
    const tx = t % w; const ty = (t / w) | 0; const sx = s % w; const sy = (s / w) | 0; let d = 0;
    for (let dy = -R; dy <= R; dy += 1) {
      let ti = ((ty + dy) * w + tx - R) * 3; let si = ((sy + dy) * w + sx - R) * 3;
      for (let dx = -R; dx <= R; dx += 1) {
        const a = img[ti] - img[si]; const b = img[ti + 1] - img[si + 1]; const c = img[ti + 2] - img[si + 2];
        d += a * a + b * b + c * c; ti += 3; si += 3;
      }
      if (d > best) return d;
    }
    return d;
  };
  targets.forEach((t, k) => {
    let s = nnf ? nnf.get(t) : -1;
    if (s == null || s < 0 || !valid[s]) s = sources[Math.floor(rnd() * sources.length)];
    nn[k] = s; dist[k] = dPatch(t, s, Infinity);
  });
  const tryS = (k, t, s) => { if (s < 0 || s >= w * h || !valid[s]) return; const d = dPatch(t, s, dist[k]); if (d < dist[k]) { dist[k] = d; nn[k] = s; } };
  for (let it = 0; it < iters; it += 1) {
    // PatchMatch: распространение и случайный поиск.
    for (let pass = 0; pass < 2; pass += 1) {
      const rev = pass === 1; const step = rev ? 1 : -1;
      for (let q = 0; q < targets.length; q += 1) {
        const k = rev ? targets.length - 1 - q : q; const t = targets[k];
        const left = t + step; const up = t + step * w;
        if (tIndex[left] >= 0) tryS(k, t, nn[tIndex[left]] - step);
        if (tIndex[up] >= 0) tryS(k, t, nn[tIndex[up]] - step * w);
        let rad = Math.max(w, h);
        const bx = nn[k] % w; const by = (nn[k] / w) | 0;
        while (rad >= 1) {
          const cx = Math.round(bx + (rnd() * 2 - 1) * rad); const cy = Math.round(by + (rnd() * 2 - 1) * rad);
          if (cx >= R && cy >= R && cx < w - R && cy < h - R) tryS(k, t, cy * w + cx);
          rad >>= 1;
        }
      }
    }
    // Голосование: каждый пиксель дыры — взвешенное среднее из всех покрывающих его патчей.
    const acc = new Float32Array(w * h * 4);
    const sig = Math.max(1e-3, [...dist].sort((a, b) => a - b)[Math.floor(dist.length * 0.75)] || 1);
    for (let k = 0; k < targets.length; k += 1) {
      const t = targets[k]; const s = nn[k]; const wt = Math.exp(-dist[k] / (2 * sig)) + 1e-6;
      const tx = t % w; const ty = (t / w) | 0; const sx = s % w; const sy = (s / w) | 0;
      for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) {
        const p = (ty + dy) * w + tx + dx; if (!mask[p]) continue; // eslint-disable-line no-continue
        const sp = ((sy + dy) * w + sx + dx) * 3;
        acc[p * 4] += img[sp] * wt; acc[p * 4 + 1] += img[sp + 1] * wt; acc[p * 4 + 2] += img[sp + 2] * wt; acc[p * 4 + 3] += wt;
      }
    }
    for (let p = 0; p < w * h; p += 1) if (mask[p] && acc[p * 4 + 3] > 0) { img[p * 3] = acc[p * 4] / acc[p * 4 + 3]; img[p * 3 + 1] = acc[p * 4 + 1] / acc[p * 4 + 3]; img[p * 3 + 2] = acc[p * 4 + 2] / acc[p * 4 + 3]; }
    for (let k = 0; k < targets.length; k += 1) dist[k] = dPatch(targets[k], nn[k], Infinity);
  }
  const out = new Map(); targets.forEach((t, k) => out.set(t, nn[k]));
  return out;
}

export function inpaint(rgb, mask, w, h, { onProgress, seed = 7 } = {}) {
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const levels = [{ img: rgb, mask, w, h }];
  while (Math.min(levels[levels.length - 1].w, levels[levels.length - 1].h) > 48 && levels.length < 8) {
    const L = levels[levels.length - 1]; levels.push(downsample(L.img, L.mask, L.w, L.h));
  }
  const top = levels[levels.length - 1];
  onionFill(top.img, top.mask, top.w, top.h);
  let nnf = null;
  for (let li = levels.length - 1; li >= 0; li -= 1) {
    const L = levels[li];
    if (li < levels.length - 1) {
      // Апсэмпл: дыра этого уровня ← результат грубого уровня (билинейно), NNF ×2.
      const C = levels[li + 1];
      for (let y = 0; y < L.h; y += 1) for (let x = 0; x < L.w; x += 1) {
        const i = y * L.w + x; if (!L.mask[i]) continue; // eslint-disable-line no-continue
        const cx = Math.min(C.w - 1, x / 2); const cy = Math.min(C.h - 1, y / 2);
        const x0 = Math.floor(cx); const y0 = Math.floor(cy); const x1 = Math.min(C.w - 1, x0 + 1); const y1 = Math.min(C.h - 1, y0 + 1); const fx = cx - x0; const fy = cy - y0;
        for (let c = 0; c < 3; c += 1) {
          L.img[i * 3 + c] = (C.img[(y0 * C.w + x0) * 3 + c] * (1 - fx) + C.img[(y0 * C.w + x1) * 3 + c] * fx) * (1 - fy) + (C.img[(y1 * C.w + x0) * 3 + c] * (1 - fx) + C.img[(y1 * C.w + x1) * 3 + c] * fx) * fy;
        }
      }
      const up = new Map();
      if (nnf) nnf.forEach((src, t) => {
        const tx = (t % C.w) * 2; const ty = Math.floor(t / C.w) * 2; const sx = (src % C.w) * 2; const sy = Math.floor(src / C.w) * 2;
        for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) up.set((ty + dy) * L.w + tx + dx, (sy + dy) * L.w + sx + dx);
      });
      nnf = up;
    }
    nnf = solveLevel(L.img, L.mask, L.w, L.h, nnf, li === levels.length - 1 ? 10 : li === 0 ? 3 : 5, rnd);
    onProgress?.(1 - li / levels.length);
  }
  return levels[0].img;
}
