import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import { withBase } from '../utils/format';

const PLACEHOLDER = '/gallery/gallery-placeholder.svg';

const launcherText = {
  ru: {
    eyebrow: 'Студия дизайна Vetor',
    title: 'Привет, что будем делать сегодня?',
    lead: 'Выбери направление — от превью для YouTube до авторских шрифтов и плагинов.',
  },
  en: {
    eyebrow: 'Vetor Design Studio',
    title: 'Hi, what are we making today?',
    lead: 'Pick a direction — from YouTube thumbnails to custom fonts and plugins.',
  },
};

function HomeLauncher({ language, copy: copyOverride, cards = [], onSelect, getSectionHref, studioEnabled = false, onEditHeading, onCreateCard, onEditCard, onDeleteCard }) {
  const base = launcherText[language] ?? launcherText.ru;
  const copy = {
    eyebrow: copyOverride?.eyebrow || base.eyebrow,
    title: copyOverride?.title || base.title,
    lead: copyOverride?.lead || base.lead,
  };
  const titleKey = language === 'ru' ? 'ruTitle' : 'enTitle';
  const subtitleKey = language === 'ru' ? 'ruSubtitle' : 'enSubtitle';

  function handleClick(event, card) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onSelect?.(card.section);
  }

  return (
    <section className="section-page home-launcher">
      <div className="home-launcher-head">
        {studioEnabled && onEditHeading ? <DevEditButton label="Edit heading" onClick={onEditHeading} className="section-edit-button" /> : null}
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="home-launcher-lead">{copy.lead}</p>
        {studioEnabled && onCreateCard ? (
          <div className="design-actions-row">
            <button type="button" className="cta-button secondary" onClick={onCreateCard}>
              {language === 'ru' ? 'Добавить карточку' : 'Add card'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="home-launcher-grid">
        {cards.map((card) => {
          const title = card[titleKey] || card.ruTitle || card.key;
          const subtitle = card[subtitleKey] || card.ruSubtitle || '';
          const style = card.accentColor ? { '--launcher-accent': card.accentColor } : undefined;

          return (
            <div key={card.key} className="home-launcher-card-wrap" style={style}>
              {studioEnabled ? (
                <div className="gallery-tile-actions home-launcher-actions">
                  <button type="button" className="gallery-tile-action" onClick={() => onEditCard?.(card)} aria-label="Edit" title="Edit">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Z" fill="currentColor" /></svg>
                  </button>
                  <button type="button" className="gallery-tile-action danger" onClick={() => onDeleteCard?.(card)} aria-label="Delete" title="Delete">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Z" fill="currentColor" /></svg>
                  </button>
                </div>
              ) : null}
              <a
                className="home-launcher-card"
                href={getSectionHref ? getSectionHref(card.section) : '#'}
                onClick={(event) => handleClick(event, card)}
              >
                <div className="home-launcher-media">
                  <ImageWithFallback
                    src={withBase(card.image || PLACEHOLDER)}
                    fallback={withBase(PLACEHOLDER)}
                    alt={title}
                  />
                </div>
                <div className="home-launcher-body">
                  <div className="home-launcher-copy">
                    <h2>{title}</h2>
                    {subtitle ? <p>{subtitle}</p> : null}
                  </div>
                  <span className="home-launcher-go" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default HomeLauncher;
