// Studio image uploads.
//
// The gallery editor lets the owner pick an image; we optimize it to webp and
// hold it as a data: URL for instant preview. At publish time the data: URL is
// turned into a real file committed to /public (see dataUrlToAsset +
// extractAssets), so gallery.json keeps lightweight PATHS instead of
// bloating with base64 — the site bundle stays lean and images stay cacheable.

function readRawFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function optimizeImageDataUrl(dataUrl, { maxWidth = 1800, maxHeight = 1800, quality = 0.84 } = {}) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const scale = Math.min(1, maxWidth / width, maxHeight / height);

      if (scale >= 0.995 && dataUrl.length < 1_600_000) {
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      try {
        const optimized = canvas.toDataURL('image/webp', quality);
        resolve(optimized.length < dataUrl.length ? optimized : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

// Read a picked file into an (optimized) data: URL. Raster images become webp;
// SVG/GIF are kept as-is.
export async function readFileAsOptimizedDataUrl(file, options = {}) {
  const raw = await readRawFileAsDataUrl(file);
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return raw;
  }
  return optimizeImageDataUrl(raw, options);
}

const EXT_BY_TYPE = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// Turn a data: URL into an asset descriptor: a content-hashed file under
// /public plus the public src path to store in the data. Returns null for
// non-data URLs (already a path — leave it alone).
export async function dataUrlToAsset(dataUrl, dir = 'gallery/uploads') {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;

  const contentType = (match[1] || 'application/octet-stream').toLowerCase();
  const isBase64 = Boolean(match[2]);
  const base64 = isBase64
    ? match[3]
    : btoa(unescape(encodeURIComponent(decodeURIComponent(match[3]))));

  const digest = await crypto.subtle.digest('SHA-256', bytesFromBase64(base64));
  const hash = Array.from(new Uint8Array(digest)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const ext = EXT_BY_TYPE[contentType] || 'bin';

  const publicSrc = `/${dir}/${hash}.${ext}`;
  const repoPath = `public/${dir}/${hash}.${ext}`;
  return { repoPath, publicSrc, base64, contentType };
}

// Deep-walk any value and pull every embedded data: URL out into a real asset,
// replacing it with its public /public path. Non-data strings and non-strings
// are left untouched. Returns { value, assets }. Applied to the whole studio
// payload so uploads anywhere (gallery, previews, music, avatar, blog) become
// real files at publish instead of bloating the bundled JSON.
export async function extractAssets(root) {
  const assets = [];
  const seen = new Map(); // dataUrl -> publicSrc (dedupe identical uploads)

  async function walk(node) {
    if (typeof node === 'string') {
      if (!node.startsWith('data:')) return node;
      if (seen.has(node)) return seen.get(node);
      const asset = await dataUrlToAsset(node);
      if (!asset) return node;
      assets.push({ path: asset.repoPath, base64: asset.base64, contentType: asset.contentType });
      seen.set(node, asset.publicSrc);
      return asset.publicSrc;
    }
    if (Array.isArray(node)) {
      const out = [];
      for (const item of node) out.push(await walk(item)); // sequential: keep `seen` consistent
      return out;
    }
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) out[key] = await walk(value);
      return out;
    }
    return node;
  }

  const value = await walk(root);
  return { value, assets };
}
