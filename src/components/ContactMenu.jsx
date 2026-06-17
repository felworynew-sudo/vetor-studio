import { useEffect, useRef, useState } from 'react';

function ContactMenu({ language, contacts }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const copy = language === 'ru'
    ? {
        trigger: 'Контакты',
        panel: 'Контакты студии',
        telegram: 'Telegram',
        email: 'Почта',
        phone: 'Телефон',
      }
    : {
        trigger: 'Contacts',
        panel: 'Studio contacts',
        telegram: 'Telegram',
        email: 'Email',
        phone: 'Phone',
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

  const telegramLabel = contacts?.telegram || '@felwory';
  const telegramUrl = contacts?.telegramUrl || 'https://t.me/felwory';
  const emailLabel = contacts?.email || 'Vetor-studio@yandex.com';
  const phoneLabel = contacts?.phone || '+7 918 381 96 48';
  const phoneRaw = contacts?.phoneRaw || '+79183819648';

  return (
    <div className="contact-menu" ref={menuRef}>
      <button
        type="button"
        className="utility-button header-contact-button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        {copy.trigger}
      </button>

      {isOpen && (
        <div className="owner-menu-panel contact-menu-panel surface-panel" role="menu" aria-label={copy.panel}>
          <a className="owner-menu-item" href={telegramUrl} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setIsOpen(false)}>
            <strong>{copy.telegram}:</strong>
            <span>{telegramLabel}</span>
          </a>
          <a className="owner-menu-item" href={`mailto:${emailLabel}`} role="menuitem" onClick={() => setIsOpen(false)}>
            <strong>{copy.email}:</strong>
            <span>{emailLabel}</span>
          </a>
          <a className="owner-menu-item" href={`tel:${phoneRaw}`} role="menuitem" onClick={() => setIsOpen(false)}>
            <strong>{copy.phone}:</strong>
            <span>{phoneLabel}</span>
          </a>
        </div>
      )}
    </div>
  );
}

export default ContactMenu;
