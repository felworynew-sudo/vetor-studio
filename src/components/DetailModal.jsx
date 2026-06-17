import { useEffect, useRef, useState } from 'react';
import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';
import { getLocalizedText } from '../utils/i18n';
import { getPsdDownloadUrl } from '../utils/links';
import { getOptimizedImageSrc, getResponsiveImageProps } from '../utils/responsiveImages';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

function DetailModal({ item, language, tagsMap, onClose, studioEnabled = false, onEdit }) {
  const modalRef = useRef(null);
  const [isFullscreenImageOpen, setIsFullscreenImageOpen] = useState(false);

  useModalAccessibility({
    isOpen: Boolean(item),
    modalRef,
    onClose,
    onEscape: () => {
      if (isFullscreenImageOpen) {
        setIsFullscreenImageOpen(false);
        return;
      }
      onClose();
    },
  });

  useEffect(() => {
    setIsFullscreenImageOpen(false);
  }, [item?.id]);

  if (!item) {
    return null;
  }

  const title = item[language === 'ru' ? 'ruTitle' : 'enTitle'];
  const isVideo = item.type === 'video';
  const psdDownloadUrl = getPsdDownloadUrl(item);
  const isPsd = Boolean(psdDownloadUrl);
  const primaryLabel = getLocalizedText(language, isPsd ? 'downloadPsd' : isVideo ? 'openVideo' : 'openTrack');
  const secondaryLabel = getLocalizedText(language, isVideo ? 'openChannel' : 'openArtist');
  const secondaryTitle = isVideo ? item.channelName : item.artistName;
  const secondaryUrl = isVideo ? item.channelUrl : item.artistUrl;
  const primaryUrl = isPsd ? psdDownloadUrl : isVideo ? item.videoUrl : item.trackUrl;
  const imagePath = isVideo ? item.thumbnail : item.cover;
  const fallbackPath = isVideo ? '/thumbs/placeholder-video.svg' : '/music/placeholder-cover.svg';
  const responsiveImageProps = getResponsiveImageProps(imagePath);
  const fullImagePath = getOptimizedImageSrc(imagePath, 1280);
  const subtitleLabel = getLocalizedText(language, isVideo ? 'channelLabel' : 'artistLabel');
  const editLabel = getLocalizedText(language, 'editItem');

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div ref={modalRef} className="detail-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar detail-topbar">
          <span className="modal-topbar-label">{getLocalizedText(language, isPsd ? 'psdType' : isVideo ? 'videoType' : 'musicType')}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label={getLocalizedText(language, 'close')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="detail-media-wrap">
          <button
            type="button"
            className={isVideo ? 'detail-media detail-media-open video-ratio' : 'detail-media detail-media-open square-ratio'}
            onClick={() => setIsFullscreenImageOpen(true)}
            aria-label={language === 'ru' ? 'Открыть изображение на весь экран' : 'Open image fullscreen'}
          >
            <ImageWithFallback
              src={withBase(imagePath)}
              fallback={withBase(fallbackPath)}
              alt={title}
              loading="eager"
              fetchPriority="high"
              {...responsiveImageProps}
            />
          </button>
        </div>

        <div className="detail-content">
          <div className="detail-header">
            <div className="detail-header-topline">
              <span className="content-type-badge subtle">{getLocalizedText(language, isPsd ? 'psdType' : isVideo ? 'videoType' : 'musicType')}</span>
              {studioEnabled && onEdit && (
                <button
                  type="button"
                  className="content-type-badge detail-edit-button"
                  onClick={onEdit}
                  aria-label={editLabel}
                  title={editLabel}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16.73 3.69a2.25 2.25 0 0 1 3.18 3.18l-9.84 9.84-4.2.86.86-4.2 9.84-9.84Zm-8.69 10.6-.38 1.83 1.83-.38 8.82-8.82a.75.75 0 0 0-1.06-1.06l-8.82 8.82Z" fill="currentColor" />
                  </svg>
                </button>
              )}
            </div>
            <h2>{title}</h2>
            {!isPsd && (
              <p>
                <span>{subtitleLabel}</span>
                <a href={secondaryUrl} target="_blank" rel="noreferrer">
                  {secondaryTitle}
                </a>
              </p>
            )}
            {item.description ? <div className="detail-description">{item.description}</div> : null}
          </div>

          <div className="detail-tags-block">
            <span className="detail-label">{getLocalizedText(language, 'modalTags')}</span>
            <div className="detail-tags">
              {item.tags.length > 0 ? (
                item.tags.map((tagSlug) => {
                  const tag = tagsMap.get(tagSlug);
                  return (
                    <span key={tagSlug} className="tag-pill modal-pill">
                      {tag ? tag[language] : tagSlug}
                    </span>
                  );
                })
              ) : (
                <span className="detail-muted">{getLocalizedText(language, 'noTags')}</span>
              )}
            </div>
          </div>

          <div className={isPsd ? 'detail-actions is-psd-actions' : 'detail-actions'}>
            <a href={primaryUrl} target="_blank" rel="noreferrer" download={isPsd ? true : undefined} className={isPsd ? 'cta-button primary psd-download-button' : 'cta-button primary'}>
              {primaryLabel}
            </a>
            {!isPsd && (
              <a href={secondaryUrl} target="_blank" rel="noreferrer" className="cta-button secondary">
                {secondaryLabel}
              </a>
            )}
          </div>
        </div>
      </div>

      {isFullscreenImageOpen && (
        <div className="image-fullscreen" role="dialog" aria-modal="true" aria-label={title} onClick={() => setIsFullscreenImageOpen(false)}>
          <button
            type="button"
            className="modal-close image-fullscreen-close"
            onClick={() => setIsFullscreenImageOpen(false)}
            aria-label={getLocalizedText(language, 'close')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
          <img src={fullImagePath} alt={title} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export default DetailModal;
