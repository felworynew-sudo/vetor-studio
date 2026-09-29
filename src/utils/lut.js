// 3D LUT: генерация, разбор и применение файлов .cube (Adobe/Resolve) и .3dl.
// Цвет — тройка 0..1. Применение — трилинейная интерполяция.

// Сэмплируем произвольное цветовое преобразование fn([r,g,b]) → [r,g,b] (0..1) в куб.
export function buildLut(fn, size = 33) {
  const data = new Float32Array(size * size * size * 3);
  let i = 0;
  // Порядок .cube: R меняется быстрее всех, затем G, затем B.
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const out = fn([r / (size - 1), g / (size - 1), b / (size - 1)]);
        data[i] = out[0]; data[i + 1] = out[1]; data[i + 2] = out[2]; i += 3;
      }
    }
  }
  return { size, data, title: 'Vetor LUT' };
}

export function writeCube(lut, title = lut.title || 'Vetor LUT') {
  const lines = [`TITLE "${title.replace(/"/g, '')}"`, '# Created with Vetor Studio (vetor-studio.ru)', `LUT_3D_SIZE ${lut.size}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0'];
  const d = lut.data;
  for (let i = 0; i < d.length; i += 3) lines.push(`${d[i].toFixed(6)} ${d[i + 1].toFixed(6)} ${d[i + 2].toFixed(6)}`);
  return `${lines.join('\n')}\n`;
}

// .3dl (Autodesk/Lustre): целые 0..(2^bits-1), порядок — B меняется быстрее всех.
export function write3dl(lut, bits = 12) {
  const max = 2 ** bits - 1; const n = lut.size;
  const shaper = Array.from({ length: n }, (_, i) => Math.round((i / (n - 1)) * 1023)).join(' ');
  const lines = [shaper];
  for (let r = 0; r < n; r += 1) {
    for (let g = 0; g < n; g += 1) {
      for (let b = 0; b < n; b += 1) {
        const i = ((b * n + g) * n + r) * 3;
        lines.push(`${Math.round(lut.data[i] * max)} ${Math.round(lut.data[i + 1] * max)} ${Math.round(lut.data[i + 2] * max)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

export function parseCube(text) {
  let size = 0; let title = 'LUT'; const vals = [];
  let dmin = [0, 0, 0]; let dmax = [1, 1, 1];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue; // eslint-disable-line no-continue
    if (/^TITLE/i.test(line)) { title = line.replace(/^TITLE\s*/i, '').replace(/"/g, ''); continue; } // eslint-disable-line no-continue
    if (/^LUT_3D_SIZE/i.test(line)) { size = parseInt(line.split(/\s+/)[1], 10); continue; } // eslint-disable-line no-continue
    if (/^LUT_1D_SIZE/i.test(line)) throw new Error('1D LUT не поддерживается');
    if (/^DOMAIN_MIN/i.test(line)) { dmin = line.split(/\s+/).slice(1).map(Number); continue; } // eslint-disable-line no-continue
    if (/^DOMAIN_MAX/i.test(line)) { dmax = line.split(/\s+/).slice(1).map(Number); continue; } // eslint-disable-line no-continue
    if (/^[A-Z_]/i.test(line)) continue; // eslint-disable-line no-continue
    const p = line.split(/\s+/).map(Number);
    if (p.length >= 3 && p.every(Number.isFinite)) vals.push(p[0], p[1], p[2]);
  }
  if (!size || vals.length !== size * size * size * 3) throw new Error('Неверный .cube: размер не совпадает с числом строк');
  return { size, data: Float32Array.from(vals), title, dmin, dmax };
}

export function sampleLut(lut, r, g, b) {
  const n = lut.size - 1; const d = lut.data;
  const x = Math.min(n, Math.max(0, r * n)); const y = Math.min(n, Math.max(0, g * n)); const z = Math.min(n, Math.max(0, b * n));
  const x0 = Math.floor(x); const y0 = Math.floor(y); const z0 = Math.floor(z);
  const x1 = Math.min(n, x0 + 1); const y1 = Math.min(n, y0 + 1); const z1 = Math.min(n, z0 + 1);
  const fx = x - x0; const fy = y - y0; const fz = z - z0;
  const S = lut.size;
  const idx = (xi, yi, zi) => ((zi * S + yi) * S + xi) * 3;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const c00 = d[idx(x0, y0, z0) + c] * (1 - fx) + d[idx(x1, y0, z0) + c] * fx;
    const c10 = d[idx(x0, y1, z0) + c] * (1 - fx) + d[idx(x1, y1, z0) + c] * fx;
    const c01 = d[idx(x0, y0, z1) + c] * (1 - fx) + d[idx(x1, y0, z1) + c] * fx;
    const c11 = d[idx(x0, y1, z1) + c] * (1 - fx) + d[idx(x1, y1, z1) + c] * fx;
    out[c] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }
  return out;
}

// Применение LUT к ImageData с силой (mix) — кешируем по 18-битному ключу цвета.
export function applyLut(imageData, lut, mix = 1) {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const d = out.data; const cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const key = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
    let v = cache.get(key);
    if (!v) { v = sampleLut(lut, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255).map((c) => c * 255); cache.set(key, v); }
    d[i] += (v[0] - d[i]) * mix; d[i + 1] += (v[1] - d[i + 1]) * mix; d[i + 2] += (v[2] - d[i + 2]) * mix;
  }
  return out;
}

export function downloadText(text, name, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
