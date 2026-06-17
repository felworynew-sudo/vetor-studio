import { useEffect, useRef, useState } from 'react';
import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';
import { getOptimizedImageSrc } from '../utils/responsiveImages';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

const galleryModalText = {
  ru: {
    close: 'Закрыть',
    previous: 'Предыдущее фото',
    next: 'Следующее фото',
    image: 'Изображение',
  },
  en: {
    close: 'Close',
    previous: 'Previous photo',
    next: 'Next photo',
    image: 'Image',
  },
};

function GalleryModal({ item, language, onClose }) {
  const modalRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [slideDirection, setSlideDirection] = useState('');

  useModalAccessibility({ isOpen: Boolean(item), modalRef, onClose });

  useEffect(() => {
    setActiveIndex(0);
    setDragOffset(0);
    setSlideDirection('');
  }, [item?.id]);

  useEffect(() => {
    if (!item) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => {
          const nextIndex = Math.max(0, current - 1);
          if (nextIndex !== current) {
            setSlideDirection('previous');
          }
          return nextIndex;
        });
      }

      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => {
          const nextIndex = Math.min((item.images?.length || 1) - 1, current + 1);
          if (nextIndex !== current) {
            setSlideDirection('next');
          }
          return nextIndex;
        });
      }
    }
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item]);

  if (!item) {
    return null;
  }

  const copy = galleryModalText[language] ?? galleryModalText.ru;
  const title = item[language === 'ru' ? 'ruTitle' : 'enTitle'];
  const description = item[language === 'ru' ? 'ruDescription' : 'enDescription'];
  const images = item.images || [];
  const activeImage = images[activeIndex] || images[0];
  const alt = activeImage?.[language === 'ru' ? 'ruAlt' : 'enAlt'] || title;
  const hasCarousel = images.length > 1;

  function goToPrevious() {
    const nextIndex = Math.max(0, activeIndex - 1);
    if (nextIndex === activeIndex) {
      return;
    }

    setSlideDirection('previous');
    setActiveIndex(nextIndex);
  }

  function goToNext() {
    const nextIndex = Math.min(images.length - 1, activeIndex + 1);
    if (nextIndex === activeIndex) {
      return;
    }

    setSlideDirection('next');
    setActiveIndex(nextIndex);
  }

  function handleTouchEnd(event) {
    if (touchStartX === null || !hasCarousel) {
      setDragOffset(0);
      return;
    }

    const delta = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 44) {
      if (delta > 0) {
        goToPrevious();
      } else {
        goToNext();
      }
    }
    setTouchStartX(null);
    setDragOffset(0);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section ref={modalRef} className="gallery-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar gallery-topbar">
          <div>
            <span className="content-type-badge subtle">{copy.image}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div
          className="gallery-viewer"
          onTouchStart={(event) => {
            setSlideDirection('');
            setTouchStartX(event.touches[0].clientX);
          }}
          onTouchMove={(event) => {
            if (touchStartX !== null && hasCarousel) {
              setDragOffset(Math.max(-64, Math.min(64, event.touches[0].clientX - touchStartX)));
            }
          }}
          onTouchEnd={handleTouchEnd}
        >
          <div className="gallery-image-stage" style={{ transform: `translateX(${dragOffset}px)` }}>
            <div
              key={`${activeImage?.src || 'placeholder'}-${activeIndex}`}
              className={slideDirection ? `gallery-image-frame is-${slideDirection}` : 'gallery-image-frame'}
              onAnimationEnd={() => setSlideDirection('')}
            >
              <ImageWithFallback
                src={getOptimizedImageSrc(activeImage?.src || '/gallery/gallery-placeholder.svg', 1280)}
                fallback={withBase('/gallery/gallery-placeholder.svg')}
                alt={alt}
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>
          {hasCarousel && (
            <>
              <button
                type="button"
                className="gallery-side-arrow left"
                onClick={goToPrevious}
                disabled={activeIndex === 0}
                aria-label={copy.previous}
              >
                &lt;
              </button>
              <button
                type="button"
                className="gallery-side-arrow right"
                onClick={goToNext}
                disabled={activeIndex === images.length - 1}
                aria-label={copy.next}
              >
                &gt;
              </button>
            </>
          )}
        </div>

        {hasCarousel && (
          <div className="gallery-thumbs">
            {images.map((image, index) => (
              <button
                key={`${image.src}-${index}`}
                type="button"
                className={index === activeIndex ? 'gallery-thumb is-active' : 'gallery-thumb'}
                onClick={() => setActiveIndex(index)}
              >
                <ImageWithFallback
                  src={getOptimizedImageSrc(image.src, 640)}
                  fallback={withBase('/gallery/gallery-placeholder.svg')}
                  alt={image[language === 'ru' ? 'ruAlt' : 'enAlt'] || title}
                  loading={index === activeIndex ? 'eager' : 'lazy'}
                  fetchPriority={index === activeIndex ? 'high' : 'auto'}
                />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default GalleryModal;
