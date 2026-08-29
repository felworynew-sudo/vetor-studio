import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  TOOL_CATEGORIES,
  TOOLS,
  getToolBySlug,
  getToolsByCategory,
} from '../../data/toolsCatalog';
import { buildToolPath } from '../../utils/routing';
import { toolHowto, toolFaqs } from '../../utils/toolSeo';
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
    hidePanel: 'Скрыть панель',
    showPanel: 'Показать панель',
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
    hidePanel: 'Hide panel',
    showPanel: 'Show panel',
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
  const [dragging, setDragging] = useState(false);
  // Сайдбар инструментов: сворачивается и тянется за край; ширина/состояние запоминаются.
  const [sidebarOpen, setSidebarOpen] = useState(() => { try { return localStorage.getItem('verstak-sb-open') !== '0'; } catch { return true; } });
  const [sidebarW, setSidebarW] = useState(() => { try { const v = Number(localStorage.getItem('verstak-sb-w')); return v >= 200 && v <= 480 ? v : 288; } catch { return 288; } });
  useEffect(() => { try { localStorage.setItem('verstak-sb-open', sidebarOpen ? '1' : '0'); localStorage.setItem('verstak-sb-w', String(sidebarW)); } catch { /* */ } }, [sidebarOpen, sidebarW]);
  function startSidebarResize(e) {
    e.preventDefault();
    const startX = e.clientX; const startW = sidebarW;
    const move = (ev) => setSidebarW(Math.max(200, Math.min(480, startW + (ev.clientX - startX))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('is-col-resizing'); };
    document.body.classList.add('is-col-resizing');
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  const activeTool = toolSlug ? getToolBySlug(toolSlug) : null;

  // Пока пользователь тащит файл над окном — подсвечиваем зоны загрузки во всех
  // инструментах (раньше визуального отклика на drag не было вовсе).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const onEnter = (e) => { if (hasFiles(e)) { depth += 1; setDragging(true); } };
    const onLeave = () => { depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false); };
    const onDrop = () => { depth = 0; setDragging(false); };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

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
    <div className={dragging ? 'tools-studio is-dragging' : 'tools-studio'} data-lang={lang}>
      {/* Хедер студии */}
      <header className="tools-header">
        <button
          type="button"
          className="tools-sb-btn"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? ui.hidePanel : ui.showPanel}
          title={sidebarOpen ? ui.hidePanel : ui.showPanel}
        >
          {sidebarOpen ? '⟨' : '☰'}
        </button>
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

      <div className="tools-body" style={{ '--t-sidebar': sidebarOpen ? `${sidebarW}px` : '0px' }}>
        {sidebarOpen && <span className="tools-sb-resize" style={{ left: sidebarW }} onPointerDown={startSidebarResize} title="↔" aria-hidden="true" />}
        {/* Сайдбар с рубриками */}
        <aside className={sidebarOpen ? 'tools-sidebar' : 'tools-sidebar is-hidden'}>
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
            <ToolView tool={activeTool} lang={lang} ui={ui} onBack={go('/tools')} go={go} />
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

function ToolView({ tool, lang, ui, onBack, go }) {
  const ToolComponent = tool.component;
  const howto = toolHowto(tool, lang);
  const faqs = toolFaqs(tool, lang);
  const related = getToolsByCategory(tool.categoryId).filter((r) => r.status === 'ready' && r.slug !== tool.slug).slice(0, 6);
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
        {ToolComponent ? <ToolComponent language={lang} go={go} /> : null}
      </Suspense>

      {/* SEO/UX-контент: как пользоваться, FAQ, смежные инструменты. */}
      <section className="tool-article">
        <h2>{lang === 'en' ? 'How to use' : 'Как пользоваться'}</h2>
        <ol className="tool-howto">{howto.map((step, i) => <li key={i}>{step}</li>)}</ol>

        <h2>{lang === 'en' ? 'FAQ' : 'Вопросы и ответы'}</h2>
        <div className="tool-faq">
          {faqs.map((f) => (
            <details key={f.q} className="tool-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>

        {related.length > 0 && (
          <>
            <h2>{lang === 'en' ? 'Related tools' : 'Похожие инструменты'}</h2>
            <ul className="tool-related">
              {related.map((r) => (
                <li key={r.slug}>
                  <a href={buildToolPath(r.slug)} onClick={go(buildToolPath(r.slug))}>
                    <PxIcon src={r.img} emoji={r.icon} className="tools-side-icon" /> {r[lang].title}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

export default ToolsStudio;
