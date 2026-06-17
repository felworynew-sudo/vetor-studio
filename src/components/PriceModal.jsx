import { useEffect, useRef } from 'react';
import DevEditButton from './DevEditButton';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

const priceText = {
  ru: {
    close: 'Закрыть',
    title: 'Прайс',
    subtitle: 'Базовые ориентиры. Финальная цена зависит от сложности, сроков и количества правок.',
    thumbnails: 'Превью для YouTube',
    other: 'Другие задачи',
    packages: 'Пакеты оформления канала',
    terms: 'Условия и масштаб задач',
  },
  en: {
    close: 'Close',
    title: 'Pricing',
    subtitle: 'Base references. The final price depends on complexity, timing, and revision scope.',
    thumbnails: 'YouTube thumbnails',
    other: 'Other services',
    packages: 'Channel design packages',
    terms: 'Scope and pricing terms',
  },
};

function getCardStyle(item = {}) {
  const style = {};

  if (item.accentColor) {
    style['--price-card-accent'] = item.accentColor;
    style['--price-card-border'] = item.accentColor;
  }

  if (item.background) {
    style['--price-card-bg'] = item.background;
  }

  return style;
}

function PriceModal({ isOpen, language, pricing, studioEnabled = false, onEditPricing, onClose }) {
  const modalRef = useRef(null);
  useModalAccessibility({ isOpen, modalRef, onClose });

  useEffect(() => {
    const modal = modalRef.current;

    if (!isOpen || !modal || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const cards = Array.from(modal.querySelectorAll('.price-motion-card'));
    let lastScrollTop = modal.scrollTop;
    let currentSway = 0;
    let targetSway = 0;
    let frameId = 0;

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function animateCards() {
      currentSway += (targetSway - currentSway) * 0.1;
      targetSway *= 0.88;

      cards.forEach((card, index) => {
        const direction = index % 2 === 0 ? 1 : -1;
        const depth = 0.78 + (index % 3) * 0.1;
        const x = currentSway * direction * depth * 2.1;
        const y = currentSway * depth * -2.6;
        const rotate = currentSway * direction * depth * 0.18;

        card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotate.toFixed(3)}deg)`;
      });

      if (Math.abs(currentSway) > 0.01 || Math.abs(targetSway) > 0.01) {
        frameId = window.requestAnimationFrame(animateCards);
        return;
      }

      cards.forEach((card) => {
        card.style.transform = '';
      });
      frameId = 0;
    }

    function handleScroll() {
      const nextScrollTop = modal.scrollTop;
      const scrollDelta = nextScrollTop - lastScrollTop;
      lastScrollTop = nextScrollTop;
      targetSway = clamp(targetSway + scrollDelta * 0.01, -0.65, 0.65);

      if (!frameId) {
        frameId = window.requestAnimationFrame(animateCards);
      }
    }

    modal.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      modal.removeEventListener('scroll', handleScroll);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      cards.forEach((card) => {
        card.style.transform = '';
      });
    };
  }, [isOpen, pricing]);

  if (!isOpen) {
    return null;
  }

  const copy = priceText[language] ?? priceText.ru;
  const nameKey = language === 'ru' ? 'ruName' : 'enName';
  const descriptionKey = language === 'ru' ? 'ruDescription' : 'enDescription';
  const packageItemsKey = language === 'ru' ? 'ruItems' : 'enItems';
  const noteKey = language === 'ru' ? 'ruText' : 'enText';
  const contact = pricing.contact ?? {};
  const footerNote = pricing.footerNote?.[noteKey];
  const contactLabel = contact[language === 'ru' ? 'ruLabel' : 'enLabel'] ?? (language === 'ru' ? 'Связаться' : 'Contact');
  const contactStyle = contact.color ? { '--price-contact-color': contact.color } : undefined;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section ref={modalRef} className="price-modal" role="dialog" aria-modal="true" aria-label={copy.title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar price-topbar">
          <div>
            <p className="eyebrow">{copy.title}</p>
            <h2>{pricing.hero[language === 'ru' ? 'ruTitle' : 'enTitle']}</h2>
            <p>{pricing.hero[language === 'ru' ? 'ruText' : 'enText'] || copy.subtitle}</p>
          </div>
          {studioEnabled && onEditPricing ? <DevEditButton label="Edit pricing" onClick={onEditPricing} className="modal-edit-button" /> : null}
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="price-content">
          <section className="price-section">
            <h3>{copy.thumbnails}</h3>
            <div className="price-grid three">
              {pricing.thumbnailSegments.map((segment) => (
                <article key={segment[nameKey]} className="price-card price-motion-card" style={getCardStyle(segment)}>
                  <h4>{segment[nameKey]}</h4>
                  <p>{segment[descriptionKey]}</p>
                  <strong>{segment.price}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="price-section">
            <h3>{copy.other}</h3>
            <div className="service-price-list">
              {pricing.services.map((service) => (
                <div key={service[nameKey]} className="service-price-row price-motion-card" style={getCardStyle(service)}>
                  <div className="service-price-main">
                    <span>{service[nameKey]}</span>
                    {service[descriptionKey] ? <p>{service[descriptionKey]}</p> : null}
                  </div>
                  <strong>{service.price}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="price-section">
            <h3>{copy.packages}</h3>
            <div className="channel-package-grid">
              {pricing.channelPackages.map((pack) => (
                <article key={pack.theme} className={`channel-package-card price-motion-card ${pack.theme}`} style={getCardStyle(pack)}>
                  <div>
                    <h4>{pack[nameKey]}</h4>
                    <strong>{pack.price}</strong>
                  </div>
                  <ul>
                    {pack[packageItemsKey].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          {contact.url ? (
            <div className="price-contact-block">
              <a className="price-contact-button" href={contact.url} target="_blank" rel="noreferrer" style={contactStyle}>
                {contactLabel}
              </a>
            </div>
          ) : null}

          {footerNote ? (
            <section className="price-section price-note-section">
              <h3>{copy.terms}</h3>
              <p className="price-footer-note">{footerNote}</p>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default PriceModal;
