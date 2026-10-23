// Проверки чистой математики реставрации фото (src/utils/restoreMath.js): запуск — node scripts/test-photo-restore.mjs
import assert from 'node:assert/strict';
import {
  nms, decodeYunet, similarity, invertSimilarity, applySimilarity, faceToCrop, overhang, featherMask,
  tileWindow, planTiles, extractPatch, tileApply, rgbToLab, labToRgb, matchColor, isGrayscale, TEMPLATE_512,
} from '../src/utils/restoreMath.js';

let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n += 1; console.log(`ok  ${name}`); });
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b}`);

await ok('similarity восстанавливает поворот+масштаб+сдвиг', () => {
  const th = 0.4; const s = 1.7; const a = s * Math.cos(th); const b = s * Math.sin(th);
  const src = [[10, 20], [60, 25], [35, 50], [18, 80], [55, 82]];
  const dst = src.map(([x, y]) => [a * x - b * y + 5, b * x + a * y - 9]);
  const m = similarity(src, dst);
  near(m.a, a, 1e-9); near(m.b, b, 1e-9); near(m.tx, 5, 1e-9); near(m.ty, -9, 1e-9);
  const back = invertSimilarity(m);
  dst.forEach((p, i) => { const q = applySimilarity(back, p); near(q[0], src[i][0], 1e-9); near(q[1], src[i][1], 1e-9); });
});

await ok('точки шаблона отображаются сами в себя', () => {
  const m = faceToCrop(TEMPLATE_512, 512);
  near(m.a, 1, 1e-9); near(m.b, 0, 1e-9); near(m.tx, 0, 1e-6); near(m.ty, 0, 1e-6);
  const m2 = faceToCrop(TEMPLATE_512.map(([x, y]) => [x * 2, y * 2]), 512);
  near(m2.a, 0.5, 1e-9);
});

await ok('overhang: лицо у края кадра требует дополнения', () => {
  const kps = TEMPLATE_512.map(([x, y]) => [x * 0.2 - 30, y * 0.2 - 30]); // лицо ~100px, кроп уходит за левый верхний угол
  const m = faceToCrop(kps, 512);
  assert.ok(overhang(m, 512, 400, 400) > 0);
  const kps2 = TEMPLATE_512.map(([x, y]) => [x * 0.2 + 150, y * 0.2 + 150]);
  assert.equal(overhang(faceToCrop(kps2, 512), 512, 400, 400), 0);
});

await ok('nms убирает дубликаты и оставляет разные лица', () => {
  const boxes = [[0, 0, 100, 100], [5, 5, 100, 100], [300, 300, 80, 80]];
  const keep = nms(boxes, [0.9, 0.8, 0.7], 0.3);
  assert.deepEqual(keep, [0, 2]);
});

await ok('decodeYunet разбирает синтетический выход', () => {
  const mk = (cells, ch) => new Float32Array(cells * ch);
  const sizes = [6400, 1600, 400];
  const out = [...sizes.map((c) => mk(c, 1)), ...sizes.map((c) => mk(c, 1)), ...sizes.map((c) => mk(c, 4)), ...sizes.map((c) => mk(c, 10))];
  // шаг 16: клетка (row 10, col 20); уверенность 0.9, рамка 64×64 с центром в (col+0.5)*16
  const i = 10 * 40 + 20;
  out[1][i] = 0.9; out[4][i] = 1;
  out[7].set([0.5, 0.5, Math.log(4), Math.log(4)], i * 4);
  for (let j = 0; j < 5; j += 1) out[10].set([0.1 * j, 0.2], i * 10 + 2 * j);
  const faces = decodeYunet(out);
  assert.equal(faces.length, 1);
  const f = faces[0];
  near(f.box[2], 64, 1e-3); near(f.box[0] + 32, 20.5 * 16, 1e-3); near(f.box[1] + 32, 10.5 * 16, 1e-3);
  near(f.kps[2][0], (0.2 + 20) * 16, 1e-3); near(f.kps[2][1], (0.2 + 10) * 16, 1e-3);
  near(f.score, Math.sqrt(0.9), 1e-6);
});

await ok('featherMask: центр 255, края почти 0', () => {
  const m = featherMask(128);
  assert.equal(m[64 * 128 + 64], 255);
  assert.ok(m[0] < 5 && m[64 * 128 + 1] < 5);
});

await ok('tileWindow симметрично, в центре 1', () => {
  const w = tileWindow(64, 80, 12);
  near(w[32 * 80 + 40], 1, 1e-9);
  near(w[5 * 80 + 40], w[(63 - 5) * 80 + 40], 1e-6);
  assert.ok(w[0] < 0.05);
});

await ok('planTiles покрывает кадр целиком', () => {
  for (const [w, h] of [[300, 200], [1000, 700], [513, 1025], [50, 50]]) {
    const cover = new Uint8Array(w * h);
    planTiles(w, h, 256, 24).forEach(({ x0, y0, tw, th }) => { for (let y = 0; y < th; y += 1) for (let x = 0; x < tw; x += 1) cover[(y0 + y) * w + x0 + x] = 1; });
    assert.ok(cover.every((v) => v === 1), `${w}x${h}`);
  }
});

await ok('extractPatch дополняет до кратного 16 зеркалом', () => {
  const chw = Float32Array.from({ length: 3 * 5 * 7 }, (_, i) => i);
  const { data, pw, ph } = extractPatch(chw, 3, 7, 5, 0, 0, 7, 5, 16);
  assert.equal(pw, 16); assert.equal(ph, 16);
  assert.equal(data[0 * pw + 7], chw[0 * 7 + 5]); // x=7 → зеркало x=5
  assert.equal(data[6 * pw + 0], chw[2 * 7 + 0]); // y=6 при высоте 5 → 2·(5−1)−6 = 2
});

await ok('tileApply с тождественной сетью возвращает вход (без швов)', async () => {
  const w = 331; const h = 270; const c = 3;
  const chw = Float32Array.from({ length: c * w * h }, (_, i) => Math.sin(i * 0.013) * 0.5 + 0.5);
  const res = await tileApply(async (p, pw, ph) => ({ rgb: { data: p, c }, half: { data: p.slice(0, ph * pw).map((v) => v / 2), c: 1 } }), chw, c, w, h, { tile: 128, overlap: 16 });
  let worst = 0; for (let i = 0; i < chw.length; i += 1) worst = Math.max(worst, Math.abs(res.rgb.data[i] - chw[i]));
  assert.ok(worst < 1e-5, `worst ${worst}`);
  near(res.half.data[10], chw[10] / 2, 1e-5);
});

await ok('tileApply уважает остановку', async () => {
  let calls = 0;
  await assert.rejects(tileApply(async (p) => { calls += 1; return { rgb: { data: p, c: 3 } }; }, new Float32Array(3 * 300 * 300), 3, 300, 300, { tile: 128, overlap: 16, shouldStop: () => calls >= 2 }), /stopped/);
});

await ok('Lab туда-обратно', () => {
  const px = Float32Array.from([0.1, 0.5, 0.9, 0.8, 0.2, 0.3, 0.5, 0.5, 0.5, 1, 1, 1, 0, 0, 0]);
  const { L, ab } = rgbToLab(px); const back = labToRgb(L, ab);
  px.forEach((v, i) => near(back[i], v, 2e-3, `i=${i}`));
});

await ok('matchColor со своим же цветом ничего не меняет, а сдвиг выравнивает', () => {
  const ref = Float32Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? 0.6 + 0.2 * Math.sin(i) : i % 3 === 1 ? 0.4 : 0.3 + 0.1 * Math.cos(i)));
  const same = matchColor(ref, ref);
  ref.forEach((v, i) => near(same[i], v, 6e-3));
  const tinted = ref.map((v, i) => (i % 3 === 2 ? Math.min(1, v + 0.25) : v));
  const fixed = matchColor(tinted, ref);
  const a = rgbToLab(ref).ab; const b = rgbToLab(fixed).ab; const c0 = rgbToLab(tinted).ab;
  const mean = (arr, k) => { let s = 0; for (let i = k; i < arr.length; i += 2) s += arr[i]; return s / (arr.length / 2); };
  assert.ok(Math.abs(mean(b, 1) - mean(a, 1)) < Math.abs(mean(c0, 1) - mean(a, 1)) / 5);
});

await ok('isGrayscale отличает ч/б от цветного', () => {
  const g = new Float32Array(3 * 64 * 64).map((_, i) => ((i / 3) | 0) % 7 / 7);
  const gg = Float32Array.from({ length: g.length }, (_, i) => (((i / 3) | 0) % 7) / 7);
  assert.equal(isGrayscale(gg, 64, 64), true);
  const col = Float32Array.from({ length: g.length }, (_, i) => (i % 3 === 0 ? 0.8 : 0.3));
  assert.equal(isGrayscale(col, 64, 64), false);
});

console.log(`\n${n} проверок пройдено`);
