import ImageWithFallback from './ImageWithFallback';
import { formatDate, withBase } from '../utils/format';
import { getLocalizedText } from '../utils/i18n';
import { getResponsiveImageProps } from '../utils/responsiveImages';

function MusicCard({ item, language, tagsMap, index = 0, onOpen }) {
  const title = item[language === 'ru' ? 'ruTitle' : 'enTitle'];
  const leadTag = item.tags[0] ? tagsMap.get(item.tags[0]) : null;
  const coverImageProps = getResponsiveImageProps(item.cover);
  const isPriorityImage = item.featured && index < 2;

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article className={item.featured ? 'media-card is-featured' : 'media-card'}>
      <div className="card-hitbox" role="button" tabIndex={0} aria-label={title} onClick={onOpen} onKeyDown={handleKeyDown}>
        <div className={item.featured ? 'card-media square-ratio music-surface featured-card-media' : 'card-media square-ratio music-surface'}>
          <ImageWithFallback
            src={withBase(item.cover)}
            fallback={withBase('/music/placeholder-cover.svg')}
            alt={title}
            loading={isPriorityImage ? 'eager' : 'lazy'}
            fetchPriority={isPriorityImage ? 'high' : 'auto'}
            {...coverImageProps}
          />
          <div className="card-media-overlay overlay-top">
            {item.featured && <span className="featured-badge">{getLocalizedText(language, 'featuredBadge')}</span>}
          </div>
          <div className="card-media-overlay overlay-bottom overlay-right">
            <span className="content-type-badge media-corner-badge">{getLocalizedText(language, 'musicType')}</span>
          </div>
        </div>

        <div className="card-meta music-meta">
          <div className="meta-texts">
            <h2>{title}</h2>
            <p>{item.artistName}</p>
            <div className="meta-bottom-row">
              {leadTag && <span className="meta-pill">{leadTag[language]}</span>}
              <span>{formatDate(item.createdAt, language)}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default MusicCard;
