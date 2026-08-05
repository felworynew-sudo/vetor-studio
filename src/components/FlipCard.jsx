import { useState } from 'react';
import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';

// Reusable flip card (front/back). Flips on hover (CSS) and on click/tap.
function FlipCard({ front, back, alt = '', label, className = '' }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      className={`flipcard ${flipped ? 'is-flipped' : ''} ${className}`.trim()}
      onClick={() => setFlipped((current) => !current)}
      aria-pressed={flipped}
      aria-label={label || 'Flip card'}
    >
      <span className="flipcard-inner">
        <span className="flipcard-face flipcard-front">
          <ImageWithFallback src={withBase(front)} fallback={withBase('/gallery/gallery-placeholder.svg')} alt={alt} />
        </span>
        <span className="flipcard-face flipcard-back">
          <ImageWithFallback src={withBase(back || front)} fallback={withBase('/gallery/gallery-placeholder.svg')} alt={alt} />
        </span>
      </span>
    </button>
  );
}

export default FlipCard;
