import DevEditButton from './DevEditButton';
import defaultSectionCopy from '../data/sectionCopy';
import { withBase } from '../utils/format';

function PromoBanner({ language, sectionCopy, studioEnabled = false, onEdit, onOpen, href = '/price', className = '' }) {
  const copy = {
    ...(defaultSectionCopy.promo[language] ?? defaultSectionCopy.promo.ru),
    ...(sectionCopy?.[language] || {}),
  };

  function handleClick(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onOpen();
  }

  return (
    <section className={`promo-banner ${className}`.trim()}>
      {studioEnabled && onEdit ? <DevEditButton label="Edit pricing" onClick={onEdit} className="promo-edit-button" /> : null}
      <div className="promo-copy">
        <span>{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.text}</p>
      </div>
      <img className="promo-ghost" src={withBase('/ghost/GhostPrice.webp')} alt="" aria-hidden="true" loading="lazy" />
      <a href={href} className="cta-button primary" onClick={handleClick}>
        {copy.button}
      </a>
    </section>
  );
}

export default PromoBanner;
