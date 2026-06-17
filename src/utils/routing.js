function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getBasePath() {
  const rawBase = import.meta.env.BASE_URL || '/';
  let basePath = rawBase;

  if (/^https?:\/\//i.test(rawBase)) {
    try {
      basePath = new URL(rawBase).pathname;
    } catch {
      basePath = '/';
    }
  }

  const normalized = basePath.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return normalized || '/';
}

function withBasePath(pathname) {
  const basePath = getBasePath();

  if (basePath === '/') {
    return pathname;
  }

  if (pathname === '/') {
    return basePath;
  }

  return `${basePath}${pathname}`;
}

function stripBasePath(pathname) {
  const basePath = getBasePath();

  if (basePath === '/' || pathname === basePath) {
    return pathname === basePath ? '/' : pathname;
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || '/';
  }

  return pathname;
}

function normalizePathname(pathname) {
  const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return normalized || '/';
}

function unique(values) {
  return Array.from(new Set(values));
}

export function parseRoute(locationLike) {
  const rawPathname = normalizePathname(safeDecode(locationLike.pathname || '/'));
  const pathname = normalizePathname(stripBasePath(rawPathname));
  const params = new URLSearchParams(locationLike.search || '');
  const query = (params.get('q') || '').trim();
  const queryDesignCategory = (params.get('design') || '').trim();
  const tagsFromQuery = params.getAll('tag');
  const tagsCsv = (params.get('tags') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const tags = unique([...tagsFromQuery, ...tagsCsv]);

  const base = {
    pathname,
    section: 'home',
    query,
    tags,
    workId: '',
    blogId: '',
    galleryId: '',
    designCategory: queryDesignCategory || 'all',
    isPriceOpen: params.get('price') === '1',
    isNotFound: false,
  };

  if (pathname === '/' || pathname === '') {
    return base;
  }

  if (pathname === '/price') {
    return { ...base, section: 'price', isPriceOpen: true };
  }

  if (pathname === '/blog') {
    return { ...base, section: 'blog' };
  }

  if (pathname === '/gallery' || pathname === '/design') {
    return { ...base, section: 'gallery' };
  }

  if (pathname.startsWith('/design/category/')) {
    return { ...base, section: 'gallery', designCategory: pathname.slice('/design/category/'.length) || 'all' };
  }

  if (pathname.startsWith('/gallery/category/')) {
    return { ...base, section: 'gallery', designCategory: pathname.slice('/gallery/category/'.length) || 'all' };
  }

  if (pathname === '/plugins') {
    return { ...base, section: 'plugins' };
  }

  if (pathname.startsWith('/design/item/')) {
    return { ...base, section: 'gallery', galleryId: pathname.slice('/design/item/'.length) };
  }

  if (pathname.startsWith('/work/')) {
    return { ...base, workId: pathname.slice('/work/'.length) };
  }

  if (pathname.startsWith('/blog/')) {
    return { ...base, section: 'blog', blogId: pathname.slice('/blog/'.length) };
  }

  if (pathname.startsWith('/gallery/')) {
    return { ...base, section: 'gallery', galleryId: pathname.slice('/gallery/'.length) };
  }

  if (pathname.startsWith('/tag/')) {
    return { ...base, tags: unique([pathname.slice('/tag/'.length), ...tags]) };
  }

  return { ...base, isNotFound: true };
}

export function buildSectionPath(section) {
  if (section === 'price') {
    return '/price';
  }

  if (section === 'blog') {
    return '/blog';
  }

  if (section === 'gallery') {
    return '/design';
  }

  if (section === 'plugins') {
    return '/plugins';
  }

  return '/';
}

export function buildTagPath(tagSlug) {
  return `/tag/${encodeURIComponent(tagSlug)}`;
}

export function buildWorkPath(itemId) {
  return `/work/${encodeURIComponent(itemId)}`;
}

export function buildBlogPath(postId) {
  return `/blog/${encodeURIComponent(postId)}`;
}

export function buildGalleryPath(itemId) {
  return `/design/item/${encodeURIComponent(itemId)}`;
}

export function buildDesignCategoryPath(categorySlug) {
  return `/design/category/${encodeURIComponent(categorySlug)}`;
}

export function buildPricePath() {
  return '/price';
}

export function buildUrl({
  section = 'home',
  query = '',
  tags = [],
  workId = '',
  blogId = '',
  galleryId = '',
  designCategory = 'all',
  isPriceOpen = false,
}) {
  let pathname = buildSectionPath(section);

  if (workId) {
    pathname = buildWorkPath(workId);
  } else if (blogId) {
    pathname = buildBlogPath(blogId);
  } else if (galleryId) {
    pathname = buildGalleryPath(galleryId);
  } else if (section === 'price' || isPriceOpen) {
    pathname = buildPricePath();
  } else if (section === 'gallery' && designCategory && designCategory !== 'all') {
    pathname = buildDesignCategoryPath(designCategory);
  } else if (section === 'home' && tags.length === 1 && !query) {
    pathname = buildTagPath(tags[0]);
  }

  const params = new URLSearchParams();

  if (query) {
    params.set('q', query);
  }

  if (!(pathname.startsWith('/tag/') && tags.length === 1 && !query) && tags.length > 0) {
    params.set('tags', tags.join(','));
  }

  if (section === 'gallery' && designCategory && designCategory !== 'all' && !pathname.startsWith('/design/category/')) {
    params.set('design', designCategory);
  }

  const queryString = params.toString();
  const pathWithBase = withBasePath(pathname);
  return queryString ? `${pathWithBase}?${queryString}` : pathWithBase;
}
