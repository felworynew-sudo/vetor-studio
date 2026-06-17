import { useEffect, useRef, useState } from 'react';
import SearchBar from './SearchBar';
import LanguageSwitch from './LanguageSwitch';
import OwnerMenu from './OwnerMenu';
import ContactMenu from './ContactMenu';
import NavigationTabs from './NavigationTabs';
import { withBase } from '../utils/format';

const tabLabels = {
  ru: {
    home: 'Главная',
    blog: 'Блог',
    gallery: 'Дизайн',
    price: 'Прайс',
    plugins: 'Плагины',
  },
  en: {
    home: 'Home',
    blog: 'Blog',
    gallery: 'Design',
    price: 'Price',
    plugins: 'Plugins',
  },
};

function HeaderShell({
  language,
  onLanguageChange,
  query,
  onQueryChange,
  siteConfig,
  studioEnabled,
  canPublish,
  publishStatus,
  onPublish,
  onOpenStudio,
  onOpenPalette,
  activeSection,
  onSectionChange,
  visibleSections,
  getSectionHref,
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const desktopLogo = siteConfig.desktopLogo || '/logos/vetorlogo.svg';
  const mobileLogo = siteConfig.mobileLogo || siteConfig.logo;
  const visibleTabs = ['home', 'blog', 'gallery', 'price', 'plugins'].filter((section) => visibleSections?.[section]);
  const contacts = siteConfig.contacts || {};
  const mobileCopy =
    language === 'ru'
      ? {
          menu: 'Меню',
          navigation: 'Навигация',
          language: 'Язык',
        }
      : {
          menu: 'Menu',
          navigation: 'Navigation',
          language: 'Language',
        };
  const labels = tabLabels[language] ?? tabLabels.ru;

  function handleSectionClick(event, section) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    setIsMobileMenuOpen(false);
    onSectionChange(section);
  }

  function handleBrandClick(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }

    event.preventDefault();
    setIsMobileMenuOpen(false);

    if (activeSection !== 'home') {
      onSectionChange('home');
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="app-header">
      <div className={`header-inner ${studioEnabled ? 'is-studio' : 'is-client'}`}>
        <a
          className="brand-lockup"
          href={getSectionHref ? getSectionHref('home') : '/'}
          aria-label={siteConfig.siteName[language]}
          onClick={handleBrandClick}
        >
          <img src={withBase(mobileLogo)} alt="Logo" className="brand-logo brand-logo-mobile" width={56} height={56} />
          <img src={withBase(desktopLogo)} alt={siteConfig.siteName[language]} className="brand-logo-wide" />
          <div className="brand-title-stack">
            <span className="brand-title">{siteConfig.siteName[language]}</span>
            <span className="brand-subtitle">{siteConfig.siteTagline?.[language] ?? siteConfig.siteTagline?.ru ?? ''}</span>
          </div>
        </a>

        <div className="header-nav-slot">
          <NavigationTabs
            language={language}
            activeSection={activeSection}
            onChange={onSectionChange}
            visibleTabs={visibleTabs}
            getHref={getSectionHref}
          />
        </div>

        <div className="header-search-slot">
          <SearchBar language={language} value={query} onChange={onQueryChange} />
        </div>

        <div className="header-controls">
          <ContactMenu language={language} contacts={contacts} />
          <div className="header-desktop-language">
            <LanguageSwitch language={language} onChange={onLanguageChange} />
          </div>
          {!studioEnabled && (
            <div className="header-mobile-menu-wrap" ref={mobileMenuRef}>
              <button
                type="button"
                className="utility-button header-menu-toggle"
                aria-expanded={isMobileMenuOpen}
                aria-haspopup="menu"
                aria-label={mobileCopy.menu}
                onClick={() => setIsMobileMenuOpen((current) => !current)}
              >
                <span aria-hidden="true">{'\u2630'}</span>
              </button>

              {isMobileMenuOpen && (
                <div className="header-mobile-menu owner-menu-panel surface-panel" role="menu" aria-label={mobileCopy.menu}>
                  <section className="header-mobile-menu-section">
                    <span className="header-mobile-menu-section-title">{mobileCopy.navigation}</span>
                    <nav className="header-mobile-menu-nav">
                      {visibleTabs.map((section) => (
                        <a
                          key={section}
                          href={getSectionHref ? getSectionHref(section) : '#'}
                          className={activeSection === section ? 'header-mobile-menu-link is-active' : 'header-mobile-menu-link'}
                          onClick={(event) => handleSectionClick(event, section)}
                        >
                          {labels[section] ?? section}
                        </a>
                      ))}
                    </nav>
                  </section>
                  <div className="owner-menu-divider" />
                  <section className="header-mobile-menu-section">
                    <span className="header-mobile-menu-section-title">{mobileCopy.language}</span>
                    <LanguageSwitch
                      language={language}
                      onChange={(nextLanguage) => {
                        onLanguageChange(nextLanguage);
                        setIsMobileMenuOpen(false);
                      }}
                    />
                  </section>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="header-owner-slot">
          {studioEnabled ? (
            <OwnerMenu
              language={language}
              onLanguageChange={onLanguageChange}
              owner={siteConfig.owner}
              studioEnabled={studioEnabled}
              canPublish={canPublish}
              publishStatus={publishStatus}
              onPublish={onPublish}
              onOpenStudio={onOpenStudio}
              onOpenPalette={onOpenPalette}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default HeaderShell;
