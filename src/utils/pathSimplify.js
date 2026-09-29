import SvgPath from 'svgpath';

// Упрощение SVG-путей: svgpath (MIT) нормализует путь (абсолютные координаты, без
// сокращений и дуг), кривые раскладываются в ломаные, ломаные прореживаются
// Рамером–Дугласом–Пекером с допуском в px, затем опционально снова сглаживаются
// кривыми Безье (Catmull-Rom → cubic), сохраняя острые углы.

function flatten(d) {
  const subs = []; let cur = null; let x = 0; let y = 0;
  SvgPath(d).abs().unarc().unshort().iterate((seg) => {
    const c = seg[0];
    if (c === 'M') { cur = { pts: [[seg[1], seg[2]]], closed: false }; subs.push(cur); x = seg[1]; y = seg[2]; return; }
    if (!cur) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); }
    if (c === 'L') { cur.pts.push([seg[1], seg[2]]); x = seg[1]; y = seg[2]; }
    else if (c === 'H') { cur.pts.push([seg[1], y]); x = seg[1]; }
    else if (c === 'V') { cur.pts.push([x, seg[1]]); y = seg[1]; }
    else if (c === 'C' || c === 'Q') {
      const P = c === 'C' ? [[x, y], [seg[1], seg[2]], [seg[3], seg[4]], [seg[5], seg[6]]] : [[x, y], [seg[1], seg[2]], [seg[3], seg[4]]];
      const len = P.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), 0);
      const n = Math.max(4, Math.min(64, Math.ceil(len / 2)));
      for (let k = 1; k <= n; k += 1) {
        const t = k / n; const u = 1 - t;
        if (c === 'C') cur.pts.push([u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]);
        else cur.pts.push([u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0], u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1]]);
      }
      x = P[P.length - 1][0]; y = P[P.length - 1][1];
    } else if (c === 'Z' || c === 'z') { cur.closed = true; const [sx, sy] = cur.pts[0]; x = sx; y = sy; }
  });
  return subs;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); const [ax, ay] = pts[a]; const [bx, by] = pts[b];
    const dx = bx - ax; const dy = by - ay; const L = Math.hypot(dx, dy) || 1e-9;
    let md = -1; let mi = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const f = (v, p) => Number(v.toFixed(p)).toString();

// Сглаживание: Catmull-Rom → Безье; на острых углах (> cornerDeg) — прямые отрезки.
function smoothPath(pts, closed, p, cornerDeg = 50) {
  const n = pts.length; if (n < 3) return `M${pts.map((q) => q.map((v) => f(v, p)).join(' ')).join('L')}${closed ? 'Z' : ''}`;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const angle = (i) => {
    const a = get(i - 1); const b = get(i); const c = get(i + 1);
    const v1 = [b[0] - a[0], b[1] - a[1]]; const v2 = [c[0] - b[0], c[1] - b[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };
  let d = `M${f(pts[0][0], p)} ${f(pts[0][1], p)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    const p0 = get(i - 1); const p1 = get(i); const p2 = get(i + 1); const p3 = get(i + 2);
    const sharp1 = (!closed && i === 0) || angle(i) > cornerDeg; const sharp2 = (!closed && i + 1 === n - 1) || angle(i + 1) > cornerDeg;
    if (sharp1 && sharp2) { d += `L${f(p2[0], p)} ${f(p2[1], p)}`; continue; } // eslint-disable-line no-continue
    const c1 = sharp1 ? p1 : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = sharp2 ? p2 : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0], p)} ${f(c1[1], p)} ${f(c2[0], p)} ${f(c2[1], p)} ${f(p2[0], p)} ${f(p2[1], p)}`;
  }
  return d + (closed ? 'Z' : '');
}

export function simplifyPath(d, { tolerance = 1, smooth = true, precision = 1, corner = 50 } = {}) {
  const subs = flatten(d);
  let nodesIn = 0; let nodesOut = 0;
  SvgPath(d).iterate(() => { nodesIn += 1; });
  const out = subs.map((s) => {
    let pts = s.pts;
    if (s.closed && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts = pts.slice(0, -1);
    const simp = rdp(pts, tolerance);
    nodesOut += simp.length;
    return smooth ? smoothPath(simp, s.closed, precision, corner) : `M${simp.map((q) => q.map((v) => f(v, precision)).join(' ')).join('L')}${s.closed ? 'Z' : ''}`;
  }).join('');
  return { d: out, nodesIn, nodesOut };
}

// Применяет упрощение ко всем <path> (и полигонам/ломаным) SVG-документа.
export function simplifySvg(svgText, opts) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Некорректный SVG');
  let nin = 0; let nout = 0;
  doc.querySelectorAll('polygon, polyline').forEach((el) => {
    const pts = (el.getAttribute('points') || '').trim();
    if (!pts) return;
    const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    [...el.attributes].forEach((a) => { if (a.name !== 'points') p.setAttribute(a.name, a.value); });
    p.setAttribute('d', `M${pts}${el.nodeName === 'polygon' ? 'Z' : ''}`);
    el.replaceWith(p);
  });
  doc.querySelectorAll('path').forEach((el) => {
    const d = el.getAttribute('d'); if (!d) return;
    try { const r = simplifyPath(d, opts); nin += r.nodesIn; nout += r.nodesOut; el.setAttribute('d', r.d); } catch { /* оставляем как есть */ }
  });
  return { svg: new XMLSerializer().serializeToString(doc.documentElement), nodesIn: nin, nodesOut: nout };
}
