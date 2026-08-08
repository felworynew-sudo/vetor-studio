import { useRef } from 'react';
import ImageWithFallback from './ImageWithFallback';
import DevEditButton from './DevEditButton';
import CaseSitePreview from './CaseSitePreview';
import CaseCardFlip from './CaseCardFlip';
import CaseLogoShowcase from './CaseLogoShowcase';
import BeforeAfterSlider from './BeforeAfterSlider';
import { withBase } from '../utils/format';
import { getOptimizedImageSrc } from '../utils/responsiveImages';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

const caseText = {
  ru: { close: 'Закрыть', badge: 'Кейс', edit: 'Редактировать кейс' },
  en: { close: 'Close', badge: 'Case', edit: 'Edit case' },
};

function isVideoSrc(src) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(String(src || ''));
}

function localized(obj, language, key) {
  const prefix = language === 'ru' ? 'ru' : 'en';
  const localizedKey = `${prefix}${key[0].toUpperCase()}${key.slice(1)}`;
  return obj[localizedKey] || obj[key] || '';
}

function CaseMedia({ src, alt, sizeHint = 1600 }) {
  if (isVideoSrc(src)) {
    return <video src={withBase(src)} autoPlay loop muted playsInline preload="metadata" />;
  }
  return (
    <ImageWithFallback
      src={getOptimizedImageSrc(src, sizeHint)}
      fallback={withBase('/gallery/gallery-placeholder.svg')}
      alt={alt}
    />
  );
}

function CaseBlock({ block, language, title }) {
  if (block.type === 'text') {
    const value = localized(block, language, 'text');
    if (!value) {
      return null;
    }
    const inner = block.linkUrl ? (
      <a href={block.linkUrl} target="_blank" rel="noreferrer" className={block.linkStyle === 'button' ? 'case-inline-button' : undefined}>
        {value}
      </a>
    ) : value;

    if (block.size === 'hero') {
      return <h2 className={`case-h2 ${block.accent ? 'is-accent' : ''}`}>{inner}</h2>;
    }
    return (
      <p className={`case-p ${block.bold ? 'is-bold' : ''} ${block.italic ? 'is-italic' : ''} ${block.accent ? 'is-accent' : ''}`}>
        {inner}
      </p>
    );
  }

  if (block.type === 'image') {
    const caption = localized(block, language, 'caption');
    const alt = localized(block, language, 'alt') || caption || title;
    return (
      <figure className={`case-figure ${block.ratio || 'wide'}`}>
        <CaseMedia src={block.src} alt={alt} />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === 'site-preview') {
    return <CaseSitePreview block={block} language={language} />;
  }

  if (block.type === 'cards-flip') {
    return <CaseCardFlip block={block} language={language} title={title} />;
  }

  if (block.type === 'logo') {
    return <CaseLogoShowcase block={block} language={language} />;
  }

  if (block.type === 'slider') {
    const caption = localized(block, language, 'caption');
    return (
      <figure className="case-figure">
        <BeforeAfterSlider language={language} before={block.before} afterColor={block.afterColor} afterBw={block.afterBw} />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === 'slider') {
    const caption = localized(block, language, 'caption');
    return (
      <figure className="case-slider">
        <BeforeAfterSlider
          language={language}
          before={block.before}
          afterColor={block.afterColor}
          afterBw={block.afterBw}
          beforeLabel={language === 'ru' ? (block.ruBeforeLabel || 'До') : (block.enBeforeLabel || 'Before')}
          afterLabel={language === 'ru' ? (block.ruAfterLabel || 'После') : (block.enAfterLabel || 'After')}
        />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === 'carousel') {
    const caption = localized(block, language, 'caption');
    const images = Array.isArray(block.images) ? block.images : [];
    return (
      <figure className="case-carousel">
        <div className="case-carousel-track">
          {images.map((image, index) => (
            <div key={`${image.src}-${index}`} className={`case-carousel-slide ${image.ratio || 'portrait'}`}>
              <CaseMedia src={image.src} alt={image[language === 'ru' ? 'ruAlt' : 'enAlt'] || title} sizeHint={1000} />
            </div>
          ))}
        </div>
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }

  return null;
}

function CaseModal({ item, language, studioEnabled = false, onEdit, onClose }) {
  const modalRef = useRef(null);
  useModalAccessibility({ isOpen: Boolean(item), modalRef, onClose });

  if (!item) {
    return null;
  }

  const t = caseText[language] ?? caseText.ru;
  const title = item[language === 'ru' ? 'ruTitle' : 'enTitle'] || item.ruTitle;
  const lead = item[language === 'ru' ? 'ruDescription' : 'enDescription'] || item.ruDescription;
  const cover = item.cover;
  const blocks = Array.isArray(item.blocks) ? item.blocks : [];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={modalRef}
        className="case-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="case-modal-topbar">
          <span className="case-badge">{t.badge}</span>
          <div className="case-modal-topbar-actions">
            {studioEnabled && onEdit ? <DevEditButton label={t.edit} onClick={onEdit} className="case-edit-button" /> : null}
            <button type="button" className="modal-close" onClick={onClose} aria-label={t.close}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        <div className="case-scroll">
          <header className="case-hero">
            {cover ? (
              <div className="case-hero-media">
                <CaseMedia src={cover} alt={title} />
              </div>
            ) : null}
            <div className="case-hero-copy">
              <h1>{title}</h1>
              {lead ? <p className="case-lead">{lead}</p> : null}
            </div>
          </header>

          <div className="case-body">
            {blocks.map((block, index) => (
              <CaseBlock key={block.id || `${block.type}-${index}`} block={block} language={language} title={title} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CaseModal;
