import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import defaultSectionCopy from '../data/sectionCopy';
import { withBase } from '../utils/format';
import { getResponsiveImageProps } from '../utils/responsiveImages';
import { normalizeDesignCategory } from '../data/designCategories';

const galleryPageText = {
  ru: {
    createItem: 'Добавить работу',
    youtubeMetaFallback: 'YouTube-канал',
    openChannel: 'Канал',
    openSticker: 'Открыть',
  },
  en: {
    createItem: 'Add work',
    youtubeMetaFallback: 'YouTube channel',
    openChannel: 'Channel',
    openSticker: 'Open',
  },
};

function getLocalizedValue(item, language, ruField, enField) {
  return item?.[language === 'ru' ? ruField : enField] || item?.[ruField] || item?.[enField] || '';
}

function GalleryPage({
  language,
  items,
  sectionCopy,
  activeCategory = 'all',
  categories = [],
  studioEnabled = false,
  onEdit,
  onCreateItem,
  onOpenItem,
  onEditItem,
  onDeleteItem,
  onCategoryChange,
  getCategoryHref,
}) {
  const copy = {
    ...(defaultSectionCopy.gallery[language] ?? defaultSectionCopy.gallery.ru),
    ...(sectionCopy?.[language] || {}),
  };
  const ui = galleryPageText[language] ?? galleryPageText.ru;
  const titleKey = language === 'ru' ? 'ruTitle' : 'enTitle';
  const descriptionKey = language === 'ru' ? 'ruDescription' : 'enDescription';
  const currentCategory = normalizeDesignCategory(activeCategory);
  const availableCategorySlugs = new Set(
    items.map((item) => normalizeDesignCategory(item.designCategory || 'all')),
  );
  const visibleCategories = studioEnabled
    ? categories
    : categories.filter((category) => category.slug === 'all' || availableCategorySlugs.has(category.slug));

  return (
    <section className="section-page">
      <div className="section-page-head surface-panel">
        {studioEnabled && onEdit ? <DevEditButton label="Edit design section" onClick={onEdit} className="section-edit-button" /> : null}
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.text}</p>

        <div className="design-filter-row" role="tablist" aria-label={language === 'ru' ? 'Категории дизайна' : 'Design categories'}>
          {visibleCategories.map((category) => {
            const isActive = currentCategory === category.slug;
            return (
              <a
                key={category.slug}
                href={getCategoryHref ? getCategoryHref(category.slug) : '#'}
                className={isActive ? 'tag-pill is-active' : 'tag-pill'}
                role="tab"
                aria-selected={isActive}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
                    return;
                  }
                  event.preventDefault();
                  onCategoryChange?.(category.slug);
                }}
              >
                {category[language] || category.ru || category.en || category.slug}
              </a>
            );
          })}
        </div>

        {studioEnabled && onCreateItem ? (
          <div className="design-actions-row">
            <button type="button" className="cta-button secondary" onClick={onCreateItem}>
              {ui.createItem}
            </button>
          </div>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="gallery-grid design-grid">
          {items.map((item) => {
            const firstImage = item.images?.[0];
            const imageSrc = firstImage?.src || '/gallery/gallery-placeholder.svg';
            const responsiveImageProps = getResponsiveImageProps(imageSrc);
            const itemCategory = normalizeDesignCategory(item.designCategory || 'all');

            if (itemCategory === 'youtube') {
              const channel = item.youtubeChannel || {};
              const bannerSrc = channel.cover || firstImage?.src || '/gallery/gallery-placeholder.svg';
              const avatarSrc = channel.avatar || item.images?.[1]?.src || '/owner/owner-avatar.webp';
              const channelName = channel.name || item[titleKey] || ui.youtubeMetaFallback;
              const channelMeta = getLocalizedValue(channel, language, 'metaRu', 'metaEn') || item[descriptionKey] || ui.youtubeMetaFallback;
              const channelHandle = channel.handle || '';
              const channelCtaRaw = getLocalizedValue(channel, language, 'ctaRu', 'ctaEn') || ui.openChannel;
              const channelCta = language === 'ru' && channelCtaRaw.trim().toLowerCase() === 'подписаться'
                ? 'Канал'
                : channelCtaRaw;

              return (
                <article key={item.id} className="design-youtube-card" onClick={() => onOpenItem(item)}>
                  {studioEnabled ? (
                    <div className="gallery-tile-actions" onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="gallery-tile-action" onClick={() => onEditItem(item)} aria-label="Edit design item" title="Edit design item">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Zm-8.69 10.6-.38 1.83 1.83-.38 8.82-8.82a.75.75 0 0 0-1.06-1.06l-8.82 8.82Z" fill="currentColor" />
                        </svg>
                      </button>
                      <button type="button" className="gallery-tile-action danger" onClick={() => onDeleteItem(item)} aria-label="Delete design item" title="Delete design item">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2 .2 7h1.6l-.2-7H10Zm4 0-.2 7h1.6l.2-7H14Z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  ) : null}

                  <div className="design-youtube-hitbox">
                    <div className="design-youtube-banner">
                      <ImageWithFallback
                        src={withBase(bannerSrc)}
                        fallback={withBase('/gallery/gallery-placeholder.svg')}
                        alt={firstImage?.[language === 'ru' ? 'ruAlt' : 'enAlt'] || channelName}
                        {...getResponsiveImageProps(bannerSrc)}
                      />
                    </div>
                    <div className="design-youtube-content">
                      <div className="design-youtube-avatar">
                        <ImageWithFallback
                          src={withBase(avatarSrc)}
                          fallback={withBase('/owner/owner-avatar.webp')}
                          alt={channelName}
                        />
                      </div>
                      <div className="design-youtube-copy">
                        <h2>{channelName}</h2>
                        {channelHandle ? <p className="design-youtube-handle">{channelHandle}</p> : null}
                        <p>{channelMeta}</p>
                        {channel.ctaUrl ? (
                          <a
                            className="cta-button secondary"
                            href={channel.ctaUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {channelCta}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            if (itemCategory === 'stickers') {
              const stickers = item.stickers || {};
              const primaryLabel = getLocalizedValue(stickers, language, 'primaryRu', 'primaryEn') || ui.openSticker;
              const secondaryLabel = getLocalizedValue(stickers, language, 'secondaryRu', 'secondaryEn') || ui.openSticker;

              return (
                <article key={item.id} className="design-sticker-card" onClick={() => onOpenItem(item)}>
                  {studioEnabled ? (
                    <div className="gallery-tile-actions" onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="gallery-tile-action" onClick={() => onEditItem(item)} aria-label="Edit design item" title="Edit design item">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Zm-8.69 10.6-.38 1.83 1.83-.38 8.82-8.82a.75.75 0 0 0-1.06-1.06l-8.82 8.82Z" fill="currentColor" />
                        </svg>
                      </button>
                      <button type="button" className="gallery-tile-action danger" onClick={() => onDeleteItem(item)} aria-label="Delete design item" title="Delete design item">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2 .2 7h1.6l-.2-7H10Zm4 0-.2 7h1.6l.2-7H14Z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  ) : null}

                  <div className="design-sticker-hitbox">
                    <div className="design-sticker-media">
                      <ImageWithFallback
                        src={withBase(imageSrc)}
                        fallback={withBase('/gallery/gallery-placeholder.svg')}
                        alt={firstImage?.[language === 'ru' ? 'ruAlt' : 'enAlt'] || item[titleKey]}
                        {...responsiveImageProps}
                      />
                    </div>
                    <div className="design-sticker-body">
                      <h2>{item[titleKey]}</h2>
                      <p>{item[descriptionKey]}</p>
                      <div className="design-sticker-links" onClick={(event) => event.stopPropagation()}>
                        {stickers.primaryUrl ? (
                          <a className="cta-button secondary" href={stickers.primaryUrl} target="_blank" rel="noreferrer">
                            {primaryLabel}
                          </a>
                        ) : null}
                        {stickers.secondaryUrl ? (
                          <a className="cta-button secondary" href={stickers.secondaryUrl} target="_blank" rel="noreferrer">
                            {secondaryLabel}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            return (
              <article key={item.id} className={`gallery-tile ${item.ratio || 'square'}`} onClick={() => onOpenItem(item)}>
                {studioEnabled ? (
                  <div className="gallery-tile-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="gallery-tile-action" onClick={() => onEditItem(item)} aria-label="Edit design item" title="Edit design item">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Zm-8.69 10.6-.38 1.83 1.83-.38 8.82-8.82a.75.75 0 0 0-1.06-1.06l-8.82 8.82Z" fill="currentColor" />
                      </svg>
                    </button>
                    <button type="button" className="gallery-tile-action danger" onClick={() => onDeleteItem(item)} aria-label="Delete design item" title="Delete design item">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2 .2 7h1.6l-.2-7H10Zm4 0-.2 7h1.6l.2-7H14Z" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                ) : null}
                <button type="button" className="gallery-tile-hitbox" aria-label={item[titleKey]}>
                  <ImageWithFallback
                    src={withBase(imageSrc)}
                    fallback={withBase('/gallery/gallery-placeholder.svg')}
                    alt={firstImage?.[language === 'ru' ? 'ruAlt' : 'enAlt'] || item[titleKey]}
                    {...responsiveImageProps}
                  />
                  <div className="gallery-tile-overlay">
                    <span>{item.images?.length || 1} {copy.count}</span>
                    <h2>{item[titleKey]}</h2>
                    <p>{item[descriptionKey]}</p>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state surface-panel">
          <h2>{copy.empty}</h2>
        </div>
      )}
    </section>
  );
}

export default GalleryPage;
