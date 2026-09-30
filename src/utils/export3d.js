import * as THREE from 'three';

// Экспорт 3D-моделей: GLB (glTF 2.0, метры), STL (двоичный, мм — для печати),
// OBJ (мм, цвета вершин в расширенной записи «v x y z r g b» — её читают
// Blender/MeshLab). Модель масштабируется так, чтобы ширина была widthMm.

function prepared(mesh, widthMm, unit) {
  const geo = mesh.geometry.clone();
  geo.computeBoundingBox(); const bb = geo.boundingBox;
  const w = (bb.max.x - bb.min.x) || 1; const k = (widthMm / w) * (unit === 'm' ? 0.001 : 1);
  // STL/OBJ: плашмя на столе принтера (z от 0); GLB: по центру, лицом к +Z, Y — вверх
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, unit === 'm' ? -(bb.max.z + bb.min.z) / 2 : -bb.min.z);
  geo.scale(k, k, k);
  const out = new THREE.Mesh(geo, mesh.material.clone()); out.name = mesh.name || 'model';
  return out;
}

export async function toGLB(mesh, widthMm) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const m = prepared(mesh, widthMm, 'm');
  const scene = new THREE.Scene(); scene.add(m);
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true });
  return new Blob([buf], { type: 'model/gltf-binary' });
}

export async function toSTL(mesh, widthMm) {
  const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
  const m = prepared(mesh, widthMm, 'mm'); m.updateMatrixWorld(true);
  const dv = new STLExporter().parse(m, { binary: true });
  return new Blob([dv], { type: 'model/stl' });
}

export function toOBJ(mesh, widthMm) {
  const m = prepared(mesh, widthMm, 'mm'); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
  const pos = g.getAttribute('position'); const nor = g.getAttribute('normal'); const col = g.getAttribute('color');
  const f = (v) => (Math.round(v * 10000) / 10000).toString();
  const lines = ['# Vetor 3D export (mm)', `o ${m.name}`];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    let line = `v ${f(pos.getX(i))} ${f(pos.getY(i))} ${f(pos.getZ(i))}`;
    if (col) { c.fromBufferAttribute(col, i); THREE.ColorManagement.workingToColorSpace(c, THREE.SRGBColorSpace); line += ` ${f(c.r)} ${f(c.g)} ${f(c.b)}`; }
    lines.push(line);
  }
  if (nor) for (let i = 0; i < nor.count; i += 1) lines.push(`vn ${f(nor.getX(i))} ${f(nor.getY(i))} ${f(nor.getZ(i))}`);
  for (let i = 1; i <= pos.count; i += 3) lines.push(nor ? `f ${i}//${i} ${i + 1}//${i + 1} ${i + 2}//${i + 2}` : `f ${i} ${i + 1} ${i + 2}`);
  return new Blob([`${lines.join('\n')}\n`], { type: 'text/plain' });
}

export async function exportMesh(mesh, format, widthMm, baseName) {
  const blob = format === 'glb' ? await toGLB(mesh, widthMm) : format === 'stl' ? await toSTL(mesh, widthMm) : toOBJ(mesh, widthMm);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${baseName}.${format}`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return blob;
}
