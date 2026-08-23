import { withBase } from './format';

const imagePresets = {
  thumbs: {
    widths: [720, 1280],
    sizes: '(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 25vw',
  },
  music: {
    widths: [560, 960],
    sizes: '(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 25vw',
  },
  gallery: {
    widths: [720, 1280],
    sizes: '(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 33vw',
  },
};

function sanitizeAssetName(value) {
  const normalized = String(value || '');
  const replaced = Array.from(normalized).map((character) => {
    if (/^[A-Za-z0-9_-]$/.test(character)) {
      return character;
    }

    return `_u${character.codePointAt(0).toString(16)}_`;
  }).join('');

  return replaced.replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'asset';
}

function getOptimizedPath(src, width) {
  const normalized = String(src || '').replace(/^\//, '');
  const parts = normalized.split('/');
  const folder = parts[0];
  const file = parts.slice(1).join('/');
  const dotIndex = file.lastIndexOf('.');

  if (!imagePresets[folder] || dotIndex === -1) {
    return '';
  }

  // Оптимизатор (scripts/optimize-images.mjs) обрабатывает только верхний
  // уровень папки, поэтому webp генерятся лишь для /<folder>/<file>. Студийные
  // загрузки лежат в подпапке (/gallery/uploads/...) — оптимизированного
  // варианта у них НЕТ, и подмена на /optimized/... даёт 404. Отдаём оригинал.
  if (parts.length !== 2) {
    return '';
  }

  const name = sanitizeAssetName(file.slice(0, dotIndex));
  return `/optimized/${folder}/${name}-${width}.webp`;
}

function pickPresetWidth(src, requestedWidth) {
  const normalized = String(src || '').replace(/^\//, '');
  const folder = normalized.split('/')[0];
  const preset = imagePresets[folder];

  if (!preset) {
    return null;
  }

  if (requestedWidth && Number.isFinite(requestedWidth)) {
    const nearest = preset.widths.reduce((closest, current) => (
      Math.abs(current - requestedWidth) < Math.abs(closest - requestedWidth) ? current : closest
    ), preset.widths[0]);

    return nearest;
  }

  return preset.widths[preset.widths.length - 1];
}

export function getOptimizedImageSrc(src, requestedWidth) {
  const width = pickPresetWidth(src, requestedWidth);

  if (!width) {
    return withBase(src);
  }

  const optimized = getOptimizedPath(src, width);
  if (!optimized) {
    return withBase(src);
  }

  return encodeURI(withBase(optimized));
}

export function getResponsiveImageProps(src) {
  const normalized = String(src || '').replace(/^\//, '');
  const folder = normalized.split('/')[0];
  const preset = imagePresets[folder];

  if (!preset) {
    return {};
  }

  // Нет оптимизированного варианта (студийные загрузки в подпапке) — не строим
  // srcSet на несуществующие /optimized/... webp, отдаём только оригинал.
  if (!getOptimizedPath(src, preset.widths[0])) {
    return {};
  }

  return {
    src: getOptimizedImageSrc(src),
    srcSet: preset.widths.map((width) => `${encodeURI(withBase(getOptimizedPath(src, width)))} ${width}w`).join(', '),
    sizes: preset.sizes,
  };
}
