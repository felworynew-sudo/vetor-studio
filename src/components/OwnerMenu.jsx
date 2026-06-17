import { useEffect, useRef, useState } from 'react';
import { withBase } from '../utils/format';
import LanguageSwitch from './LanguageSwitch';

function OwnerMenu({
  language,
  owner,
  onLanguageChange,
  studioEnabled = false,
  canPublish = false,
  publishStatus = 'idle',
  onPublish,
  onOpenStudio,
  onOpenPalette,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const copy = language === 'ru'
    ? {
        actionLabel: 'Связаться в Telegram',
        languageLabel: 'Язык',
        studio: 'Студия',
        palette: 'Палитра',
        publish: 'Опубликовать',
        publishing: 'Публикуем...',
      }
    : {
        actionLabel: 'Contact on Telegram',
        languageLabel: 'Language',
        studio: 'Studio',
        palette: 'Palette',
        publish: 'Publish',
        publishing: 'Publishing...',
      };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  function handlePublishClick() {
    if (!onPublish || publishStatus === 'publishing') {
      return;
    }
    closeMenu();
    onPublish();
  }

  function handleStudioClick() {
    if (!onOpenStudio) {
      return;
    }
    closeMenu();
    onOpenStudio();
  }

  function handlePaletteClick() {
    if (!onOpenPalette) {
      return;
    }
    closeMenu();
    onOpenPalette();
  }

  return (
    <div className="owner-menu" ref={menuRef}>
      <button
        type="button"
        className="owner-link owner-menu-trigger"
        aria-label={owner.name}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        <img src={withBase(owner.avatar)} alt={owner.name} className="owner-avatar" width={52} height={52} />
      </button>

      {isOpen && (
        <div className="owner-menu-panel surface-panel" role="menu" aria-label={owner.name}>
          {studioEnabled && (
            <>
              {canPublish && (
                <button
                  type="button"
                  className="owner-menu-item owner-menu-item-button"
                  onClick={handlePublishClick}
                  disabled={publishStatus === 'publishing'}
                >
                  {publishStatus === 'publishing' ? copy.publishing : copy.publish}
                </button>
              )}
              <button type="button" className="owner-menu-item owner-menu-item-button" onClick={handleStudioClick}>
                {copy.studio}
              </button>
              <button type="button" className="owner-menu-item owner-menu-item-button" onClick={handlePaletteClick}>
                {copy.palette}
              </button>
              <div className="owner-menu-divider" />
            </>
          )}
          {onLanguageChange ? (
            <div className="owner-menu-language">
              <span>{copy.languageLabel}</span>
              <LanguageSwitch language={language} onChange={onLanguageChange} />
            </div>
          ) : null}
          <a
            className="owner-menu-item"
            href={owner.url}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={closeMenu}
          >
            {copy.actionLabel}
          </a>
        </div>
      )}
    </div>
  );
}

export default OwnerMenu;
