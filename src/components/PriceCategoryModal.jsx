import { useRef } from 'react';
import DevEditButton from './DevEditButton';
import BeforeAfterSlider from './BeforeAfterSlider';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

const text = {
  ru: { close: 'Закрыть', contact: 'Обсудить задачу', eyebrow: 'Цены' },
  en: { close: 'Close', contact: 'Discuss the task', eyebrow: 'Pricing' },
};

const DEFAULT_RESTORATION = {
  before: '/restoration/original.png',
  afterColor: '/restoration/color.png',
  afterBw: '/restoration/bw.png',
};

function PriceCategoryModal({ category, language, contactUrl, studioEnabled = false, onEdit, onClose }) {
  const modalRef = useRef(null);
  const isOpen = Boolean(category);
  useModalAccessibility({ isOpen, modalRef, onClose });

  if (!category) {
    return null;
  }

  const t = text[language] ?? text.ru;
  const titleKey = language === 'ru' ? 'ruTitle' : 'enTitle';
  const nameKey = language === 'ru' ? 'ruName' : 'enName';
  const descKey = language === 'ru' ? 'ruDescription' : 'enDescription';
  const detail = category.detail || {};
  const rows = Array.isArray(detail.rows) ? detail.rows : [];
  const restoration = { ...DEFAULT_RESTORATION, ...(detail.restoration || {}) };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={modalRef}
        className="price-modal price-cat-modal"
        role="dialog"
        aria-modal="true"
        aria-label={category[titleKey] || category.ruTitle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-topbar price-topbar">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h2>{category[titleKey] || category.ruTitle}</h2>
            {detail[descKey] || detail.ruDescription ? <p>{detail[descKey] || detail.ruDescription}</p> : null}
          </div>
          {studioEnabled && onEdit ? <DevEditButton label="Edit category" onClick={onEdit} className="modal-edit-button" /> : null}
          <button type="button" className="modal-close" onClick={onClose} aria-label={t.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="price-content">
          {category.kind === 'restoration' ? (
            <section className="price-section">
              <BeforeAfterSlider
                language={language}
                before={restoration.before}
                afterColor={restoration.afterColor}
                afterBw={restoration.afterBw}
              />
            </section>
          ) : null}

          {rows.length > 0 ? (
            <section className="price-section">
              <div className="service-price-list">
                {rows.map((row, index) => (
                  <div key={row[nameKey] || index} className="service-price-row">
                    <div className="service-price-main">
                      <span>{row[nameKey] || row.ruName}</span>
                      {row[descKey] || row.ruDescription ? <p>{row[descKey] || row.ruDescription}</p> : null}
                    </div>
                    <strong>{row.price}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="price-contact-block">
            <a className="price-contact-button" href={contactUrl || 'https://t.me/felwory'} target="_blank" rel="noreferrer">
              {t.contact}
            </a>
          </div>

          {detail.ruNote || detail.enNote ? (
            <p className="price-footer-note">{(language === 'ru' ? detail.ruNote : detail.enNote) || detail.ruNote}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default PriceCategoryModal;
