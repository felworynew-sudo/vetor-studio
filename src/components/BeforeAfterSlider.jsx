import { useCallback, useEffect, useRef, useState } from 'react';
import { withBase } from '../utils/format';

const text = {
  ru: { before: 'Оригинал', color: 'Цвет', bw: 'ЧБ', after: 'Реставрация' },
  en: { before: 'Original', color: 'Color', bw: 'B/W', after: 'Restored' },
};

function BeforeAfterSlider({ language = 'ru', before, afterColor, afterBw, beforeLabel, afterLabel }) {
  const base = text[language] ?? text.ru;
  const t = { ...base, before: beforeLabel || base.before, after: afterLabel || base.after };
  const containerRef = useRef(null);
  const draggingRef = useRef(false);
  const [position, setPosition] = useState(50);
  const [mode, setMode] = useState('color');
  const [ratio, setRatio] = useState(null);

  function handleBeforeLoad(event) {
    const { naturalWidth, naturalHeight } = event.target;
    if (naturalWidth && naturalHeight) {
      setRatio(naturalWidth / naturalHeight);
    }
  }

  const hasColor = Boolean(afterColor);
  const hasBw = Boolean(afterBw);
  const activeAfter = mode === 'bw' ? afterBw || afterColor : afterColor || afterBw;

  const updateFromClientX = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setPosition(Math.max(0, Math.min(100, ratio * 100)));
  }, []);

  useEffect(() => {
    function onMove(event) {
      if (!draggingRef.current) return;
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      updateFromClientX(clientX);
    }
    function onUp() {
      draggingRef.current = false;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [updateFromClientX]);

  function startDrag(event) {
    draggingRef.current = true;
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    updateFromClientX(clientX);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      setPosition((p) => Math.max(0, p - 4));
    } else if (event.key === 'ArrowRight') {
      setPosition((p) => Math.min(100, p + 4));
    }
  }

  return (
    <div className="ba-slider-wrap">
      <div
        ref={containerRef}
        className="ba-slider"
        style={{ aspectRatio: ratio ? String(ratio) : '3 / 2' }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        <img className="ba-slider-img ba-slider-before" src={withBase(before)} alt={t.before} draggable="false" onLoad={handleBeforeLoad} />
        <img
          className="ba-slider-img ba-slider-after-img"
          src={withBase(activeAfter)}
          alt={t.after}
          draggable="false"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        <span className="ba-slider-label ba-label-before">{t.before}</span>
        <span className="ba-slider-label ba-label-after" style={{ opacity: position < 82 ? 1 : 0 }}>{t.after}</span>
        <div
          className="ba-slider-handle"
          style={{ left: `${position}%` }}
          role="slider"
          tabIndex={0}
          aria-label={language === 'ru' ? 'Сравнение до и после' : 'Before / after comparison'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          onKeyDown={onKeyDown}
        >
          <span className="ba-slider-knob" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M9 6 4 12l5 6M15 6l5 6-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
      </div>

      {hasColor && hasBw ? (
        <div className="ba-slider-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'color'}
            className={mode === 'color' ? 'tag-pill is-active' : 'tag-pill'}
            onClick={() => setMode('color')}
          >
            {t.color}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bw'}
            className={mode === 'bw' ? 'tag-pill is-active' : 'tag-pill'}
            onClick={() => setMode('bw')}
          >
            {t.bw}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default BeforeAfterSlider;
