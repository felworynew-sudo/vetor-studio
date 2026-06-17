import SearchBar from './SearchBar';
import LanguageSwitch from './LanguageSwitch';
import OwnerMenu from './OwnerMenu';
import NavigationTabs from './NavigationTabs';
import { withBase } from '../utils/format';

function Header({
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
}) {
  const paletteLabel = language === 'ru' ? 'Палитра' : 'Palette';
  const publishLabel = language === 'ru' ? 'Опубликовать' : 'Publish';
  const publishingLabel = language === 'ru' ? 'Публикуем...' : 'Publishing...';
  const studioLabel = language === 'ru' ? 'Студия' : 'Studio';

  return (
    <header className="app-header">
      <div className="header-inner">
        <a className="brand-lockup" href="#top" aria-label={siteConfig.siteName[language]}>
          <img src={withBase(siteConfig.logo)} alt="Logo" className="brand-logo" width={56} height={56} />
          <div>
            <span className="brand-title">{siteConfig.siteName[language]}</span>
            <span className="brand-subtitle">{siteConfig.siteTagline?.[language] ?? siteConfig.siteTagline?.ru ?? ''}</span>
          </div>
        </a>

        <div className="header-search-slot">
          <SearchBar language={language} value={query} onChange={onQueryChange} />
        </div>

        <div className="header-controls">
          {studioEnabled && (
            <>
              {canPublish && (
                <button
                  type="button"
                  className={`utility-button header-publish-button ${publishStatus === 'success' ? 'is-success' : ''}`}
                  onClick={onPublish}
                  disabled={publishStatus === 'publishing'}
                >
                  {publishStatus === 'publishing' ? publishingLabel : publishLabel}
                </button>
              )}
              <button type="button" className="utility-button header-palette-button" onClick={onOpenPalette}>
                {paletteLabel}
              </button>
              <button type="button" className="utility-button header-studio-button" onClick={onOpenStudio}>
                {studioLabel}
              </button>
            </>
          )}
          <LanguageSwitch language={language} onChange={onLanguageChange} />
        </div>

        <div className="header-owner-slot">
          <OwnerMenu
            language={language}
            onLanguageChange={onLanguageChange}
            owner={siteConfig.owner}
          />
        </div>
      </div>

      {studioEnabled && (
        <div className="mobile-dev-actions">
          {canPublish && (
            <button
              type="button"
              className={`utility-button mobile-publish-fab ${publishStatus === 'success' ? 'is-success' : ''}`}
              onClick={onPublish}
              disabled={publishStatus === 'publishing'}
            >
              {publishStatus === 'publishing' ? publishingLabel : publishLabel}
            </button>
          )}
          <button type="button" className="utility-button mobile-palette-fab" onClick={onOpenPalette}>
            {paletteLabel}
          </button>
          <button type="button" className="utility-button mobile-studio-fab" onClick={onOpenStudio}>
            {studioLabel}
          </button>
        </div>
      )}

      <NavigationTabs language={language} activeSection={activeSection} onChange={onSectionChange} />
    </header>
  );
}

export default Header;
