import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  TOOL_CATEGORIES,
  TOOLS,
  getToolBySlug,
  getToolsByCategory,
} from '../../data/toolsCatalog';
import { buildToolPath } from '../../utils/routing';
import '../../styles/tools.css';

// РАБОЧЕЕ НАЗВАНИЕ саб-бренда студии инструментов. Меняется в одном месте.
const STUDIO_NAME = { ru: 'Верстак', en: 'Verstak' };
const STUDIO_TAGLINE = { ru: 'инструменты от Vetor', en: 'tools by Vetor' };

const UI = {
  ru: {
    heroTitle: 'Инструменты для дизайнеров',
    heroSubtitle: 'Онлайн-инструменты для работы с цветом, изображениями и вектором. Всё считается прямо в браузере — без регистрации и без загрузки файлов на сервер.',
    search: 'Поиск инструментов…',
    all: 'Все инструменты',
    soon: 'Скоро',
    ready: 'Готово',
    toMainSite: 'На основной сайт Vetor',
    forDesigners: 'для дизайнеров',
    back: 'Все инструменты',
    open: 'Открыть',
    nothing: 'Ничего не нашлось',
    ideasTitle: 'Есть идея инструмента?',
    ideasText: 'Напишите — соберём то, чего не хватает.',
    count: (n) => `${n} инструментов`,
    offlineTitle: 'Работает без интернета',
    offlineText: 'Все инструменты считаются прямо в вашем браузере — файлы никуда не уходят. После первой загрузки страницы обычные инструменты работают офлайн. AI-инструменты один раз скачивают модель (она кешируется браузером), а дальше тоже работают без сети. Чтобы гарантированно иметь всё офлайн: откройте нужные инструменты один раз при интернете — браузер сохранит их в кеш.',
  },
  en: {
    heroTitle: 'Tools for designers',
    heroSubtitle: 'Online tools for color, images, and vector work. Everything runs right in your browser — no sign-up, nothing uploaded to a server.',
    search: 'Search tools…',
    all: 'All tools',
    soon: 'Soon',
    ready: 'Ready',
    toMainSite: 'Back to the main Vetor site',
    forDesigners: 'for designers',
    back: 'All tools',
    open: 'Open',
    nothing: 'Nothing found',
    ideasTitle: 'Got a tool idea?',
    ideasText: 'Drop us a line — we’ll build what’s missing.',
    count: (n) => `${n} tools`,
    offlineTitle: 'Works offline',
    offlineText: 'Every tool runs right in your browser — files never leave your device. After the page loads once, regular tools work offline. AI tools download a model once (cached by the browser) and then work without a network too. To be sure everything is available offline: open the tools you need once while online — the browser will cache them.',
  },
};

const ICON_BASE = '/tools/icons/';
// Пиксель-иконка (PNG, image-rendering: pixelated) с фолбэком на эмодзи,
// пока для инструмента не назначена своя иконка.
function PxIcon({ src, emoji, className = '' }) {
  if (src) {
    return <img src={`${ICON_BASE}${src}`} alt="" className={`px-icon ${className}`} loading="lazy" draggable="false" />;
  }
  return <span className={className} aria-hidden="true">{emoji}</span>;
}

function ToolsStudio({
  language = 'ru',
  onLanguageChange,
  toolSlug = '',
  onNavigate,
  telegramUrl,
  contactEmail,
}) {
  const lang = language === 'en' ? 'en' : 'ru';
  const ui = UI[lang];
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());

  const activeTool = toolSlug ? getToolBySlug(toolSlug) : null;

  const toggleCat = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Категория открытого инструмента всегда раскрыта.
  useEffect(() => {
    if (!activeTool) return;
    setCollapsed((prev) => {
      if (!prev.has(activeTool.categoryId)) return prev;
      const next = new Set(prev);
      next.delete(activeTool.categoryId);
      return next;
    });
  }, [activeTool]);
  const readyCount = useMemo(() => TOOLS.filter((tItem) => tItem.status === 'ready').length, []);

  // SPA-переход по внутренним ссылкам (href остаётся для SEO/новой вкладки).
  const go = (path) => (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onNavigate?.(path);
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (activeTool) {
      document.title = `${activeTool[lang].title} — ${STUDIO_NAME[lang]}`;
    } else {
      document.title = `${STUDIO_NAME[lang]} — ${ui.heroTitle}`;
    }
  }, [activeTool, lang, ui.heroTitle]);

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter((tItem) => (
      `${tItem[lang].title} ${tItem[lang].desc}`.toLowerCase().includes(q)
    ));
  }, [search, lang]);

  return (
    <div className="tools-studio" data-lang={lang}>
      {/* Хедер студии */}
      <header className="tools-header">
        <a href="/tools" className="tools-brand" onClick={go('/tools')} aria-label={STUDIO_NAME[lang]}>
          <img src="/tools/verstak-logo-px.png" alt={STUDIO_NAME[lang]} className="tools-brand-logo" />
        </a>

        <div className="tools-header-right">
          <div className="tools-lang" role="group" aria-label="Language">
            <button
              type="button"
              className={lang === 'ru' ? 'is-active' : ''}
              onClick={() => onLanguageChange?.('ru')}
            >
              RU
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'is-active' : ''}
              onClick={() => onLanguageChange?.('en')}
            >
              EN
            </button>
          </div>
          <a href="/" className="tools-exit" onClick={go('/')}>
            ← {ui.toMainSite}
          </a>
        </div>
      </header>

      <div className="tools-body">
        {/* Сайдбар с рубриками */}
        <aside className="tools-sidebar">
          <a
            href="/tools"
            className={!activeTool ? 'tools-side-all is-active' : 'tools-side-all'}
            onClick={go('/tools')}
          >
            📂 {ui.all} <span className="tools-side-count">{TOOLS.length}</span>
          </a>
          {TOOL_CATEGORIES.map((cat) => {
            const catTools = getToolsByCategory(cat.id);
            if (catTools.length === 0) return null;
            const isOpen = !collapsed.has(cat.id);
            return (
              <div key={cat.id} className={isOpen ? 'tools-side-group is-open' : 'tools-side-group is-collapsed'}>
                <button
                  type="button"
                  className="tools-side-cat"
                  onClick={() => toggleCat(cat.id)}
                  aria-expanded={isOpen}
                >
                  <span className="tools-side-cat-label"><PxIcon src={cat.img} emoji={cat.icon} className="tools-side-icon" /> {cat[lang]}</span>
                  <span className="tools-side-cat-right">
                    <span className="tools-side-count">{catTools.length}</span>
                    <span className="tools-side-chevron" aria-hidden="true">▾</span>
                  </span>
                </button>
                {isOpen && (
                <ul>
                  {catTools.map((tItem) => {
                    const isActive = activeTool?.slug === tItem.slug;
                    const isReady = tItem.status === 'ready';
                    const cls = [
                      'tools-side-item',
                      isActive ? 'is-active' : '',
                      isReady ? '' : 'is-soon',
                    ].filter(Boolean).join(' ');
                    if (!isReady) {
                      return (
                        <li key={tItem.slug}>
                          <span className={cls} title={ui.soon}>
                            <PxIcon src={tItem.img} emoji={tItem.icon} className="tools-side-icon" /> {tItem[lang].title}
                            <span className="tools-soon-dot">{ui.soon}</span>
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={tItem.slug}>
                        <a
                          href={buildToolPath(tItem.slug)}
                          className={cls}
                          onClick={go(buildToolPath(tItem.slug))}
                        >
                          <PxIcon src={tItem.img} emoji={tItem.icon} className="tools-side-icon" /> {tItem[lang].title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
                )}
              </div>
            );
          })}
        </aside>

        {/* Основная область */}
        <main className="tools-main">
          {activeTool ? (
            <ToolView tool={activeTool} lang={lang} ui={ui} onBack={go('/tools')} />
          ) : (
            <>
              <section className="tools-hero">
                <div className="tools-hero-inner">
                  <span className="tools-hero-eyebrow">{STUDIO_NAME[lang]} · {ui.count(readyCount)}</span>
                  <h1>{ui.heroTitle}</h1>
                  <p>{ui.heroSubtitle}</p>
                  <input
                    type="search"
                    className="tools-search"
                    placeholder={ui.search}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </section>

              {filteredTools.length === 0 ? (
                <p className="tools-empty">{ui.nothing}</p>
              ) : (
                <div className="tools-grid">
                  {filteredTools.map((tItem) => (
                    <ToolCard
                      key={tItem.slug}
                      tool={tItem}
                      lang={lang}
                      ui={ui}
                      onOpen={go(buildToolPath(tItem.slug))}
                    />
                  ))}
                </div>
              )}

              <section className="tools-ideas">
                <div>
                  <h2>{ui.ideasTitle}</h2>
                  <p>{ui.ideasText}</p>
                </div>
                {contactEmail && (
                  <a className="tools-btn primary" href={`mailto:${contactEmail}?subject=Идея инструмента`}>
                    {contactEmail}
                  </a>
                )}
              </section>

              <section className="tools-offline">
                <strong>🔌 {ui.offlineTitle}.</strong> {ui.offlineText}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ToolCard({ tool, lang, ui, onOpen }) {
  const isReady = tool.status === 'ready';
  const cat = TOOL_CATEGORIES.find((c) => c.id === tool.categoryId);
  if (!isReady) {
    return (
      <div className="tool-card is-soon" aria-disabled="true">
        <PxIcon src={tool.img} emoji={tool.icon} className="tool-card-icon" />
        <span className="tool-card-badge soon">{ui.soon}</span>
        <h3>{tool[lang].title}</h3>
        <p>{tool[lang].desc}</p>
        {cat && <span className="tool-card-cat"><PxIcon src={cat.img} emoji={cat.icon} className="tools-side-icon" /> {cat[lang]}</span>}
      </div>
    );
  }
  return (
    <a href={buildToolPath(tool.slug)} className="tool-card" onClick={onOpen}>
      <PxIcon src={tool.img} emoji={tool.icon} className="tool-card-icon" />
      <h3>{tool[lang].title}</h3>
      <p>{tool[lang].desc}</p>
      {cat && <span className="tool-card-cat">{cat.icon} {cat[lang]}</span>}
    </a>
  );
}

function ToolView({ tool, lang, ui, onBack }) {
  const ToolComponent = tool.component;
  return (
    <div className="tool-view">
      <a href="/tools" className="tool-back" onClick={onBack}>
        <img src="/tools/icons/strelka-vlevo.png" alt="" className="px-icon tb-arrow" /> {ui.back}
      </a>
      <header className="tool-view-head">
        <PxIcon src={tool.img} emoji={tool.icon} className="tool-view-icon" />
        <div>
          <h1>{tool[lang].title}</h1>
          <p>{tool[lang].desc}</p>
        </div>
      </header>
      <Suspense fallback={<div className="tool-loading">…</div>}>
        {ToolComponent ? <ToolComponent language={lang} /> : null}
      </Suspense>
    </div>
  );
}

export default ToolsStudio;
