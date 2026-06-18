import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/HeaderShell';
import SearchBar from './components/SearchBar';
import TagFilter from './components/TagFilter';
import CardGrid from './components/CardGrid';
import DetailModal from './components/DetailModal';
import EmptyState from './components/EmptyState';
import SkeletonGrid from './components/SkeletonGrid';
import PromoBanner from './components/PromoBanner';
import PriceModal from './components/PriceModal';
import BlogPage from './components/BlogPage';
import BlogModal from './components/BlogModal';
import GalleryPage from './components/GalleryPage';
import GalleryModal from './components/GalleryModal';
import PluginsPage from './components/PluginsPage';
import NotFoundPage from './components/NotFoundPage';
import Footer from './components/Footer';
import initialVideos from './data/videos.json';
import initialMusic from './data/music.json';
import initialGalleryItems from './data/gallery.json';
import initialPricing from './data/pricing.json';
import initialTags from './data/tags.json';
import initialSectionCopy from './data/sectionCopy';
import { activePalette, defaultPalette, paletteStorageKey } from './data/palette';
import initialSiteConfig from './data/siteConfig';
import { designCategoryList, normalizeDesignCategory } from './data/designCategories';
import { useLanguage } from './hooks/useLanguage';
import { filterWorks, sortWorks } from './utils/filter';
import { getLocalizedText } from './utils/i18n';
import { applyPalette, normalizePalette } from './utils/palette';
import { withBase } from './utils/format';
import { buildUrl, parseRoute } from './utils/routing';

const LOADING_DELAY = 280;
const DEFAULT_SECTIONS_VISIBILITY = {
  home: true,
  blog: true,
  gallery: true,
  price: true,
  plugins: true,
};
const ContentStudio = lazy(() => import('./components/ContentStudio'));
const PricingEditorModal = lazy(() => import('./components/PricingEditorModal'));
const BlogComposerModal = lazy(() => import('./components/BlogComposerModal'));
const GalleryItemEditorModal = lazy(() => import('./components/GalleryItemEditorModal'));
const JsonEditModal = lazy(() => import('./components/JsonEditModal'));
const TextEditModal = lazy(() => import('./components/TextEditModal'));
const PaletteModal = lazy(() => import('./components/PaletteModal'));

function isStudioModeEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return window.location.hostname === 'localhost' || params.get('studio') === '1';
}

function isLocalPublishAvailable() {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function decorateItems(items, collection) {
  return items.map((item, index) => ({
    ...item,
    _collection: collection,
    _sourceIndex: index,
    _studioKey: `${collection}-${index}`,
  }));
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function filterEditorialItems(items, query) {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const images = item.images || [];
    const haystack = [
      item.ruTitle,
      item.enTitle,
      item.ruDescription,
      item.enDescription,
      ...(item.tags || []),
      ...images.flatMap((image) => [image.ruAlt, image.enAlt, image.src]),
    ]
      .filter(Boolean)
      .map(normalize)
      .join(' ');

    return haystack.includes(normalizedQuery);
  });
}

function normalizeSectionsConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = {
    ...DEFAULT_SECTIONS_VISIBILITY,
    ...source,
  };
  const hasVisibleSection = Object.values(normalized).some(Boolean);
  return hasVisibleSection ? normalized : DEFAULT_SECTIONS_VISIBILITY;
}

function isSectionKnown(section) {
  return ['home', 'blog', 'gallery', 'price', 'plugins'].includes(section);
}

function loadEditableData(storageKey, fallback) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      return fallback;
    }

    const parsed = JSON.parse(saved);

    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? parsed : fallback;
    }

    if (fallback && typeof fallback === 'object') {
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    }

    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveEditableData(storageKey, value) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      // Keep app working when localStorage quota is exceeded (large blog media blocks).
      console.warn(`[storage] Failed to save ${storageKey}`, error);
    }
  }
}

function stripStudioFields(items) {
  return items.map(({ _collection, _sourceIndex, _studioKey, ...item }) => item);
}

function cleanLegacyBlogSamples(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      ...item,
      id: item.id || `blog-${index + 1}`,
      tags: Array.isArray(item.tags) ? item.tags : [],
      blocks: Array.isArray(item.blocks) ? item.blocks.filter(Boolean) : [],
    }));
}

function normalizeGalleryItem(item, index) {
  const normalizedCategory = normalizeDesignCategory(item?.designCategory || 'all');
  const youtubeChannel = item?.youtubeChannel && typeof item.youtubeChannel === 'object'
    ? item.youtubeChannel
    : {};
  const stickers = item?.stickers && typeof item.stickers === 'object'
    ? item.stickers
    : {};

  return {
    ...item,
    id: item?.id || `gallery-${String(index + 1).padStart(3, '0')}`,
    designCategory: normalizedCategory,
    youtubeChannel: {
      name: youtubeChannel.name || '',
      handle: youtubeChannel.handle || '',
      metaRu: youtubeChannel.metaRu || '',
      metaEn: youtubeChannel.metaEn || '',
      ctaUrl: youtubeChannel.ctaUrl || '',
      ctaRu: youtubeChannel.ctaRu || '',
      ctaEn: youtubeChannel.ctaEn || '',
      cover: youtubeChannel.cover || '',
      avatar: youtubeChannel.avatar || '',
    },
    stickers: {
      primaryRu: stickers.primaryRu || '',
      primaryEn: stickers.primaryEn || '',
      primaryUrl: stickers.primaryUrl || '',
      secondaryRu: stickers.secondaryRu || '',
      secondaryEn: stickers.secondaryEn || '',
      secondaryUrl: stickers.secondaryUrl || '',
    },
  };
}

function normalizeGalleryCollection(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => normalizeGalleryItem(item, index));
}

function createNextGalleryId(items) {
  const max = items.reduce((highest, item) => {
    const match = String(item.id || '').match(/^gallery-(\d+)$/i);
    if (!match) {
      return highest;
    }
    return Math.max(highest, Number(match[1]));
  }, 0);

  return `gallery-${String(max + 1).padStart(3, '0')}`;
}

function upsertMetaByName(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function upsertMetaByProperty(property, content) {
  let meta = document.querySelector(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', property);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function upsertJsonLd(id, payload) {
  let script = document.querySelector(`script[type="application/ld+json"][data-seo-id="${id}"]`);
  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-seo-id', id);
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(payload);
}

function App() {
  const { language, setLanguage } = useLanguage();
  const [routeState, setRouteState] = useState(() =>
    typeof window === 'undefined' ? parseRoute({ pathname: '/', search: '' }) : parseRoute(window.location),
  );
  const routeSyncRef = useRef(false);
  const [query, setQuery] = useState(routeState.query || '');
  const [selectedTags, setSelectedTags] = useState(routeState.tags || []);
  const [activeItem, setActiveItem] = useState(null);
  const [activeSection, setActiveSection] = useState(routeState.section || 'home');
  const [activeDesignCategory, setActiveDesignCategory] = useState(normalizeDesignCategory(routeState.designCategory || 'all'));
  const [activeBlogPost, setActiveBlogPost] = useState(null);
  const [editingBlogPost, setEditingBlogPost] = useState(null);
  const [isBlogComposerOpen, setIsBlogComposerOpen] = useState(false);
  const [activeGalleryItem, setActiveGalleryItem] = useState(null);
  const [editingGalleryItem, setEditingGalleryItem] = useState(null);
  const [isPriceOpen, setIsPriceOpen] = useState(Boolean(routeState.isPriceOpen));
  const [isPricingEditorOpen, setIsPricingEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState(null);
  const [textEditorTarget, setTextEditorTarget] = useState(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [publishStatus, setPublishStatus] = useState('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioSelectionKey, setStudioSelectionKey] = useState(null);
  const [projectHandle, setProjectHandle] = useState(null);
  const [siteConfig, setSiteConfig] = useState(initialSiteConfig);
  const [tagsConfig, setTagsConfig] = useState(() => loadEditableData('portfolio-tags-json', initialTags));
  const [videoItems, setVideoItems] = useState(() => decorateItems(initialVideos, 'video'));
  const [musicItems, setMusicItems] = useState(() => decorateItems(initialMusic, 'music'));
  const [pricing, setPricing] = useState(() => loadEditableData('portfolio-pricing-json', initialPricing));
  const [sectionCopy, setSectionCopy] = useState(() => loadEditableData('portfolio-section-copy', initialSectionCopy));
  const [palette, setPalette] = useState(() => normalizePalette(loadEditableData(paletteStorageKey, activePalette)));
  const [blogPosts, setBlogPosts] = useState(() => cleanLegacyBlogSamples(loadEditableData('portfolio-blog-json', [])));
  const [galleryItems, setGalleryItems] = useState(() =>
    normalizeGalleryCollection(loadEditableData('portfolio-gallery-json', initialGalleryItems)),
  );
  const [isRouteNotFound, setIsRouteNotFound] = useState(Boolean(routeState.isNotFound));

  const studioEnabled = useMemo(() => isStudioModeEnabled(), []);
  const canPublish = useMemo(() => isLocalPublishAvailable(), []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsLoading(false), LOADING_DELAY);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  useEffect(() => {
    saveEditableData('portfolio-tags-json', tagsConfig);
  }, [tagsConfig]);

  useEffect(() => {
    if (blogPosts.length > 0) {
      return undefined;
    }

    let cancelled = false;

    fetch(withBase('/data/blog.json'), { cache: 'no-cache' })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((text) => {
        if (cancelled) {
          return;
        }

        const parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
        const initialBlogPosts = Array.isArray(parsed) ? parsed : [];
        const posts = cleanLegacyBlogSamples(loadEditableData('portfolio-blog-json', initialBlogPosts));
        setBlogPosts(posts);
      })
      .catch(() => {
        // keep empty list when json is unavailable
      });

    return () => {
      cancelled = true;
    };
  }, [blogPosts.length]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function handlePopState() {
      setRouteState(parseRoute(window.location));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const sectionVisibility = useMemo(
    () => normalizeSectionsConfig(siteConfig.sections),
    [siteConfig.sections],
  );
  const allWorks = useMemo(() => sortWorks([...videoItems, ...musicItems]), [videoItems, musicItems]);
  const tagsMap = useMemo(() => new Map(tagsConfig.map((tag) => [tag.slug, tag])), [tagsConfig]);
  const visibleSections = useMemo(() => sectionVisibility, [sectionVisibility]);
  const studioSelectedItem = useMemo(
    () => allWorks.find((item) => item._studioKey === studioSelectionKey) ?? null,
    [allWorks, studioSelectionKey],
  );

  const filteredWorks = useMemo(
    () => filterWorks(allWorks, query, selectedTags, tagsMap),
    [allWorks, query, selectedTags, tagsMap],
  );
  const featuredFilteredWorks = useMemo(() => filteredWorks.filter((item) => item.featured), [filteredWorks]);
  const regularFilteredWorks = useMemo(() => filteredWorks.filter((item) => !item.featured), [filteredWorks]);
  const filteredBlogPosts = useMemo(() => filterEditorialItems(blogPosts, query), [blogPosts, query]);
  const filteredGalleryItems = useMemo(() => filterEditorialItems(galleryItems, query), [galleryItems, query]);
  const filteredDesignItems = useMemo(() => {
    if (activeDesignCategory === 'all') {
      return filteredGalleryItems;
    }
    return filteredGalleryItems.filter((item) => normalizeDesignCategory(item.designCategory) === activeDesignCategory);
  }, [activeDesignCategory, filteredGalleryItems]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    routeSyncRef.current = true;

    const nextQuery = routeState.query || '';
    const nextTags = Array.isArray(routeState.tags) ? routeState.tags : [];
    const nextDesignCategory = normalizeDesignCategory(routeState.designCategory || 'all');
    const targetSection = routeState.workId
      ? 'home'
      : routeState.blogId
        ? 'blog'
        : routeState.galleryId
          ? 'gallery'
          : routeState.section;
    const normalizedSection = isSectionKnown(targetSection) ? targetSection : 'home';
    const sectionAllowed = Boolean(visibleSections[normalizedSection]);

    const nextWork = routeState.workId ? allWorks.find((item) => item.id === routeState.workId) ?? null : null;
    const nextBlog = routeState.blogId ? blogPosts.find((post) => post.id === routeState.blogId) ?? null : null;
    const nextGallery = routeState.galleryId
      ? galleryItems.find((item) => item.id === routeState.galleryId) ?? null
      : null;

    const hasMissingLinkedEntity = Boolean(
      (routeState.workId && !nextWork)
      || (routeState.blogId && !nextBlog)
      || (routeState.galleryId && !nextGallery),
    );

    setQuery(nextQuery);
    setSelectedTags(nextTags);
    setActiveDesignCategory(nextDesignCategory);

    if (sectionAllowed && !routeState.isNotFound && !hasMissingLinkedEntity) {
      setActiveSection(normalizedSection);
      setActiveItem(nextWork);
      setActiveBlogPost(nextBlog);
      setActiveGalleryItem(nextGallery);
      setIsPriceOpen(Boolean(routeState.isPriceOpen || normalizedSection === 'price'));
      setIsRouteNotFound(false);
    } else {
      setActiveSection('home');
      setActiveItem(null);
      setActiveBlogPost(null);
      setActiveGalleryItem(null);
      setIsPriceOpen(false);
      setIsRouteNotFound(true);
    }

    const timerId = window.setTimeout(() => {
      routeSyncRef.current = false;
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [allWorks, blogPosts, galleryItems, routeState, visibleSections]);

  useEffect(() => {
    if (typeof window === 'undefined' || routeSyncRef.current || isRouteNotFound) {
      return;
    }

    const url = buildUrl({
      section: activeSection,
      query,
      tags: selectedTags,
      workId: activeItem?.id || '',
      blogId: activeBlogPost?.id || '',
      galleryId: activeGalleryItem?.id || '',
      designCategory: activeDesignCategory,
      isPriceOpen,
    });
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (url !== currentUrl) {
      window.history.replaceState({}, '', url);
      setRouteState(parseRoute(window.location));
    }
  }, [
    activeBlogPost?.id,
    activeGalleryItem?.id,
    activeItem?.id,
    activeSection,
    isPriceOpen,
    isRouteNotFound,
    query,
    selectedTags,
    activeDesignCategory,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }

    const shouldNoIndex = studioEnabled || isRouteNotFound || !visibleSections[activeSection];
    robotsMeta.setAttribute('content', shouldNoIndex ? 'noindex, nofollow' : 'index, follow');
  }, [activeSection, isRouteNotFound, studioEnabled, visibleSections]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    document.documentElement.lang = language;

    const localizedSiteName = siteConfig.siteName?.[language] || siteConfig.siteName?.ru || 'Vetor Studio';
    const localizedTagline = siteConfig.siteTagline?.[language] || siteConfig.siteTagline?.ru || '';
    const remoteNote = language === 'ru'
      ? 'Работаем удаленно по России и за ее пределами.'
      : 'Working remotely across Russia and worldwide.';
    const suffix = ` | ${localizedSiteName}`;
    const normalizedQuery = query.trim();
    const localizedTagLabels = selectedTags
      .map((slug) => {
        const tag = tagsMap.get(slug);
        return tag?.[language] || tag?.ru || tag?.en || slug;
      })
      .filter(Boolean);
    const tagsHuman = localizedTagLabels.join(', ');
    const hasTagFilter = localizedTagLabels.length > 0;
    const hasSearchQuery = Boolean(normalizedQuery);
    const brandBoost = language === 'ru' ? 'Vetor Studio (Ветор)' : 'Vetor Studio';

    let title = localizedSiteName;
    let description = [localizedTagline, remoteNote].filter(Boolean).join(' ');

    if (isRouteNotFound) {
      title = language === 'ru' ? `Страница не найдена${suffix}` : `Page not found${suffix}`;
      description = language === 'ru'
        ? 'Запрошенная страница недоступна, скрыта или была перемещена.'
        : 'The requested page is unavailable, hidden, or moved.';
    } else if (activeItem) {
      const itemTitle = activeItem[language === 'ru' ? 'ruTitle' : 'enTitle'] || localizedSiteName;
      const itemAuthor = activeItem.type === 'video' ? activeItem.channelName : activeItem.artistName;
      title = `${itemTitle}${suffix}`;
      description = [itemAuthor, localizedTagline].filter(Boolean).join('. ');
    } else if (activeBlogPost) {
      const postTitle = activeBlogPost[language === 'ru' ? 'ruTitle' : 'enTitle'] || localizedSiteName;
      const postDescription = activeBlogPost[language === 'ru' ? 'ruDescription' : 'enDescription'];
      title = `${postTitle}${suffix}`;
      description = postDescription || localizedTagline;
    } else if (activeGalleryItem) {
      const galleryTitle = activeGalleryItem[language === 'ru' ? 'ruTitle' : 'enTitle'] || localizedSiteName;
      const galleryDescription = activeGalleryItem[language === 'ru' ? 'ruDescription' : 'enDescription'];
      title = `${galleryTitle}${suffix}`;
      description = galleryDescription || localizedTagline;
    } else if (activeSection === 'blog') {
      title = language === 'ru' ? `Блог${suffix}` : `Blog${suffix}`;
      description = language === 'ru'
        ? 'Публикации, процессы и разборы по превью, дизайну и упаковке медиа-проектов.'
        : 'Posts, process notes, and breakdowns on thumbnails, design, and media packaging.';
    } else if (activeSection === 'gallery') {
      title = language === 'ru' ? `Дизайн${suffix}` : `Design${suffix}`;
      description = language === 'ru'
        ? 'Дизайн-портфолио студии Vetor: логотипы, визитки, фирменный стиль, YouTube-оформление и стикеры.'
        : 'Vetor design portfolio: logos, business cards, brand identity, YouTube packaging, and stickers.';
    } else if (activeSection === 'plugins') {
      title = language === 'ru' ? `Плагины${suffix}` : `Plugins${suffix}`;
      description = language === 'ru'
        ? 'Раздел с плагинами, пресетами и дополнительными материалами студии.'
        : 'Section with plugins, presets, and extra studio resources.';
    } else if (activeSection === 'price' || isPriceOpen) {
      title = language === 'ru' ? `Прайс${suffix}` : `Pricing${suffix}`;
      description = language === 'ru'
        ? 'Прайс без созвонов: прозрачные цены на превью, обложки, баннеры и оформление канала.'
        : 'Pricing without calls: transparent rates for thumbnails, covers, banners, and channel design.';
    } else if (activeSection === 'home' && hasSearchQuery) {
      title = language === 'ru'
        ? `${normalizedQuery} — поиск работ | ${brandBoost}`
        : `${normalizedQuery} — work search | ${brandBoost}`;
      description = language === 'ru'
        ? `Результаты по запросу «${normalizedQuery}»: превью YouTube, обложки треков и дизайн-кейсы. ${brandBoost}.`
        : `Results for "${normalizedQuery}": YouTube thumbnails, music covers, and design cases by ${brandBoost}.`;
    } else if (activeSection === 'home' && hasTagFilter) {
      title = language === 'ru'
        ? `${tagsHuman} — работы и превью | ${brandBoost}`
        : `${tagsHuman} — works and thumbnails | ${brandBoost}`;
      description = language === 'ru'
        ? `Подборка работ по тегам: ${tagsHuman}. Превью, обложки и визуальный дизайн для медиа-проектов от ${brandBoost}.`
        : `Portfolio filtered by tags: ${tagsHuman}. Thumbnails, covers, and visual design by ${brandBoost}.`;
    } else {
      title = localizedSiteName;
      description = language === 'ru'
        ? `Студия дизайна Vetor: превью YouTube, обложки треков, логотипы, фирменный стиль, стикеры и оформление каналов. ${remoteNote}`
        : `Vetor design studio: YouTube thumbnails, music covers, logos, brand identity, stickers, and channel packaging. ${remoteNote}`;
    }

    document.title = title;
    upsertMetaByName('description', description);
    upsertMetaByName(
      'keywords',
      language === 'ru'
        ? 'vetor studio, ветор, студия дизайна, превью youtube, обложка трека, логотип, фирменный стиль, оформление канала, стикеры'
        : 'vetor design studio, youtube thumbnail design, music cover design, logo design, brand identity, channel branding, stickers',
    );

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }

    let canonicalDomain = (siteConfig.domain || window.location.origin).replace(/\/+$/, '');
    try {
      const normalizedDomain = new URL(canonicalDomain);
      canonicalDomain = `${normalizedDomain.protocol}//${normalizedDomain.host}`.replace(/\/+$/, '');
    } catch {
      // Keep editable value as fallback in studio mode.
    }

    const canonicalUrl = `${canonicalDomain}${window.location.pathname}${window.location.search}`;
    canonicalLink.setAttribute('href', canonicalUrl);

    upsertMetaByProperty('og:title', title);
    upsertMetaByProperty('og:description', description);
    upsertMetaByProperty('og:type', activeItem || activeBlogPost || activeGalleryItem ? 'article' : 'website');
    upsertMetaByProperty('og:url', canonicalUrl);

    upsertJsonLd('website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: localizedSiteName,
      alternateName: ['Vetor Studio', 'Ветор', 'Vetor'],
      url: canonicalDomain,
      inLanguage: language === 'ru' ? 'ru-RU' : 'en-US',
      publisher: {
        '@type': 'Organization',
        name: 'Vetor Studio',
        url: canonicalDomain,
      },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${canonicalDomain}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    });

    upsertJsonLd('service', {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      name: 'Vetor Studio',
      url: canonicalDomain,
      areaServed: 'RU, Worldwide',
      serviceType: [
        'YouTube thumbnail design',
        'Music cover design',
        'Channel branding',
      ],
      sameAs: [siteConfig.contacts?.telegramUrl].filter(Boolean),
      email: siteConfig.contacts?.email || undefined,
      telephone: siteConfig.contacts?.phoneRaw || siteConfig.contacts?.phone || undefined,
    });
  }, [
    activeBlogPost,
    activeGalleryItem,
    activeItem,
    activeSection,
    isPriceOpen,
    isRouteNotFound,
    language,
    query,
    selectedTags,
    tagsMap,
    siteConfig.contacts,
    siteConfig.domain,
    siteConfig.siteName,
    siteConfig.siteTagline,
  ]);

  function handleQueryChange(nextQuery) {
    setIsRouteNotFound(false);
    setQuery(nextQuery);
  }

  function handleToggleTag(tagSlug) {
    setIsRouteNotFound(false);
    if (activeSection !== 'home') {
      setActiveSection('home');
    }
    setSelectedTags((current) =>
      current.includes(tagSlug)
        ? current.filter((slug) => slug !== tagSlug)
        : [...current, tagSlug],
    );
  }

  function handleResetFilters() {
    setIsRouteNotFound(false);
    setActiveSection('home');
    setQuery('');
    setSelectedTags([]);
  }

  function handleSectionChange(nextSection) {
    if (!visibleSections[nextSection]) {
      setIsRouteNotFound(true);
      return;
    }

    setIsRouteNotFound(false);
    setActiveItem(null);
    setActiveBlogPost(null);
    setActiveGalleryItem(null);

    if (nextSection === 'price') {
      setActiveSection('price');
      setIsPriceOpen(true);
      return;
    }

    setActiveSection(nextSection);
    setIsPriceOpen(false);
  }

  function handleOpenWork(item) {
    setIsRouteNotFound(false);
    setActiveSection('home');
    setActiveBlogPost(null);
    setActiveGalleryItem(null);
    setIsPriceOpen(false);
    setActiveItem(item);
  }

  function handleOpenBlogPost(post) {
    setIsRouteNotFound(false);
    setActiveSection('blog');
    setActiveItem(null);
    setActiveGalleryItem(null);
    setIsPriceOpen(false);
    setActiveBlogPost(post);
  }

  function handleOpenGalleryItem(item) {
    setIsRouteNotFound(false);
    setActiveSection('gallery');
    setActiveItem(null);
    setActiveBlogPost(null);
    setIsPriceOpen(false);
    setActiveDesignCategory(normalizeDesignCategory(item?.designCategory || 'all'));
    setActiveGalleryItem(item);
  }

  function handleCloseWork() {
    setActiveItem(null);
  }

  function handleCloseBlogPost() {
    setActiveBlogPost(null);
  }

  function handleCloseGalleryItem() {
    setActiveGalleryItem(null);
  }

  function handleOpenPrice() {
    setIsRouteNotFound(false);
    setActiveSection('price');
    setActiveItem(null);
    setActiveBlogPost(null);
    setActiveGalleryItem(null);
    setIsPriceOpen(true);
  }

  function handleClosePrice() {
    if (activeSection === 'price') {
      setActiveSection('home');
    }
    setIsPriceOpen(false);
  }

  function handleOpenStudioForNew() {
    setStudioSelectionKey(null);
    setIsStudioOpen(true);
  }

  function handleOpenStudioForItem(item) {
    setActiveItem(null);
    setStudioSelectionKey(item._studioKey);
    setIsStudioOpen(true);
  }

  function openBlogComposer(post = null) {
    setEditingBlogPost(post);
    setIsBlogComposerOpen(true);
  }

  function handleSaveBlogPost(nextPost) {
    setBlogPosts((current) => {
      const exists = current.some((post) => post.id === nextPost.id);
      const nextPosts = exists
        ? current.map((post) => (post.id === nextPost.id ? nextPost : post))
        : [nextPost, ...current];

      saveEditableData('portfolio-blog-json', nextPosts);
      return nextPosts;
    });

    setActiveBlogPost((current) => (current?.id === nextPost.id ? nextPost : current));
  }

  function openJsonEditor(title, value, storageKey, onSave) {
    setEditorTarget({
      title,
      value,
      onSave: (nextValue) => {
        saveEditableData(storageKey, nextValue);
        onSave(nextValue);
      },
    });
  }

  function openSectionTextEditor(sectionKey) {
    const sectionNames = {
      ru: {
        promo: 'Прайс-плашка',
        gallery: 'Дизайн',
        blog: 'Блог',
      },
      en: {
        promo: 'Pricing banner',
        gallery: 'Design',
        blog: 'Blog',
      },
    };
    const title = language === 'ru'
      ? `Текст плашки: ${sectionNames.ru[sectionKey] || sectionKey}`
      : `Banner copy: ${sectionNames.en[sectionKey] || sectionKey}`;

    setTextEditorTarget({
      title,
      value: sectionCopy[sectionKey],
      fields: sectionKey === 'promo' ? ['eyebrow', 'title', 'text', 'button'] : ['eyebrow', 'title', 'text'],
      onSave: (nextValue) => {
        setSectionCopy((current) => {
          const nextCopy = {
            ...current,
            [sectionKey]: {
              ...(current[sectionKey] || {}),
              ...nextValue,
            },
          };
          saveEditableData('portfolio-section-copy', nextCopy);
          return nextCopy;
        });
      },
    });
  }

  function handleSavePalette(nextPalette) {
    const normalized = normalizePalette(nextPalette);
    saveEditableData(paletteStorageKey, normalized);
    setPalette(normalized);
  }

  function handleResetPalette() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(paletteStorageKey);
    }

    setPalette(defaultPalette);
  }

  function handleSavePricing(nextPricing) {
    saveEditableData('portfolio-pricing-json', nextPricing);
    setPricing(nextPricing);
  }

  function handleSaveGalleryItem(nextItem) {
    const normalizedItem = normalizeGalleryItem(nextItem, galleryItems.length);

    setGalleryItems((current) => {
      const hasExisting = Boolean(normalizedItem.id) && current.some((item) => item.id === normalizedItem.id);
      const itemForSave = hasExisting
        ? normalizedItem
        : {
            ...normalizedItem,
            id: normalizedItem.id || createNextGalleryId(current),
            createdAt: normalizedItem.createdAt || new Date().toISOString().slice(0, 10),
          };
      const nextItems = hasExisting
        ? current.map((item) => (item.id === itemForSave.id ? itemForSave : item))
        : [itemForSave, ...current];
      saveEditableData('portfolio-gallery-json', nextItems);
      return nextItems;
    });

    setActiveGalleryItem((current) => {
      if (!current) {
        return current;
      }
      const nextId = normalizedItem.id || current.id;
      return current.id === nextId ? { ...current, ...normalizedItem } : current;
    });
  }

  function handleDeleteGalleryItem(itemToDelete) {
    const title = itemToDelete[language === 'ru' ? 'ruTitle' : 'enTitle'] || itemToDelete.id;
    const confirmed = window.confirm(language === 'ru' ? `Удалить публикацию "${title}"?` : `Delete "${title}"?`);

    if (!confirmed) {
      return;
    }

    setGalleryItems((current) => {
      const nextItems = current.filter((item) => item.id !== itemToDelete.id);
      saveEditableData('portfolio-gallery-json', nextItems);
      return nextItems;
    });

    setActiveGalleryItem((current) => (current?.id === itemToDelete.id ? null : current));
  }

  function handleCreateGalleryItem() {
    setEditingGalleryItem({
      id: '',
      ruTitle: '',
      enTitle: '',
      ruDescription: '',
      enDescription: '',
      ratio: 'square',
      images: [],
      createdAt: new Date().toISOString().slice(0, 10),
      designCategory: activeDesignCategory === 'all' ? 'logos' : activeDesignCategory,
      youtubeChannel: {},
      stickers: {},
    });
  }

  async function handlePublishCloudflare() {
    if (publishStatus === 'publishing') {
      return;
    }

    setPublishStatus('publishing');

    try {
      const response = await fetch('/__publish-cloudflare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteConfig,
          tagsConfig,
          videoItems: stripStudioFields(videoItems),
          musicItems: stripStudioFields(musicItems),
          blogPosts,
          galleryItems,
          pricing,
          sectionCopy,
          palette,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Publish failed');
      }

      setPublishStatus('success');
      window.alert(`Опубликовано: ${result.url}`);
      window.setTimeout(() => setPublishStatus('idle'), 5000);
    } catch (error) {
      setPublishStatus('error');
      window.alert(`Не удалось опубликовать сайт.\n\n${error.message}`);
      window.setTimeout(() => setPublishStatus('idle'), 5000);
    }
  }

  function buildSectionHref(section) {
    if (section === 'price') {
      return buildUrl({ section: 'price' });
    }

    return buildUrl({
      section,
      query,
      tags: selectedTags,
      designCategory: section === 'gallery' ? activeDesignCategory : 'all',
    });
  }

  function buildDesignCategoryHref(categorySlug) {
    return buildUrl({
      section: 'gallery',
      query,
      designCategory: categorySlug,
    });
  }

  function buildTagHref(tagSlug) {
    const nextTags = selectedTags.includes(tagSlug)
      ? selectedTags.filter((slug) => slug !== tagSlug)
      : [...selectedTags, tagSlug];

    return buildUrl({
      section: 'home',
      query,
      tags: nextTags,
    });
  }

  function buildResetFiltersHref() {
    return buildUrl({
      section: 'home',
      query: '',
      tags: [],
    });
  }

  function handleGoHomeFromNotFound() {
    const fallbackSection = ['home', 'blog', 'gallery', 'price', 'plugins']
      .find((section) => visibleSections[section]) || 'home';
    setIsRouteNotFound(false);
    setQuery('');
    setSelectedTags([]);
    handleSectionChange(fallbackSection);
  }

  function handleDesignCategoryChange(categorySlug) {
    const normalized = normalizeDesignCategory(categorySlug);
    setIsRouteNotFound(false);
    if (activeSection !== 'gallery') {
      setActiveSection('gallery');
    }
    setActiveGalleryItem(null);
    setActiveDesignCategory(normalized);
  }

  const copy = {
    eyebrow: siteConfig.heroEyebrow?.[language] ?? getLocalizedText(language, 'latestLabel'),
    title: siteConfig.siteName[language],
    tagline: siteConfig.siteTagline[language],
    selectedTags: getLocalizedText(language, 'selectedTags'),
    worksCount: getLocalizedText(language, 'worksCount'),
    resultsCount: getLocalizedText(language, 'resultsCount'),
    latestLabel: getLocalizedText(language, 'latestLabel'),
    loading: getLocalizedText(language, 'loading'),
    remoteWork: language === 'ru'
      ? 'Работаем удаленно по России и за ее пределами.'
      : 'Working remotely across Russia and worldwide.',
  };

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <Header
        language={language}
        onLanguageChange={setLanguage}
        query={query}
        onQueryChange={handleQueryChange}
        siteConfig={siteConfig}
        studioEnabled={studioEnabled}
        canPublish={canPublish}
        publishStatus={publishStatus}
        onPublish={handlePublishCloudflare}
        onOpenStudio={handleOpenStudioForNew}
        onOpenPalette={() => setIsPaletteOpen(true)}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        visibleSections={visibleSections}
        getSectionHref={buildSectionHref}
      />

      <main className="page-content">
        {isRouteNotFound && (
          <NotFoundPage language={language} onGoHome={handleGoHomeFromNotFound} />
        )}

        {!isRouteNotFound && (activeSection === 'home' || activeSection === 'price') && (
          <>
            <div className="page-top-stack">
              <section className="hero-block surface-panel">
                <div className="hero-main">
                  <div className="hero-mobile-search">
                    <SearchBar language={language} value={query} onChange={handleQueryChange} placeholderKey="mobileSearchPlaceholder" />
                  </div>
                  <div className="hero-mobile-tags">
                    <TagFilter
                      language={language}
                      tags={tagsConfig}
                      selectedTags={selectedTags}
                      onToggleTag={handleToggleTag}
                      onReset={handleResetFilters}
                      getTagHref={buildTagHref}
                      getResetHref={buildResetFiltersHref}
                    />
                  </div>
                  <p className="eyebrow">{copy.eyebrow}</p>
                  <h1>{copy.title}</h1>
                  <p className="hero-copy">{copy.tagline}</p>
                  <p className="seo-presence-note">{copy.remoteWork}</p>
                </div>
                <div className="hero-stats">
                  <div className="hero-stat-card">
                    <span>{copy.worksCount}</span>
                    <strong>{allWorks.length}</strong>
                  </div>
                  <div className="hero-stat-card">
                    <span>{copy.resultsCount}</span>
                    <strong>{filteredWorks.length}</strong>
                  </div>
                  <div className="hero-stat-card">
                    <span>{copy.selectedTags}</span>
                    <strong>{selectedTags.length}</strong>
                  </div>
                </div>
              </section>

              <div className="desktop-tags">
                <TagFilter
                  language={language}
                  tags={tagsConfig}
                  selectedTags={selectedTags}
                  onToggleTag={handleToggleTag}
                  onReset={handleResetFilters}
                  getTagHref={buildTagHref}
                  getResetHref={buildResetFiltersHref}
                />
              </div>
            </div>

            {isLoading ? (
              <SkeletonGrid label={copy.loading} />
            ) : filteredWorks.length > 0 ? (
              <div className="home-feed">
                {featuredFilteredWorks.length > 0 && (
                  <CardGrid
                    className="featured-work-grid"
                    items={featuredFilteredWorks}
                    language={language}
                    tagsMap={tagsMap}
                    onOpenItem={handleOpenWork}
                  />
                )}
                <PromoBanner
                  language={language}
                  sectionCopy={sectionCopy.promo}
                  studioEnabled={studioEnabled}
                  onEdit={() => openSectionTextEditor('promo')}
                  onOpen={handleOpenPrice}
                  href={buildUrl({ section: 'home', isPriceOpen: true })}
                />
                <CardGrid
                  items={featuredFilteredWorks.length > 0 ? regularFilteredWorks : filteredWorks}
                  language={language}
                  tagsMap={tagsMap}
                  onOpenItem={handleOpenWork}
                />
              </div>
            ) : (
              <EmptyState language={language} onReset={handleResetFilters} />
            )}
          </>
        )}

        {!isRouteNotFound && activeSection === 'blog' && (
          <BlogPage
            language={language}
            posts={filteredBlogPosts}
            tagsMap={tagsMap}
            sectionCopy={sectionCopy.blog}
            studioEnabled={studioEnabled}
            onEdit={() => openSectionTextEditor('blog')}
            onCreatePost={() => openBlogComposer(null)}
            onEditPost={openBlogComposer}
            onOpenPost={handleOpenBlogPost}
          />
        )}

        {!isRouteNotFound && activeSection === 'gallery' && (
          <GalleryPage
            language={language}
            items={filteredDesignItems}
            sectionCopy={sectionCopy.gallery}
            activeCategory={activeDesignCategory}
            categories={designCategoryList}
            studioEnabled={studioEnabled}
            onEdit={() => openSectionTextEditor('gallery')}
            onCreateItem={handleCreateGalleryItem}
            onEditItem={setEditingGalleryItem}
            onDeleteItem={handleDeleteGalleryItem}
            onCategoryChange={handleDesignCategoryChange}
            getCategoryHref={buildDesignCategoryHref}
            onOpenItem={handleOpenGalleryItem}
          />
        )}

        {!isRouteNotFound && activeSection === 'plugins' && <PluginsPage language={language} />}
      </main>

      <Footer language={language} />

      <DetailModal
        item={activeItem}
        language={language}
        tagsMap={tagsMap}
        onClose={handleCloseWork}
        studioEnabled={studioEnabled}
        onEdit={activeItem ? () => handleOpenStudioForItem(activeItem) : undefined}
      />

      <PriceModal
        isOpen={isPriceOpen}
        language={language}
        pricing={pricing}
        studioEnabled={studioEnabled}
        onEditPricing={() => setIsPricingEditorOpen(true)}
        onClose={handleClosePrice}
      />

      {isPricingEditorOpen && (
        <Suspense fallback={null}>
          <PricingEditorModal
            isOpen={isPricingEditorOpen}
            language={language}
            pricing={pricing}
            onSave={handleSavePricing}
            onClose={() => setIsPricingEditorOpen(false)}
          />
        </Suspense>
      )}

      <BlogModal
        post={activeBlogPost}
        language={language}
        studioEnabled={studioEnabled}
        onEdit={activeBlogPost ? () => openBlogComposer(activeBlogPost) : undefined}
        onClose={handleCloseBlogPost}
      />
      {isBlogComposerOpen && (
        <Suspense fallback={null}>
          <BlogComposerModal
            isOpen={isBlogComposerOpen}
            language={language}
            post={editingBlogPost}
            tags={tagsConfig}
            onSave={handleSaveBlogPost}
            onClose={() => {
              setIsBlogComposerOpen(false);
              setEditingBlogPost(null);
            }}
          />
        </Suspense>
      )}
      {editingGalleryItem && (
        <Suspense fallback={null}>
          <GalleryItemEditorModal
            item={editingGalleryItem}
            language={language}
            onSave={handleSaveGalleryItem}
            onClose={() => setEditingGalleryItem(null)}
          />
        </Suspense>
      )}
      <GalleryModal item={activeGalleryItem} language={language} onClose={handleCloseGalleryItem} />
      {editorTarget && (
        <Suspense fallback={null}>
          <JsonEditModal target={editorTarget} language={language} onClose={() => setEditorTarget(null)} />
        </Suspense>
      )}
      {textEditorTarget && (
        <Suspense fallback={null}>
          <TextEditModal target={textEditorTarget} language={language} onClose={() => setTextEditorTarget(null)} />
        </Suspense>
      )}
      {isPaletteOpen && (
        <Suspense fallback={null}>
          <PaletteModal
            isOpen={isPaletteOpen}
            language={language}
            palette={palette}
            onSave={handleSavePalette}
            onReset={handleResetPalette}
            onClose={() => setIsPaletteOpen(false)}
          />
        </Suspense>
      )}

      {studioEnabled && (
        <Suspense fallback={null}>
          <ContentStudio
            isOpen={isStudioOpen}
            language={language}
            tags={tagsConfig}
            onClose={() => setIsStudioOpen(false)}
            projectHandle={projectHandle}
            onProjectHandleChange={setProjectHandle}
            siteConfig={siteConfig}
            onSiteConfigChange={setSiteConfig}
            tagsConfig={tagsConfig}
            onTagsConfigChange={setTagsConfig}
            videoItems={videoItems}
            musicItems={musicItems}
            blogItems={blogPosts}
            galleryItems={galleryItems}
            onVideoItemsChange={(items) => setVideoItems(decorateItems(items, 'video'))}
            onMusicItemsChange={(items) => setMusicItems(decorateItems(items, 'music'))}
            onBlogItemsChange={(items) => {
              saveEditableData('portfolio-blog-json', items);
              setBlogPosts(items);
            }}
            onGalleryItemsChange={(items) => {
              const normalizedItems = normalizeGalleryCollection(items);
              saveEditableData('portfolio-gallery-json', normalizedItems);
              setGalleryItems(normalizedItems);
            }}
            selectedItem={studioSelectedItem}
            onSelectItem={setStudioSelectionKey}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;

