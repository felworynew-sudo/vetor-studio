import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import { withBase } from '../utils/format';

const PLACEHOLDER = '/gallery/gallery-placeholder.svg';
const DEFAULT_BOT = 'https://t.me/VetorPluginBOT';

const fontsText = {
  ru: {
    eyebrow: 'Шрифты',
    title: 'Авторские шрифты Vetor',
    lead: 'Скачивание — через Telegram-бот VetorGet (@VetorPluginBOT). Нажми на кнопку под нужным шрифтом.',
    download: 'Скачать в боте',
    botNote: 'Все шрифты доступны через бота @VetorPluginBOT',
    createItem: 'Добавить шрифт',
    empty: 'Шрифты пока не добавлены',
  },
  en: {
    eyebrow: 'Fonts',
    title: 'Vetor custom fonts',
    lead: 'Download via the Telegram bot VetorGet (@VetorPluginBOT). Tap the button under a font.',
    download: 'Download in bot',
    botNote: 'All fonts are available via the @VetorPluginBOT bot',
    createItem: 'Add font',
    empty: 'No fonts yet',
  },
};

function FontsPage({
  language,
  copy,
  fonts = [],
  studioEnabled = false,
  onEditHeading,
  onCreateItem,
  onEditItem,
  onDeleteItem,
}) {
  const base = fontsText[language] ?? fontsText.ru;
  const ui = {
    ...base,
    eyebrow: copy?.eyebrow || base.eyebrow,
    title: copy?.title || base.title,
    lead: copy?.lead || base.lead,
  };
  const styleKey = language === 'ru' ? 'ruStyle' : 'enStyle';
  const descriptionKey = language === 'ru' ? 'ruDescription' : 'enDescription';

  return (
    <section className="section-page fonts-page">
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

      {fonts.length > 0 ? (
        <div className="fonts-grid">
          {fonts.map((font) => {
            const style = font.accentColor ? { '--font-accent': font.accentColor } : undefined;
            const botUrl = font.botUrl || DEFAULT_BOT;

            return (
              <article key={font.id || font.name} className="font-card surface-panel" style={style}>
                {studioEnabled ? (
                  <div className="gallery-tile-actions">
                    <button type="button" className="gallery-tile-action" onClick={() => onEditItem?.(font)} aria-label="Edit font" title="Edit font">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Zm-8.69 10.6-.38 1.83 1.83-.38 8.82-8.82a.75.75 0 0 0-1.06-1.06l-8.82 8.82Z" fill="currentColor" />
                      </svg>
                    </button>
                    <button type="button" className="gallery-tile-action danger" onClick={() => onDeleteItem?.(font)} aria-label="Delete font" title="Delete font">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2 .2 7h1.6l-.2-7H10Zm4 0-.2 7h1.6l.2-7H14Z" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                ) : null}

                <div className="font-card-specimen">
                  <ImageWithFallback
                    src={withBase(font.specimen || PLACEHOLDER)}
                    fallback={withBase(PLACEHOLDER)}
                    alt={font.name}
                  />
                </div>
                <div className="font-card-body">
                  <div className="font-card-heading">
                    <h2>{font.name}</h2>
                    {font[styleKey] ? <span className="font-card-style">{font[styleKey]}</span> : null}
                  </div>
                  {font[descriptionKey] ? <p>{font[descriptionKey]}</p> : null}
                  <a className="cta-button primary font-card-download" href={botUrl} target="_blank" rel="noopener noreferrer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" />
                    </svg>
                    {ui.download}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state surface-panel">
          <h2>{ui.empty}</h2>
        </div>
      )}

      <p className="fonts-bot-note">{ui.botNote}</p>
    </section>
  );
}

export default FontsPage;
