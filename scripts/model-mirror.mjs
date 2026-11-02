// Манифест зеркала моделей (api.vetor-studio.ru/models/): для каждого файла — размер, SHA-256
// и откуда его взять. Сайт по манифесту проверяет всё, что пришло с зеркала (utils/modelMirror.js),
// а VPS по нему же скачивает и сверяет файлы (deploy/model-mirror/sync.py).
//
//   node scripts/model-mirror.mjs           — пересобрать манифест (часть npm run build):
//                                             свои модели хэшируются из public/models,
//                                             чужие берутся из scripts/model-mirror.remote.json
//   node scripts/model-mirror.mjs --remote  — заново спросить HuggingFace/Google (новые хэши,
//                                             ревизии закрепляются по коммиту) и обновить remote.json
//
// Выход: src/data/model-mirror.json (в сборку) и public/model-mirror.json (его читает VPS).

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MODELS_DIR = join(ROOT, 'public/models');
const REMOTE_FILE = join(ROOT, 'scripts/model-mirror.remote.json');
const OUT_SRC = join(ROOT, 'src/data/model-mirror.json');
const OUT_PUBLIC = join(ROOT, 'public/model-mirror.json');
const MIRROR_BASE = 'https://api.vetor-studio.ru/models/';
const SITE_ORIGIN = 'https://vetor-studio.ru/models/';

// Веса, которые качаются браузером (json-манифесты сайта не зеркалим — они мелкие и меняются).
const SITE_EXT = /\.(onnx(\.\d+)?|wasm|bin|tflite)$/;

// Чужие модели: файлы, которые реально запрашивают transformers.js и наши загрузчики.
const HF_JSON = ['config.json', 'preprocessor_config.json'];
const HF = {
  'onnx-community/BiRefNet_lite-ONNX': [...HF_JSON, 'onnx/model.onnx'],
  'Xenova/modnet': [...HF_JSON, 'onnx/model.onnx', 'onnx/model_quantized.onnx'],
  'Xenova/swin2SR-classical-sr-x2-64': [...HF_JSON, 'onnx/model.onnx'],
  'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr': [...HF_JSON, 'onnx/model.onnx'],
  'Xenova/2x_APISR_RRDB_GAN_generator-onnx': [...HF_JSON, 'onnx/model.onnx'],
  'Xenova/4x_APISR_GRL_GAN_generator-onnx': [...HF_JSON, 'onnx/model.onnx'],
  'Xenova/swin2SR-lightweight-x2-64': [...HF_JSON, 'onnx/model.onnx'],
  'Xenova/detr-resnet-50': [...HF_JSON, 'onnx/model.onnx', 'onnx/model_quantized.onnx'],
  'Organika/sdxl-detector': [...HF_JSON, 'onnx/model.onnx'],
  'facefusion/models-3.0.0': ['restoreformer_plus_plus.onnx', 'real_esrgan_x4_fp16.onnx', 'real_esrgan_x4.onnx'],
};
const EXT = [
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
];

function hashFile(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function hashUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const h = createHash('sha256'); let size = 0;
  for await (const chunk of res.body) { h.update(chunk); size += chunk.length; }
  return { size, sha256: h.digest('hex') };
}

async function refreshRemote() {
  const files = {};
  for (const [repo, wanted] of Object.entries(HF)) {
    const info = await (await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`)).json();
    const rev = info.sha;
    if (!rev) throw new Error(`HF ${repo}: нет ревизии`);
    const byName = new Map((info.siblings || []).map((s) => [s.rfilename, s]));
    for (const name of wanted) {
      const s = byName.get(name);
      if (!s) { console.warn(`  ! ${repo}/${name}: нет в репозитории, пропускаю`); continue; }
      const src = `https://huggingface.co/${repo}/resolve/${rev}/${name}`;
      const meta = s.lfs ? { size: s.lfs.size, sha256: s.lfs.sha256 } : await hashUrl(src);
      files[`hf/${repo}/${name}`] = { ...meta, src };
      console.log(`  hf/${repo}/${name}  ${(meta.size / 1e6).toFixed(1)} МБ`);
    }
  }
  for (const url of EXT) {
    const meta = await hashUrl(url);
    files[`ext/${new URL(url).pathname.slice(1)}`] = { ...meta, src: url };
    console.log(`  ext ${url}  ${(meta.size / 1e6).toFixed(1)} МБ`);
  }
  writeFileSync(REMOTE_FILE, `${JSON.stringify(files, null, 1)}\n`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

async function build() {
  const remote = existsSync(REMOTE_FILE) ? JSON.parse(readFileSync(REMOTE_FILE, 'utf8')) : {};
  const files = { ...remote };
  // Локальная копия может быть неполной (sparse checkout без части public/models):
  // свои модели, которых нет на диске, берём из прошлого манифеста. В CI — только с диска.
  if (!process.env.CI && existsSync(OUT_SRC)) {
    const prev = JSON.parse(readFileSync(OUT_SRC, 'utf8')).files || {};
    Object.entries(prev).filter(([k]) => k.startsWith('site/')).forEach(([k, v]) => { files[k] = v; });
  }
  if (existsSync(MODELS_DIR)) {
    for (const path of walk(MODELS_DIR).sort()) {
      const rel = relative(MODELS_DIR, path).split('\\').join('/');
      if (!SITE_EXT.test(rel)) continue;
      // eslint-disable-next-line no-await-in-loop
      files[`site/${rel}`] = { size: statSync(path).size, sha256: await hashFile(path), src: SITE_ORIGIN + rel.split('/').map(encodeURIComponent).join('/') };
    }
  } else {
    console.warn('model-mirror: public/models нет — свои модели взяты из прошлого манифеста');
  }
  const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]));
  const out = { base: MIRROR_BASE, files: sorted };
  writeFileSync(OUT_SRC, `${JSON.stringify(out, null, 1)}\n`);
  writeFileSync(OUT_PUBLIC, JSON.stringify(out));
  const total = Object.values(sorted).reduce((a, f) => a + f.size, 0);
  console.log(`model-mirror: ${Object.keys(sorted).length} файлов, ${(total / 1e9).toFixed(2)} ГБ`);
}

if (process.argv.includes('--remote')) await refreshRemote();
await build();
