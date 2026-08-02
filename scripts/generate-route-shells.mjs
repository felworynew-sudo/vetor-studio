import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const srcDataDir = path.join(projectRoot, 'src', 'data');
const sitemapPath = path.join(distDir, 'sitemap.xml');
const sourceHtmlPath = path.join(distDir, 'index.html');

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function escAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function truncate(value, max = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

async function readJson(fileName, fallback) {
  try {
    return JSON.parse(await readFile(path.join(srcDataDir, fileName), 'utf8'));
  } catch {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value).find(Array.isArray) || [];
  return [];
}

// --- head rewriting helpers ---------------------------------------------------

function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escText(title)}</title>`);
}

function setCanonical(html, href) {
  return html.replace(
    /<link\s+rel="canonical"[\s\S]*?>/i,
    `<link rel="canonical" href="${escAttr(href)}" />`,
  );
}

function setMetaName(html, name, content) {
  const re = new RegExp(`<meta\\s+name="${name}"[\\s\\S]*?>`, 'i');
  return html.replace(re, `<meta name="${name}" content="${escAttr(content)}" />`);
}

function setMetaProp(html, property, content) {
  const re = new RegExp(`<meta\\s+property="${property}"[\\s\\S]*?>`, 'i');
  return html.replace(re, `<meta property="${property}" content="${escAttr(content)}" />`);
}

function injectJsonLd(html, data) {
  const script = `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `    ${script}\n  </head>`);
  }
  return `${html}\n${script}`;
}

function getSafeRouteDirectory(pathname) {
  const segments = pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  if (segments.length === 0) return null;
  if (segments.some((s) => !s || s === '.' || s === '..' || s.includes('\\'))) {
    throw new Error(`Unsafe route in sitemap: ${pathname}`);
  }
  const target = path.resolve(distDir, ...segments);
  const relative = path.relative(distDir, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Route escapes dist directory: ${pathname}`);
  }
  return target;
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

  let domain = (siteConfig.domain || 'https://vetor-studio.ru').replace(/\/+$/, '');
  try {
    const parsed = new URL(domain);
    domain = `${parsed.protocol}//${parsed.host}`;
  } catch {
    /* keep as-is */
  }

  const absoluteImage = (src) => {
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) return src;
    return `${domain}${src.startsWith('/') ? '' : '/'}${src}`;
  };

  // pathname -> { title, ogTitle?, description, image? }
  const meta = new Map();

  for (const item of asArray(videos)) {
    if (!item?.id) continue;
    const name = item.ruTitle || item.enTitle || item.id;
    meta.set(`/work/${item.id}`, {
      title: `${name} — Vetor Studio`,
      ogTitle: name,
      description: truncate(
        `Работа студии дизайна Vetor — превью YouTube «${name}»${item.channelName ? ` для канала ${item.channelName}` : ''}.`,
      ),
      image: item.thumbnail,
    });
  }

  for (const item of asArray(music)) {
    if (!item?.id) continue;
    const name = item.ruTitle || item.enTitle || item.id;
    meta.set(`/work/${item.id}`, {
      title: `${name} — Vetor Studio`,
      ogTitle: name,
      description: truncate(
        item.description
          || `Обложка трека «${name}»${item.artistName ? ` — ${item.artistName}` : ''}. Студия дизайна Vetor.`,
      ),
      image: item.cover,
    });
  }

  for (const post of asArray(blog)) {
    if (!post?.id) continue;
    const name = post.ruTitle || post.enTitle || post.id;
    let desc = post.ruDescription || post.enDescription || '';
    if (!desc) {
      const textBlock = (post.blocks || []).find((b) => b?.type === 'text' && (b.ruText || b.enText));
      desc = textBlock?.ruText || textBlock?.enText || '';
    }
    meta.set(`/blog/${post.id}`, {
      title: `${name} — Блог Vetor Studio`,
      ogTitle: name,
      description: truncate(desc || `Статья студии дизайна Vetor: ${name}.`),
      image: post.cover,
    });
  }

  for (const item of asArray(gallery)) {
    if (!item?.id) continue;
    const name = item.ruTitle || item.enTitle || item.title || item.id;
    meta.set(`/design/item/${item.id}`, {
      title: `${name} — Дизайн Vetor Studio`,
      ogTitle: name,
      description: truncate(item.ruDescription || item.description || `Дизайн-работа студии Vetor: ${name}.`),
      image: item.image || item.cover || item.thumbnail,
    });
  }

  for (const tag of asArray(tags)) {
    if (!tag?.slug) continue;
    const label = tag.ruLabel || tag.enLabel || tag.label || tag.slug;
    meta.set(`/tag/${tag.slug}`, {
      title: `${label} — работы Vetor Studio`,
      description: truncate(`Работы студии дизайна Vetor по теме «${label}»: превью YouTube, обложки и брендинг.`),
    });
  }

  // Static section pages — titles/descriptions carry the commercial-intent
  // queries we want each page to rank for (see keywords per entry).
  const sectionMeta = {
    '/previews': {
      title: 'Заказать превью для YouTube и обложки — Vetor Studio',
      description: 'Сделаем превью для YouTube и обложки для музыкальных релизов: кликабельные превью и музыкальные обложки на заказ. Студия дизайна Vetor, работаем удалённо.',
      keywords: 'заказать превью, сделать превью, превью для youtube, дизайн превью, музыкальная обложка, обложка трека, обложка для сингла',
      image: '/og/previews.png',
      service: 'Дизайн превью для YouTube и музыкальных обложек',
    },
    '/fonts': {
      title: 'Авторские шрифты Vetor — скачать кириллические шрифты | Vetor Studio',
      description: 'Авторские шрифты Vetor с поддержкой кириллицы: акцидентные и текстовые гарнитуры для заголовков, обложек и брендинга. Скачать в Telegram-боте. Нужен свой шрифт — разработаем на заказ.',
      keywords: 'авторские шрифты, скачать шрифт, кириллический шрифт, шрифт с кириллицей, шрифт для заголовков, разработка шрифта на заказ',
      image: '/og/fonts.png',
      service: 'Авторские шрифты и разработка шрифта на заказ',
    },
    '/blog': {
      title: 'Блог — Vetor Studio',
      description: 'Статьи студии дизайна Vetor о превью, кликабельности, обложках и брендинге.',
      image: '/og/blog.png',
    },
    '/design': {
      title: 'Дизайн на заказ — логотипы, фирменный стиль, оформление | Vetor Studio',
      description: 'Дизайн на заказ: логотипы, фирменный стиль, оформление YouTube-каналов и стикеры. Студия дизайна Vetor — заказать дизайн удалённо.',
      keywords: 'дизайн, дизайн на заказ, заказать дизайн, графический дизайн, логотип, фирменный стиль, оформление канала',
      image: '/og/design.png',
      service: 'Графический дизайн на заказ',
    },
    '/price': {
      title: 'Прайс — Vetor Studio',
      description: 'Цены на превью YouTube, логотипы, баннеры и оформление канала. Прайс без созвонов.',
      image: '/og/price.png',
    },
    '/plugins': {
      title: 'Плагины Vetor — инструменты для графических редакторов',
      description: 'Плагины Vetor: инструменты, которые ускоряют рутину в графических редакторах. Сейчас доступен Resto — реставрация фото и макеты для памятников.',
      image: '/og/plugins.png',
    },
    '/plugins/resto': {
      title: 'Resto — реставрация старых фото и макеты для памятников — Vetor Studio',
      description: 'Resto — плагин для быстрой реставрации старых фотографий и сборки макетов портретов на памятники. Доступ по подписке через Telegram-бот @VetorPluginBOT.',
      image: '/og/plugins.png',
    },
  };

  // Design-category landing pages (already in the sitemap) — give each one a
  // commercial-intent title/description so it can rank for "заказать <услуга>".
  // Only categories that actually contain works get their own landing meta.
  const categoryMeta = {
    restoration: {
      title: 'Реставрация старых фото на заказ — восстановление фотографий | Vetor Studio',
      description: 'Реставрация старых и повреждённых фотографий на заказ: восстановление, удаление царапин, ЧБ и колоризация. Закажите реставрацию фото в студии Vetor.',
      keywords: 'реставрация фото, реставрация старых фотографий, восстановление фото, реставрация фотографий на заказ, колоризация фото',
      service: 'Реставрация старых фотографий',
    },
    'large-projects': {
      title: 'Крупные проекты и брендинг под ключ — кейсы | Vetor Studio',
      description: 'Крупные проекты студии Vetor: фирменный стиль, брендинг и комплексное оформление под ключ. Разбор кейсов и полный цикл работы.',
      keywords: 'брендинг, фирменный стиль, комплексный дизайн, брендинг под ключ, дизайн-кейсы',
      service: 'Брендинг и комплексный дизайн под ключ',
    },
  };
  for (const [slug, value] of Object.entries(categoryMeta)) {
    const pathname = `/design/category/${slug}`;
    if (!meta.has(pathname)) meta.set(pathname, { image: '/og/design.png', ...value });
  }

  for (const [pathname, value] of Object.entries(sectionMeta)) {
    if (!meta.has(pathname)) meta.set(pathname, value);
  }

  const sitemapXml = await readFile(sitemapPath, 'utf8');
  const sourceHtml = await readFile(sourceHtmlPath, 'utf8');
  const locations = Array.from(sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g), (m) => decodeXml(m[1]));

  let generated = 0;
  let enriched = 0;

  for (const location of locations) {
    const routeUrl = new URL(location);
    const pathname = decodeURIComponent(routeUrl.pathname);
    const targetDirectory = getSafeRouteDirectory(pathname);
    if (!targetDirectory) continue; // home — already index.html

    const selfUrl = `${domain}${pathname}`;
    let html = sourceHtml;

    // Every sub-page points its canonical + og:url at itself (was: always home).
    html = setCanonical(html, selfUrl);
    html = setMetaProp(html, 'og:url', selfUrl);

    const m = meta.get(pathname);
    if (m) {
      const ogTitle = m.ogTitle || m.title;
      html = setTitle(html, m.title);
      html = setMetaName(html, 'description', m.description);
      if (m.keywords) {
        html = setMetaName(html, 'keywords', m.keywords);
      }
      html = setMetaProp(html, 'og:title', ogTitle);
      html = setMetaProp(html, 'og:description', m.description);
      html = setMetaName(html, 'twitter:title', ogTitle);
      html = setMetaName(html, 'twitter:description', m.description);
      const img = absoluteImage(m.image);
      if (img) {
        html = setMetaProp(html, 'og:image', img);
        html = setMetaName(html, 'twitter:image', img);
        html = setMetaName(html, 'twitter:card', 'summary_large_image');
      }
      // Service schema helps commercial-intent pages surface as a concrete offer.
      if (m.service) {
        html = injectJsonLd(html, {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: m.service,
          serviceType: m.service,
          description: m.description,
          url: selfUrl,
          areaServed: ['RU', 'Worldwide'],
          provider: {
            '@type': 'Organization',
            name: 'Vetor Studio',
            url: domain,
          },
        });
      }
      enriched += 1;
    }

    await mkdir(targetDirectory, { recursive: true });
    await writeFile(path.join(targetDirectory, 'index.html'), html, 'utf8');
    generated += 1;
  }

  console.log(`Generated ${generated} static route shells (${enriched} with per-page SEO meta).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
