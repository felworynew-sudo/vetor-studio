import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDataDir = path.join(projectRoot, 'src', 'data');
const publicDir = path.join(projectRoot, 'public');

function normalizeDate(value) {
  const today = new Date().toISOString().slice(0, 10);
  const fallback = today;

  if (!value || typeof value !== 'string') {
    return fallback;
  }

  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) {
    return fallback;
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);

  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return fallback;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year
    || utcDate.getUTCMonth() !== month - 1
    || utcDate.getUTCDate() !== day
  ) {
    return fallback;
  }

  return datePart > today ? today : datePart;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function extractPostText(post) {
  const directDescription = post?.ruDescription || post?.enDescription || '';
  if (directDescription.trim()) {
    return directDescription.trim();
  }

  const textBlock = (post?.blocks || []).find(
    (block) => block?.type === 'text' && (block.ruText || block.enText),
  );
  const rawText = textBlock?.ruText || textBlock?.enText || '';
  return String(rawText).replace(/\s+/g, ' ').trim();
}

function asRssDate(value) {
  const normalized = normalizeDate(value);
  return new Date(`${normalized}T12:00:00Z`).toUTCString();
}

async function readJson(fileName, fallback) {
  const filePath = path.join(srcDataDir, fileName);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function main() {
  const [siteConfig, tags, videos, music, blog, gallery] = await Promise.all([
    readJson('siteConfig.json', {}),
    readJson('tags.json', []),
    readJson('videos.json', []),
    readJson('music.json', []),
    readJson('blog.json', []),
    readJson('gallery.json', []),
  ]);

  const rawDomain = (siteConfig.domain || 'https://vetor-studio.ru').replace(/\/+$/, '');
  let domain = rawDomain;
  try {
    const parsed = new URL(rawDomain);
    domain = `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
  } catch {
    domain = rawDomain;
  }
  const sections = {
    home: true,
    blog: true,
    gallery: true,
    price: true,
    plugins: true,
    ...(siteConfig.sections || {}),
  };

  const routes = [];
  const addRoute = (pathname, lastmod, changefreq = 'weekly', priority = '0.7') => {
    routes.push({
      loc: `${domain}${pathname}`,
      lastmod: normalizeDate(lastmod),
      changefreq,
      priority,
    });
  };

  if (sections.home) {
    addRoute('/', null, 'daily', '1.0');
    for (const item of [...videos, ...music]) {
      if (item?.id) {
        addRoute(`/work/${encodeURIComponent(item.id)}`, item.createdAt, 'weekly', '0.8');
      }
    }
    for (const tag of tags) {
      if (tag?.slug) {
        addRoute(`/tag/${encodeURIComponent(tag.slug)}`, null, 'weekly', '0.6');
      }
    }
  }

  if (sections.blog) {
    addRoute('/blog', null, 'daily', '0.9');
    for (const post of blog) {
      if (post?.id) {
        addRoute(`/blog/${encodeURIComponent(post.id)}`, post.createdAt, 'weekly', '0.8');
      }
    }
  }

  if (sections.gallery) {
    addRoute('/design', null, 'weekly', '0.8');
    const designCategories = new Set(['logos', 'business-cards', 'brand-identity', 'youtube', 'stickers']);
    for (const item of gallery) {
      if (item?.designCategory) {
        designCategories.add(String(item.designCategory).trim().toLowerCase());
      }
    }
    for (const categorySlug of designCategories) {
      if (categorySlug && categorySlug !== 'all') {
        addRoute(`/design/category/${encodeURIComponent(categorySlug)}`, null, 'weekly', '0.7');
      }
    }
    for (const item of gallery) {
      if (item?.id) {
        addRoute(`/design/item/${encodeURIComponent(item.id)}`, item.createdAt, 'weekly', '0.7');
      }
    }
  }

  if (sections.price) {
    addRoute('/price', null, 'weekly', '0.8');
  }

  if (sections.plugins) {
    addRoute('/plugins', null, 'monthly', '0.6');
  }

  const urlset = routes
    .map(
      (route) => `  <url>
    <loc>${escapeXml(route.loc)}</loc>
    <lastmod>${route.lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
    )
    .join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlset}
</urlset>
`;

  const rssPosts = sections.blog
    ? [...blog].sort((a, b) => normalizeDate(b?.createdAt).localeCompare(normalizeDate(a?.createdAt)))
    : [];
  const channelTitle = siteConfig.siteName?.ru || siteConfig.siteName?.en || 'Vetor Studio';
  const channelDescription = siteConfig.siteTagline?.ru
    || siteConfig.siteTagline?.en
    || 'Публикации студии дизайна';
  const rssItems = rssPosts
    .filter((post) => post?.id)
    .slice(0, 100)
    .map((post) => {
      const postTitle = post.ruTitle || post.enTitle || post.id;
      const postDescription = extractPostText(post);
      const postUrl = `${domain}/blog/${encodeURIComponent(post.id)}`;

      return `    <item>
      <title>${escapeXml(postTitle)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <pubDate>${escapeXml(asRssDate(post.createdAt))}</pubDate>
      <description>${escapeXml(postDescription)}</description>
    </item>`;
    })
    .join('\n');

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(`${domain}/blog`)}</link>
    <description>${escapeXml(channelDescription)}</description>
    <language>ru-RU</language>
    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>
    <atom:link href="${escapeXml(`${domain}/rss.xml`)}" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>
`;

  const host = domain.replace(/^https?:\/\//, '');
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /*?studio=1
Disallow: /*&studio=1

Host: ${host}
Sitemap: ${domain}/sitemap.xml
`;

  await fs.mkdir(publicDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf8'),
    fs.writeFile(path.join(publicDir, 'robots.txt'), robotsTxt, 'utf8'),
    fs.writeFile(path.join(publicDir, 'rss.xml'), rssXml, 'utf8'),
    fs.writeFile(path.join(publicDir, 'feed.xml'), rssXml, 'utf8'),
  ]);
}

main();
