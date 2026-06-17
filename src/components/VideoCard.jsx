import ImageWithFallback from './ImageWithFallback';
import { formatDate, withBase } from '../utils/format';
import { getLocalizedText } from '../utils/i18n';
import { isPsdDownloadItem } from '../utils/links';
import { getResponsiveImageProps } from '../utils/responsiveImages';

function VideoCard({ item, language, tagsMap, index = 0, onOpen }) {
  const title = item[language === 'ru' ? 'ruTitle' : 'enTitle'];
  const isPsd = isPsdDownloadItem(item);
  const psdTag = tagsMap.get('psd');
  const leadTag = isPsd ? psdTag : item.tags[0] ? tagsMap.get(item.tags[0]) : null;
  const thumbnailImageProps = getResponsiveImageProps(item.thumbnail);
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
        <div className={item.featured ? 'card-media video-ratio featured-card-media' : 'card-media video-ratio'}>
          <ImageWithFallback
            src={withBase(item.thumbnail)}
            fallback={withBase('/thumbs/placeholder-video.svg')}
            alt={title}
            loading={isPriorityImage ? 'eager' : 'lazy'}
            fetchPriority={isPriorityImage ? 'high' : 'auto'}
            {...thumbnailImageProps}
          />
          <div className="card-media-overlay overlay-top">
            {item.featured && <span className="featured-badge">{getLocalizedText(language, 'featuredBadge')}</span>}
          </div>
          <div className="card-media-overlay overlay-bottom overlay-right">
            <span className="content-type-badge media-corner-badge">{getLocalizedText(language, isPsd ? 'psdType' : 'videoType')}</span>
          </div>
        </div>

        <div className="card-meta with-avatar">
          <a
            className="meta-avatar-link"
            href={item.channelUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            aria-label={item.channelName}
          >
            <ImageWithFallback
              src={withBase(item.channelAvatar)}
              fallback={withBase('/avatars/placeholder-channel.svg')}
              alt={item.channelName}
              className="meta-avatar"
              width={40}
              height={40}
            />
          </a>

          <div className="meta-texts">
            <h2>{title}</h2>
            <p>{item.channelName}</p>
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

export default VideoCard;
