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

// --- optimized image mapping ------------------------------------------------
// prune-dist-media удаляет исходники из /thumbs, /music, /gallery — в билде
// остаётся только WebP в /optimized. Поэтому og:image и thumbnailUrl должны
// указывать на реальный webp, а не на удалённый оригинал (иначе 404).
const optimizedPresets = { thumbs: 1280, music: 960, gallery: 1280 };

function sanitizeAssetName(value) {
  const replaced = Array.from(String(value || '')).map((character) => (
    /^[A-Za-z0-9_-]$/.test(character) ? character : `_u${character.codePointAt(0).toString(16)}_`
  )).join('');
  return replaced.replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'asset';
}

function toOptimizedPath(src) {
  const normalized = String(src || '').replace(/^\//, '');
  const parts = normalized.split('/');
  const folder = parts[0];
  const width = optimizedPresets[folder];
  const file = parts.slice(1).join('/');
  const dotIndex = file.lastIndexOf('.');
  if (!width || dotIndex === -1) return src;
  // Студийные загрузки (/gallery/uploads/...) оптимизатор не трогает, а prune их
  // не удаляет — оптимизированного webp нет, отдаём оригинал (иначе og:image 404).
  if (parts.length !== 2) return src;
  const name = sanitizeAssetName(file.slice(0, dotIndex));
  return `/optimized/${folder}/${name}-${width}.webp`;
}

// --- head rewriting helpers --------------------------------------------------

function setHtmlLang(html, lang) {
  return html.replace(/<html\s+lang="[^"]*"/i, `<html lang="${escAttr(lang)}"`);
}

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
  const tag = `<meta name="${name}" content="${escAttr(content)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function setMetaProp(html, property, content) {
  const re = new RegExp(`<meta\\s+property="${property}"[\\s\\S]*?>`, 'i');
  const tag = `<meta property="${property}" content="${escAttr(content)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

// Каждый элемент — либо схема-объект, либо { data, id } с data-seo-id. id нужен,
// чтобы клиентский upsertJsonLd (App.jsx) НАШЁЛ этот блок и ЗАМЕНИЛ его при
// загрузке JS, а не добавил второй такой же (иначе дубли Website/Service).
function injectJsonLd(html, items) {
  const scripts = items
    .filter(Boolean)
    .map((entry) => {
      const data = entry && entry.data ? entry.data : entry;
      const id = entry && entry.id ? entry.id : null;
      const attr = id ? ` data-seo-id="${escAttr(id)}"` : '';
      return `<script type="application/ld+json"${attr}>${JSON.stringify(data)}</script>`;
    })
    .join('\n    ');
  if (!scripts) return html;
  return html.includes('</head>')
    ? html.replace('</head>', `    ${scripts}\n  </head>`)
    : `${html}\n${scripts}`;
}

// Убираем ld+json из шаблона (там русский ProfessionalService) — структурные
// данные целиком собираем здесь, локализованно и с data-seo-id.
function stripTemplateJsonLd(html) {
  return html.replace(/\s*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');
}

function injectHreflang(html, ruUrl, enUrl) {
  const links = [
    `<link rel="alternate" hreflang="ru" href="${escAttr(ruUrl)}" />`,
    `<link rel="alternate" hreflang="en" href="${escAttr(enUrl)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escAttr(ruUrl)}" />`,
  ].join('\n    ');
  return html.replace('</head>', `    ${links}\n  </head>`);
}

// Заменяет заглушку #app-fallback осмысленным no-JS контентом: H1 + описание +
// навигация. Так у краулеров без JS (в т.ч. Яндекс) на странице есть реальный
// заголовок и текст, а не пустой #root. React при монтировании заменит блок.
function setFallbackBody(html, { heading, description, navLinks, homeHref, telegramUrl, lang }) {
  const nav = navLinks
    .map(([label, href]) => `<a href="${escAttr(href)}" style="color:#b7a7ff;margin-right:16px;white-space:nowrap">${escText(label)}</a>`)
    .join('');
  const loading = lang === 'ru' ? 'Загружаем интерфейс…' : 'Loading the interface…';
  const refresh = lang === 'ru' ? 'Обновить страницу' : 'Reload the page';
  const block = `<div id="app-fallback" style="padding:24px;color:#e8e8f5;background:#0d0d11;font-family:Inter,Arial,sans-serif;line-height:1.5">
        <h1 style="margin:0 0 12px;font-size:24px;max-width:760px">${escText(heading)}</h1>
        <p style="margin:0 0 14px;max-width:760px;color:#c7cad6">${escText(description)}</p>
        <nav style="margin:0 0 14px;display:flex;flex-wrap:wrap;gap:8px 0" aria-label="${lang === 'ru' ? 'Разделы' : 'Sections'}">${nav}</nav>
        <p id="app-fallback-status" style="margin:0 0 8px;color:#a8afbc">${loading}</p>
        <p style="margin:0"><a href="${escAttr(homeHref)}" style="color:#b7a7ff">${refresh}</a> · <a href="${escAttr(telegramUrl)}" style="color:#b7a7ff" rel="nofollow">Telegram</a></p>
      </div>`;
  return html.replace(/<div id="app-fallback"[\s\S]*?<\/div>\s*<\/div>/i, `${block}\n    </div>`);
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

// --- language-aware copy -----------------------------------------------------

const t = (lang, ru, en) => (lang === 'en' ? en : ru);

const NAV_LINKS = {
  ru: [['Превью', '/previews'], ['Дизайн', '/design'], ['Цены', '/price'], ['Блог', '/blog'], ['О студии', '/about']],
  en: [['Previews', '/previews'], ['Design', '/design'], ['Pricing', '/price'], ['Blog', '/blog'], ['About', '/about']],
};

const SECTION_CRUMB = {
  ru: { '/previews': 'Превью', '/design': 'Дизайн', '/blog': 'Блог', '/price': 'Цены', '/fonts': 'Шрифты', '/plugins': 'Софт', '/about': 'О студии', '/privacy': 'Конфиденциальность' },
  en: { '/previews': 'Previews', '/design': 'Design', '/blog': 'Blog', '/price': 'Pricing', '/fonts': 'Fonts', '/plugins': 'Software', '/about': 'About', '/privacy': 'Privacy' },
};

const DEFAULTS = {
  ru: {
    title: 'Студия дизайна Vetor — превью YouTube, обложки, логотипы и фирменный стиль',
    description: 'Студия дизайна Vetor: превью YouTube, обложки треков, логотипы, фирменный стиль, стикеры и оформление каналов. Работаем удалённо по России и за её пределами.',
    keywords: 'vetor studio, ветор, студия дизайна, превью youtube, обложка трека, логотип, фирменный стиль, оформление канала, стикеры',
    heading: 'Студия дизайна Vetor',
  },
  en: {
    title: 'Vetor Design Studio — YouTube thumbnails, covers, logos & brand identity',
    description: 'Vetor design studio: YouTube thumbnails, music covers, logos, brand identity, stickers, and channel packaging. We work remotely for clients in Russia and worldwide.',
    keywords: 'vetor design studio, youtube thumbnail design, music cover design, logo design, brand identity, channel branding, stickers',
    heading: 'Vetor Design Studio',
  },
};

// Коммерческие разделы: заголовки/описания несут запросы, под которые
// ранжируется каждая страница. RU и EN — оба вычитанные вручную.
const SECTION_META = {
  ru: {
    '/previews': {
      title: 'Заказать превью для YouTube и обложки — Vetor Studio',
      description: 'Сделаем превью для YouTube и обложки для музыкальных релизов: кликабельные превью и музыкальные обложки на заказ. Студия дизайна Vetor, работаем удалённо.',
      keywords: 'заказать превью, сделать превью, превью для youtube, дизайн превью, музыкальная обложка, обложка трека, обложка для сингла',
      image: '/og/previews.png',
      service: 'Дизайн превью для YouTube и музыкальных обложек',
      heading: 'Превью для YouTube и обложки на заказ',
    },
    '/fonts': {
      title: 'Авторские шрифты Vetor — скачать кириллические шрифты | Vetor Studio',
      description: 'Авторские шрифты Vetor с поддержкой кириллицы: акцидентные и текстовые гарнитуры для заголовков, обложек и брендинга. Скачать в Telegram-боте. Нужен свой шрифт — разработаем на заказ.',
      keywords: 'авторские шрифты, скачать шрифт, кириллический шрифт, шрифт с кириллицей, шрифт для заголовков, разработка шрифта на заказ',
      image: '/og/fonts.png',
      service: 'Авторские шрифты и разработка шрифта на заказ',
      heading: 'Авторские шрифты Vetor',
    },
    '/blog': {
      title: 'Блог о дизайне, превью и брендинге — Vetor Studio',
      description: 'Статьи студии дизайна Vetor о превью, кликабельности, обложках и брендинге.',
      image: '/og/blog.png',
      heading: 'Блог студии Vetor',
    },
    '/about': {
      title: 'О студии — дизайнер Кирилл Шелудько, Vetor (Краснодар)',
      description: 'Кирилл Шелудько — основатель студии Vetor и универсальный дизайнер из Краснодара: превью, логотипы, фирменный стиль, сайты, а также плагины, CRM и автоматизация для бизнеса.',
      heading: 'О студии Vetor',
    },
    '/privacy': {
      title: 'Политика конфиденциальности — Vetor Studio',
      description: 'Как студия Vetor обрабатывает персональные данные по ФЗ-152: какие данные, зачем, хранение и ваши права.',
      heading: 'Политика конфиденциальности',
    },
    '/design': {
      title: 'Дизайн на заказ — логотипы, фирменный стиль, оформление | Vetor Studio',
      description: 'Дизайн на заказ: логотипы, фирменный стиль, оформление YouTube-каналов и стикеры. Студия дизайна Vetor — заказать дизайн удалённо.',
      keywords: 'дизайн, дизайн на заказ, заказать дизайн, графический дизайн, логотип, фирменный стиль, оформление канала',
      image: '/og/design.png',
      service: 'Графический дизайн на заказ',
      heading: 'Дизайн на заказ',
    },
    '/price': {
      title: 'Цены на превью, логотипы, обложки и оформление — Vetor Studio',
      description: 'Цены на превью YouTube, логотипы, баннеры и оформление канала. Прайс без созвонов.',
      image: '/og/price.png',
      heading: 'Цены студии Vetor',
    },
    '/plugins': {
      title: 'Плагины Vetor — инструменты для графических редакторов',
      description: 'Плагины Vetor: инструменты, которые ускоряют рутину в графических редакторах. Сейчас доступен Resto — реставрация фото и макеты для памятников.',
      image: '/og/plugins.png',
      heading: 'Плагины Vetor',
    },
    '/plugins/resto': {
      title: 'Resto — реставрация старых фото и макеты для памятников — Vetor Studio',
      description: 'Resto — плагин для быстрой реставрации старых фотографий и сборки макетов портретов на памятники. Доступ по подписке через Telegram-бот @VetorPluginBOT.',
      image: '/og/plugins.png',
      heading: 'Resto — реставрация фото и макеты памятников',
    },
  },
  en: {
    '/previews': {
      title: 'Order YouTube thumbnails and music covers — Vetor Studio',
      description: 'Custom YouTube thumbnails and music cover design: click-worthy thumbnails and release covers made to order. Vetor design studio, working remotely worldwide.',
      keywords: 'order youtube thumbnail, custom thumbnail design, youtube thumbnail designer for hire, thumbnail design service, music cover design, album cover design',
      image: '/og/previews.png',
      service: 'YouTube thumbnail and music cover design',
      heading: 'Custom YouTube thumbnails and covers',
    },
    '/fonts': {
      title: 'Vetor original fonts — Cyrillic typefaces to download | Vetor Studio',
      description: 'Original Vetor typefaces with Cyrillic support: display and text fonts for headlines, covers, and branding. Download via Telegram bot. Need a bespoke typeface — we design one to order.',
      keywords: 'original fonts, download font, cyrillic font, display font, headline font, custom font design',
      image: '/og/fonts.png',
      service: 'Original fonts and custom typeface design',
      heading: 'Vetor original fonts',
    },
    '/blog': {
      title: 'Blog on design, thumbnails and branding — Vetor Studio',
      description: 'Articles from Vetor design studio on thumbnails, click-through rate, covers, and branding.',
      image: '/og/blog.png',
      heading: 'Vetor studio blog',
    },
    '/about': {
      title: 'About — designer Kirill Sheludko, Vetor (Krasnodar)',
      description: 'Kirill Sheludko — founder of Vetor studio and a versatile designer from Krasnodar: thumbnails, logos, brand identity, websites, plus plugins, CRM, and automation for business.',
      heading: 'About Vetor studio',
    },
    '/privacy': {
      title: 'Privacy policy — Vetor Studio',
      description: 'How Vetor studio processes personal data: what data, why, storage, and your rights.',
      heading: 'Privacy policy',
    },
    '/design': {
      title: 'Design services — logos, brand identity, channel art | Vetor Studio',
      description: 'Design to order: logos, brand identity, YouTube channel art, and stickers. Vetor design studio — order design remotely.',
      keywords: 'design services, order design, graphic design, logo design, brand identity, channel art',
      image: '/og/design.png',
      service: 'Graphic design services',
      heading: 'Design to order',
    },
    '/price': {
      title: 'Pricing for thumbnails, logos, covers and channel art — Vetor Studio',
      description: 'Pricing for YouTube thumbnails, logos, banners, and channel art. Clear price list, no mandatory calls.',
      image: '/og/price.png',
      heading: 'Vetor studio pricing',
    },
    '/plugins': {
      title: 'Vetor plugins — tools for graphics editors',
      description: 'Vetor plugins: tools that speed up routine work in graphics editors. Resto is available now — photo restoration and monument layouts.',
      image: '/og/plugins.png',
      heading: 'Vetor plugins',
    },
    '/plugins/resto': {
      title: 'Resto — old photo restoration and monument layouts — Vetor Studio',
      description: 'Resto — a plugin for fast restoration of old photos and building portrait layouts for monuments. Subscription access via Telegram bot @VetorPluginBOT.',
      image: '/og/plugins.png',
      heading: 'Resto — photo restoration and monument layouts',
    },
  },
};

const CATEGORY_META = {
  ru: {
    restoration: {
      title: 'Реставрация старых фото на заказ — восстановление фотографий | Vetor Studio',
      description: 'Реставрация старых и повреждённых фотографий на заказ: восстановление, удаление царапин, ЧБ и колоризация. Закажите реставрацию фото в студии Vetor.',
      keywords: 'реставрация фото, реставрация старых фотографий, восстановление фото, реставрация фотографий на заказ, колоризация фото',
      service: 'Реставрация старых фотографий',
      heading: 'Реставрация старых фото на заказ',
    },
    'large-projects': {
      title: 'Крупные проекты и брендинг под ключ — кейсы | Vetor Studio',
      description: 'Крупные проекты студии Vetor: фирменный стиль, брендинг и комплексное оформление под ключ. Разбор кейсов и полный цикл работы.',
      keywords: 'брендинг, фирменный стиль, комплексный дизайн, брендинг под ключ, дизайн-кейсы',
      service: 'Брендинг и комплексный дизайн под ключ',
      heading: 'Крупные проекты и брендинг под ключ',
    },
  },
  en: {
    restoration: {
      title: 'Old photo restoration service — restore photographs | Vetor Studio',
      description: 'Restoration of old and damaged photographs to order: repair, scratch removal, black-and-white and colorization. Order photo restoration at Vetor studio.',
      keywords: 'photo restoration, old photo restoration, restore photographs, photo restoration service, photo colorization',
      service: 'Old photograph restoration',
      heading: 'Old photo restoration service',
    },
    'large-projects': {
      title: 'Large projects and end-to-end branding — case studies | Vetor Studio',
      description: 'Large projects by Vetor studio: brand identity, branding, and end-to-end design. Case studies and full-cycle work.',
      keywords: 'branding, brand identity, full-service design, end-to-end branding, design case studies',
      service: 'Branding and end-to-end design',
      heading: 'Large projects and end-to-end branding',
    },
  },
};

function collectMeta(lang, { videos, music, blog, gallery, tags, tools = [], absoluteImage, domain }) {
  const meta = new Map();

  for (const item of asArray(videos)) {
    if (!item?.id) continue;
    const name = item[t(lang, 'ruTitle', 'enTitle')] || item.ruTitle || item.enTitle || item.id;
    const description = truncate(
      item[t(lang, 'ruDescription', 'enDescription')]
        || t(
          lang,
          `Работа студии дизайна Vetor — превью YouTube «${name}»${item.channelName ? ` для канала ${item.channelName}` : ''}.`,
          `Vetor design studio work — YouTube thumbnail "${name}"${item.channelName ? ` for the channel ${item.channelName}` : ''}.`,
        ),
    );
    const thumb = absoluteImage(toOptimizedPath(item.thumbnail));
    const jsonld = [{
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name,
      description,
      thumbnailUrl: thumb ? [thumb] : undefined,
      uploadDate: item.createdAt || undefined,
      creator: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
    }];
    meta.set(`/work/${item.id}`, { title: `${name} — Vetor Studio`, ogTitle: name, heading: name, description, image: toOptimizedPath(item.thumbnail), jsonld });
  }

  for (const item of asArray(music)) {
    if (!item?.id) continue;
    const name = item[t(lang, 'ruTitle', 'enTitle')] || item.ruTitle || item.enTitle || item.id;
    const description = truncate(
      item.description
        || t(
          lang,
          `Обложка трека «${name}»${item.artistName ? ` — ${item.artistName}` : ''}. Студия дизайна Vetor.`,
          `Cover art for the track "${name}"${item.artistName ? ` — ${item.artistName}` : ''}. Vetor design studio.`,
        ),
    );
    const jsonld = [{
      '@context': 'https://schema.org',
      '@type': 'MusicRecording',
      name,
      image: absoluteImage(toOptimizedPath(item.cover)) || undefined,
      byArtist: item.artistName ? { '@type': 'MusicGroup', name: item.artistName } : undefined,
      creator: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
    }];
    meta.set(`/work/${item.id}`, { title: `${name} — Vetor Studio`, ogTitle: name, heading: name, description, image: toOptimizedPath(item.cover), jsonld });
  }

  for (const post of asArray(blog)) {
    if (!post?.id) continue;
    const name = post[t(lang, 'ruTitle', 'enTitle')] || post.ruTitle || post.enTitle || post.id;
    let desc = post[t(lang, 'ruDescription', 'enDescription')] || post.ruDescription || post.enDescription || '';
    if (!desc) {
      const textBlock = (post.blocks || []).find((b) => b?.type === 'text' && (b.ruText || b.enText));
      desc = textBlock?.[t(lang, 'ruText', 'enText')] || textBlock?.ruText || textBlock?.enText || '';
    }
    const description = truncate(desc || t(lang, `Статья студии дизайна Vetor: ${name}.`, `Vetor design studio article: ${name}.`));
    const cover = post.cover ? absoluteImage(post.cover) : undefined;
    const jsonld = [{
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: name,
      description,
      image: cover || undefined,
      datePublished: post.createdAt || undefined,
      dateModified: post.updatedAt || post.createdAt || undefined,
      author: { '@type': 'Person', name: 'Кирилл Шелудько', url: 'https://profi.ru/profile/SheludkoKN/' },
      publisher: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
      inLanguage: lang === 'ru' ? 'ru-RU' : 'en-US',
    }];
    meta.set(`/blog/${post.id}`, { title: `${name} — ${t(lang, 'Блог Vetor Studio', 'Vetor Studio Blog')}`, ogTitle: name, heading: name, description, image: post.cover, jsonld });
  }

  for (const item of asArray(gallery)) {
    if (!item?.id) continue;
    const name = item[t(lang, 'ruTitle', 'enTitle')] || item.ruTitle || item.enTitle || item.title || item.id;
    const description = truncate(
      item[t(lang, 'ruDescription', 'enDescription')] || item.ruDescription || item.description
        || t(lang, `Дизайн-работа студии Vetor: ${name}.`, `Design work by Vetor studio: ${name}.`),
    );
    const imgSrc = item.image || item.cover || item.images?.[0]?.src || item.thumbnail;
    const jsonld = [{
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      name,
      description,
      contentUrl: absoluteImage(toOptimizedPath(imgSrc)) || undefined,
      creator: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
    }];
    meta.set(`/design/item/${item.id}`, { title: `${name} — ${t(lang, 'Дизайн Vetor Studio', 'Vetor Studio Design')}`, ogTitle: name, heading: name, description, image: toOptimizedPath(imgSrc), jsonld });
  }

  for (const tag of asArray(tags)) {
    if (!tag?.slug) continue;
    const label = tag[t(lang, 'ruLabel', 'enLabel')] || tag.ruLabel || tag.enLabel || tag.label || tag.slug;
    meta.set(`/tag/${tag.slug}`, {
      title: `${label} — ${t(lang, 'работы Vetor Studio', 'Vetor Studio work')}`,
      heading: label,
      description: truncate(t(
        lang,
        `Работы студии дизайна Vetor по теме «${label}»: превью YouTube, обложки и брендинг.`,
        `Vetor design studio work tagged "${label}": YouTube thumbnails, covers, and branding.`,
      )),
    });
  }

  for (const [slug, value] of Object.entries(CATEGORY_META[lang])) {
    const pathname = `/design/category/${slug}`;
    if (!meta.has(pathname)) meta.set(pathname, { image: '/og/design.png', ...value });
  }

  for (const [pathname, value] of Object.entries(SECTION_META[lang])) {
    if (!meta.has(pathname)) meta.set(pathname, value);
  }

  // Студия инструментов: хаб + страница каждого готового тула (client-side).
  const studioName = t(lang, 'Верстак', 'Verstak');
  if (!meta.has('/tools')) {
    meta.set('/tools', {
      title: t(lang, `${studioName} — инструменты для дизайнеров`, `${studioName} — tools for designers`),
      heading: t(lang, 'Инструменты для дизайнеров', 'Tools for designers'),
      description: t(
        lang,
        'Бесплатные онлайн-инструменты для цвета, изображений и вектора — всё считается прямо в браузере, без регистрации и загрузки файлов на сервер.',
        'Free online tools for color, images and vector — everything runs right in your browser, no sign-up, nothing uploaded to a server.',
      ),
      image: '/og/default.png',
    });
  }
  for (const tool of tools) {
    if (tool.status !== 'ready') continue;
    const pathname = `/tools/${tool.slug}`;
    if (meta.has(pathname)) continue;
    const title = tool[lang]?.title || tool.slug;
    const desc = tool[lang]?.desc || '';
    meta.set(pathname, {
      title: `${title} — ${studioName}`,
      ogTitle: title,
      heading: title,
      description: desc,
      image: '/og/default.png',
      jsonld: [{
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: title,
        description: desc,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web browser',
        url: `${domain}${lang === 'en' ? '/en' : ''}${pathname}`,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
        provider: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
      }],
    });
  }

  return meta;
}

function buildBreadcrumb(logicalPath, lang, langUrl, heading) {
  const list = [{ '@type': 'ListItem', position: 1, name: t(lang, 'Главная', 'Home'), item: langUrl('/') }];
  let sectionPath = null;
  if (logicalPath.startsWith('/work/') || logicalPath.startsWith('/tag/')) sectionPath = '/previews';
  else if (logicalPath.startsWith('/design')) sectionPath = '/design';
  else if (logicalPath.startsWith('/blog')) sectionPath = '/blog';
  else if (logicalPath.startsWith('/plugins')) sectionPath = '/plugins';
  else if (SECTION_CRUMB[lang][logicalPath]) sectionPath = logicalPath;

  const isSectionRoot = sectionPath === logicalPath;
  if (sectionPath && SECTION_CRUMB[lang][sectionPath]) {
    list.push({ '@type': 'ListItem', position: 2, name: SECTION_CRUMB[lang][sectionPath], item: langUrl(sectionPath) });
  }
  if (sectionPath && !isSectionRoot && heading) {
    list.push({ '@type': 'ListItem', position: list.length + 1, name: heading, item: langUrl(logicalPath) });
  }
  if (list.length < 2) return null;
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list };
}

async function main() {
  const [siteConfig, tags, videos, music, blog, gallery, toolsData] = await Promise.all([
    readJson('siteConfig.json', {}),
    readJson('tags.json', []),
    readJson('videos.json', []),
    readJson('music.json', []),
    readJson('blog.json', []),
    readJson('gallery.json', []),
    readJson('toolsData.json', { tools: [] }),
  ]);
  const tools = toolsData.tools || [];

  let domain = (siteConfig.domain || 'https://vetor-studio.ru').replace(/\/+$/, '');
  try {
    const parsed = new URL(domain);
    domain = `${parsed.protocol}//${parsed.host}`;
  } catch { /* keep as-is */ }

  const telegramUrl = siteConfig.contacts?.telegramUrl || 'https://t.me/felwory';
  const contactEmail = siteConfig.contacts?.email || undefined;
  const contactPhone = siteConfig.contacts?.phoneRaw || siteConfig.contacts?.phone || undefined;
  const localizedSiteName = { ru: siteConfig.siteName?.ru || 'Студия дизайна Vetor', en: siteConfig.siteName?.en || 'Vetor Design Studio' };

  const absoluteImage = (src) => {
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) return src;
    return `${domain}${src.startsWith('/') ? '' : '/'}${src}`;
  };

  const metaByLang = {
    ru: collectMeta('ru', { videos, music, blog, gallery, tags, tools, absoluteImage, domain }),
    en: collectMeta('en', { videos, music, blog, gallery, tags, tools, absoluteImage, domain }),
  };

  const sitemapXml = await readFile(sitemapPath, 'utf8');
  const sourceHtml = await readFile(sourceHtmlPath, 'utf8');
  const locations = Array.from(sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g), (m) => decodeXml(m[1]));

  let generated = 0;
  let enriched = 0;

  // Готовит финальный HTML для одной страницы (по логическому пути без префикса
  // языка). Пишем оба зеркала: RU (корень) и EN (/en/...).
  function renderShell(lang, logicalPath) {
    const langUrl = (p) => `${domain}${lang === 'en' ? '/en' : ''}${p === '/' ? '' : p}` || domain;
    const withLang = (p) => (lang === 'en' ? (p === '/' ? '/en' : `/en${p}`) : (p === '/' ? '/' : p));
    const selfUrl = langUrl(logicalPath);
    const ruUrl = `${domain}${logicalPath === '/' ? '/' : logicalPath}`;
    const enUrl = `${domain}/en${logicalPath === '/' ? '' : logicalPath}`;
    const defaults = DEFAULTS[lang];
    const m = metaByLang[lang].get(logicalPath);

    let html = stripTemplateJsonLd(sourceHtml);
    html = setHtmlLang(html, lang);
    html = setCanonical(html, selfUrl);
    html = setMetaProp(html, 'og:url', selfUrl);
    html = setMetaProp(html, 'og:locale', lang === 'ru' ? 'ru_RU' : 'en_US');
    html = injectHreflang(html, ruUrl, enUrl);

    const title = m?.title || defaults.title;
    const description = m?.description || defaults.description;
    const keywords = m?.keywords || defaults.keywords;
    const ogTitle = m?.ogTitle || title;
    const heading = m?.heading || defaults.heading;

    html = setTitle(html, title);
    html = setMetaName(html, 'description', description);
    html = setMetaName(html, 'keywords', keywords);
    html = setMetaProp(html, 'og:title', ogTitle);
    html = setMetaProp(html, 'og:description', description);
    html = setMetaName(html, 'twitter:title', ogTitle);
    html = setMetaName(html, 'twitter:description', description);

    // OG-картинка: для /en секционные баннеры /og/x.png → /og/x-en.png (item-webp
    // из /optimized не трогаем). Дефолт — /og/default(-en).png.
    const localizeOg = (src) => {
      if (lang === 'en' && /^\/og\/[a-z0-9-]+\.png$/i.test(src)) {
        return src.replace(/\.png$/i, '-en.png');
      }
      return src;
    };
    const ogImage = absoluteImage(localizeOg(m?.image || '/og/default.png'));
    if (ogImage) {
      html = setMetaProp(html, 'og:image', ogImage);
      html = setMetaName(html, 'twitter:image', ogImage);
      html = setMetaName(html, 'twitter:card', 'summary_large_image');
    }

    // Structured data, baked so no-JS crawlers (Yandex) see it too. data-seo-id
    // на website/service/breadcrumb/article совпадает с клиентским upsertJsonLd
    // (App.jsx) — при загрузке JS клиент заменяет эти блоки, а не дублирует.
    const ld = [];

    // Сайт целиком: WebSite + SearchAction (sitelinks searchbox).
    ld.push({
      id: 'website',
      data: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: localizedSiteName[lang],
        alternateName: ['Vetor Studio', 'Ветор', 'Vetor'],
        url: domain,
        inLanguage: lang === 'ru' ? 'ru-RU' : 'en-US',
        publisher: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${domain}${lang === 'en' ? '/en' : ''}/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    });

    // Организация/студия: ProfessionalService (E-E-A-T: адрес, контакты, sameAs).
    ld.push({
      id: 'service',
      data: {
        '@context': 'https://schema.org',
        '@type': 'ProfessionalService',
        name: 'Vetor Studio',
        alternateName: t(lang, 'Студия дизайна Vetor', 'Vetor Design Studio'),
        url: domain,
        image: `${domain}/og/default.png`,
        areaServed: ['RU', 'Worldwide'],
        address: { '@type': 'PostalAddress', addressLocality: t(lang, 'Краснодар', 'Krasnodar'), addressCountry: 'RU' },
        serviceType: t(
          lang,
          ['Дизайн превью для YouTube', 'Обложки треков', 'Логотипы и фирменный стиль', 'Разработка шрифта', 'Реставрация фото'],
          ['YouTube thumbnail design', 'Music cover design', 'Logo & brand identity', 'Custom fonts', 'Photo restoration'],
        ),
        sameAs: ['https://profi.ru/profile/SheludkoKN/', telegramUrl, 'https://ru.pinterest.com/VetorDesignStudio/'].filter(Boolean),
        email: contactEmail,
        telephone: contactPhone,
        taxID: '233505486022',
      },
    });

    const breadcrumb = buildBreadcrumb(logicalPath, lang, langUrl, heading);
    if (breadcrumb) ld.push({ id: 'breadcrumb', data: breadcrumb });
    if (m?.service) {
      ld.push({
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: m.service,
        serviceType: m.service,
        description,
        url: selfUrl,
        areaServed: ['RU', 'Worldwide'],
        provider: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
      });
    }
    if (Array.isArray(m?.jsonld)) {
      // BlogPosting тегируем id="article" — клиент (App.jsx) заменит его при JS.
      for (const entry of m.jsonld) {
        ld.push(entry?.['@type'] === 'BlogPosting' ? { id: 'article', data: entry } : entry);
      }
    }
    if (logicalPath === '/about') {
      ld.push({
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: 'Кирилл Шелудько',
        jobTitle: t(lang, 'Дизайнер, основатель студии Vetor', 'Designer, founder of Vetor studio'),
        url: langUrl('/about'),
        image: `${domain}/owner/kirill-sheludko.png`,
        worksFor: { '@type': 'Organization', name: 'Vetor Studio', url: domain },
        address: { '@type': 'PostalAddress', addressLocality: t(lang, 'Краснодар', 'Krasnodar'), addressCountry: 'RU' },
        sameAs: ['https://profi.ru/profile/SheludkoKN/', telegramUrl],
      });
    }
    html = injectJsonLd(html, ld);

    const navLinks = NAV_LINKS[lang].map(([label, href]) => [label, withLang(href)]);
    html = setFallbackBody(html, {
      heading,
      description,
      navLinks,
      homeHref: withLang('/'),
      telegramUrl,
      lang,
    });

    if (m) enriched += 1;
    return html;
  }

  for (const location of locations) {
    const routeUrl = new URL(location);
    const rawPath = decodeURIComponent(routeUrl.pathname).replace(/\/+$/, '') || '/';
    const isEn = rawPath === '/en' || rawPath.startsWith('/en/');
    const lang = isEn ? 'en' : 'ru';
    const logicalPath = isEn ? (rawPath.slice(3) || '/') : rawPath;

    const targetDirectory = getSafeRouteDirectory(rawPath);
    if (!targetDirectory) continue; // RU home — handled after the loop from pristine source

    const html = renderShell(lang, logicalPath);
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(path.join(targetDirectory, 'index.html'), html, 'utf8');
    generated += 1;
  }

  // RU home (dist/index.html) — enrich in place from the pristine source.
  const homeHtml = renderShell('ru', '/');
  await writeFile(sourceHtmlPath, homeHtml, 'utf8');
  generated += 1;

  console.log(`Generated ${generated} static route shells (${enriched} with per-page SEO meta).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
