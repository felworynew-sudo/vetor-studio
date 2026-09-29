import { fbm, makeSimplex } from './noise';

// Процедурный рельеф: fBm/ridged simplex + domain warp + «остров» (радиальный спад)
// + гидравлическая эрозия каплями (упрощённый алгоритм Hans Beyer / S. Lague).

export function generateHeight(size, o) {
  const noise = makeSimplex(o.seed);
  const warpNoise = makeSimplex(o.seed + 97);
  const H = new Float32Array(size * size);
  const sc = o.scale / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let px = x * sc; let py = y * sc;
      if (o.warp > 0) {
        px += (fbm(warpNoise, px * 0.7, py * 0.7, { octaves: 3 }) - 0.5) * o.warp * 2;
        py += (fbm(warpNoise, px * 0.7 + 31.4, py * 0.7 + 7.1, { octaves: 3 }) - 0.5) * o.warp * 2;
      }
      const smooth = fbm(noise, px, py, { octaves: o.octaves, gain: o.gain });
      const ridge = o.ridged > 0 ? fbm(noise, px + 100, py + 100, { octaves: o.octaves, gain: o.gain, ridged: true }) : 0;
      let h = smooth * (1 - o.ridged) + ridge * o.ridged;
      if (o.island > 0) {
        const dx = x / size - 0.5; const dy = y / size - 0.5;
        const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
        h *= 1 - o.island * d ** 2.2;
      }
      H[y * size + x] = h;
    }
  }
  normalize(H);
  return H;
}

export function normalize(H) {
  let mn = Infinity; let mx = -Infinity;
  for (let i = 0; i < H.length; i += 1) { if (H[i] < mn) mn = H[i]; if (H[i] > mx) mx = H[i]; }
  const r = mx - mn || 1;
  for (let i = 0; i < H.length; i += 1) H[i] = (H[i] - mn) / r;
}

// Эрозия каплями. Возвращает промис; onProgress(0..1). Работает порциями, не блокируя UI.
export async function erode(H, size, droplets, onProgress, seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const inertia = 0.05; const capacityK = 4; const minSlope = 0.01; const deposit = 0.3; const erodeK = 0.3; const evap = 0.02; const gravity = 4; const maxLife = 30;
  const radius = 2;
  const heightGrad = (x, y) => {
    const ix = Math.floor(x); const iy = Math.floor(y); const fx = x - ix; const fy = y - iy;
    const i = iy * size + ix;
    const nw = H[i]; const ne = H[i + 1]; const sw = H[i + size]; const se = H[i + size + 1];
    return {
      h: nw * (1 - fx) * (1 - fy) + ne * fx * (1 - fy) + sw * (1 - fx) * fy + se * fx * fy,
      gx: (ne - nw) * (1 - fy) + (se - sw) * fy,
      gy: (sw - nw) * (1 - fx) + (se - ne) * fx,
    };
  };
  const chunk = 4000;
  for (let d = 0; d < droplets; d += 1) {
    let x = rnd() * (size - 2); let y = rnd() * (size - 2);
    let dx = 0; let dy = 0; let speed = 1; let water = 1; let sediment = 0;
    for (let life = 0; life < maxLife; life += 1) {
      const ix = Math.floor(x); const iy = Math.floor(y);
      const fx = x - ix; const fy = y - iy;
      const g = heightGrad(x, y);
      dx = dx * inertia - g.gx * (1 - inertia); dy = dy * inertia - g.gy * (1 - inertia);
      const len = Math.hypot(dx, dy); if (len < 1e-9) break;
      dx /= len; dy /= len;
      x += dx; y += dy;
      if (x < 0 || y < 0 || x >= size - 2 || y >= size - 2) break;
      const nh = heightGrad(x, y).h; const dh = nh - g.h;
      const cap = Math.max(-dh, minSlope) * speed * water * capacityK;
      const i = iy * size + ix;
      if (sediment > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * deposit;
        sediment -= amt;
        H[i] += amt * (1 - fx) * (1 - fy); H[i + 1] += amt * fx * (1 - fy); H[i + size] += amt * (1 - fx) * fy; H[i + size + 1] += amt * fx * fy;
      } else {
        const amt = Math.min((cap - sediment) * erodeK, -dh);
        // Размываем в небольшом радиусе — меньше «оспин».
        let wsum = 0; const cells = [];
        for (let oy = -radius; oy <= radius; oy += 1) {
          for (let ox = -radius; ox <= radius; ox += 1) {
            const cx = ix + ox; const cy = iy + oy;
            if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue; // eslint-disable-line no-continue
            const w = Math.max(0, radius - Math.hypot(ox, oy)); if (!w) continue; // eslint-disable-line no-continue
            cells.push([cy * size + cx, w]); wsum += w;
          }
        }
        for (const [ci, w] of cells) { const e = Math.min(H[ci], amt * (w / wsum)); H[ci] -= e; sediment += e; }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * -gravity)) || 0.01;
      water *= 1 - evap;
    }
    if (d % chunk === 0) { onProgress?.(d / droplets); await new Promise((r) => setTimeout(r, 0)); } // eslint-disable-line no-await-in-loop
  }
  onProgress?.(1);
}

// Цветная карта по высоте с уровнем воды и затенением по склону.
export function colorize(H, size, waterLevel, light = true) {
  const img = new ImageData(size, size);
  const land = [[0, [214, 196, 140]], [0.06, [96, 150, 72]], [0.35, [58, 110, 52]], [0.6, [112, 98, 84]], [0.8, [150, 142, 136]], [0.9, [240, 242, 245]]];
  const lerp = (stops, t) => {
    for (let k = 0; k < stops.length - 1; k += 1) {
      if (t <= stops[k + 1][0]) { const f = (t - stops[k][0]) / (stops[k + 1][0] - stops[k][0] || 1); return stops[k][1].map((c, i) => c + (stops[k + 1][1][i] - c) * f); }
    }
    return stops[stops.length - 1][1];
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x; const h = H[i];
      let c;
      if (h < waterLevel) { const t = h / (waterLevel || 1); c = [16 + 40 * t, 40 + 80 * t, 80 + 90 * t]; }
      else c = lerp(land, (h - waterLevel) / (1 - waterLevel || 1));
      if (light && h >= waterLevel) {
        const hx = H[y * size + Math.min(size - 1, x + 1)] - H[y * size + Math.max(0, x - 1)];
        const hy = H[Math.min(size - 1, y + 1) * size + x] - H[Math.max(0, y - 1) * size + x];
        const shade = Math.max(0.55, Math.min(1.25, 1 - (hx - hy) * size * 0.6));
        c = c.map((v) => v * shade);
      }
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
  }
  return img;
}
