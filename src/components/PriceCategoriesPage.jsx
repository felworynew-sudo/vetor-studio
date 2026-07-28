import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import { withBase } from '../utils/format';

const PLACEHOLDER = '/gallery/gallery-placeholder.svg';

const priceCatText = {
  ru: {
    eyebrow: 'Цены',
    title: 'Что будем делать?',
    lead: 'Выбери услугу — внутри цены, форматы и сроки. Не нашли нужное — напишите нам.',
    createItem: 'Добавить категорию',
    contactCta: 'Написать нам',
  },
  en: {
    eyebrow: 'Pricing',
    title: 'What are we making?',
    lead: 'Pick a service — prices, formats, and timing inside. Not listed? Message us.',
    createItem: 'Add category',
    contactCta: 'Message us',
  },
};

function PriceCategoriesPage({
  language,
  copy,
  categories = [],
  contactUrl,
  studioEnabled = false,
  onEditHeading,
  onOpenCategory,
  onCreateItem,
  onEditItem,
  onDeleteItem,
}) {
  const base = priceCatText[language] ?? priceCatText.ru;
  const ui = {
    ...base,
    eyebrow: copy?.eyebrow || base.eyebrow,
    title: copy?.title || base.title,
    lead: copy?.lead || base.lead,
  };
  const titleKey = language === 'ru' ? 'ruTitle' : 'enTitle';
  const subtitleKey = language === 'ru' ? 'ruSubtitle' : 'enSubtitle';

  return (
    <section className="section-page price-cats-page">
      <div className="section-page-head surface-panel">
        {studioEnabled && onEditHeading ? <DevEditButton label="Edit heading" onClick={onEditHeading} className="section-edit-button" /> : null}
        <p className="eyebrow">{ui.eyebrow}</p>
        <h1>{ui.title}</h1>
        <p>{ui.lead}</p>
        {studioEnabled && onCreateItem ? (
          <div className="design-actions-row">
            <button type="button" className="cta-button secondary" onClick={onCreateItem}>
              {ui.createItem}
            </button>
          </div>
        ) : null}
      </div>

      <div className="price-cats-grid">
        {categories.map((category) => {
          const title = category[titleKey] || category.ruTitle || category.id;
          const subtitle = category[subtitleKey] || category.ruSubtitle || '';
          const style = category.accentColor ? { '--price-cat-accent': category.accentColor } : undefined;
          const isContact = category.kind === 'contact';

          if (isContact) {
            return (
              <a
                key={category.id}
                className="price-cat-card price-cat-contact"
                href={contactUrl || 'https://t.me/felwory'}
                target="_blank"
                rel="noopener noreferrer"
                style={style}
              >
                {studioEnabled ? (
                  <div className="gallery-tile-actions" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                    <button type="button" className="gallery-tile-action" onClick={() => onEditItem?.(category)} aria-label="Edit" title="Edit">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Z" fill="currentColor" /></svg>
                    </button>
                  </div>
                ) : null}
                <div className="price-cat-body">
                  <div className="price-cat-copy">
                    <h2>{title}</h2>
                    {subtitle ? <p>{subtitle}</p> : null}
                  </div>
                  <span className="cta-button primary price-cat-contact-cta">{ui.contactCta}</span>
                </div>
              </a>
            );
          }

          return (
            <div
              key={category.id}
              className="price-cat-card"
              role="button"
              tabIndex={0}
              style={style}
              onClick={() => onOpenCategory?.(category)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenCategory?.(category);
                }
              }}
            >
              {studioEnabled ? (
                <div className="gallery-tile-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="gallery-tile-action" onClick={() => onEditItem?.(category)} aria-label="Edit" title="Edit">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Z" fill="currentColor" /></svg>
                  </button>
                  <button type="button" className="gallery-tile-action danger" onClick={() => onDeleteItem?.(category)} aria-label="Delete" title="Delete">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Z" fill="currentColor" /></svg>
                  </button>
                </div>
              ) : null}
              <div className="price-cat-media">
                <ImageWithFallback
                  src={withBase(category.image || PLACEHOLDER)}
                  fallback={withBase(PLACEHOLDER)}
                  alt={title}
                />
              </div>
              <div className="price-cat-body">
                <div className="price-cat-copy">
                  <h2>{title}</h2>
                  {subtitle ? <p>{subtitle}</p> : null}
                </div>
                <span className="price-cat-go" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default PriceCategoriesPage;
