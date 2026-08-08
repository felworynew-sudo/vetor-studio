import { useEffect, useState } from 'react';
import { withBase } from '../utils/format';

const DEVICES = [
  { key: 'mobile', width: 390, ru: 'Моб', en: 'Mobile' },
  { key: 'tablet', width: 834, ru: 'Планшет', en: 'Tablet' },
  { key: 'desktop', width: 0, ru: 'ПК', en: 'Desktop' },
];

function DeviceBar({ device, onDevice, language, fullscreen, onToggleFullscreen }) {
  return (
    <div className="siteprev-bar">
      <span className="siteprev-dots" aria-hidden="true"><i /><i /><i /></span>
      <div className="siteprev-devices" role="tablist" aria-label={language === 'ru' ? 'Устройство' : 'Device'}>
        {DEVICES.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={device === d.key}
            className={device === d.key ? 'siteprev-device is-active' : 'siteprev-device'}
            onClick={() => onDevice(d.key)}
          >
            {language === 'ru' ? d.ru : d.en}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={fullscreen ? 'siteprev-fs-btn is-close' : 'siteprev-fs-btn'}
        onClick={onToggleFullscreen}
        aria-label={fullscreen ? (language === 'ru' ? 'Закрыть' : 'Close') : (language === 'ru' ? 'На весь экран' : 'Fullscreen')}
      >
        {fullscreen ? (
          <>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" /></svg>
            <span>{language === 'ru' ? 'Закрыть' : 'Close'}</span>
          </>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </button>
    </div>
  );
}

function CaseSitePreview({ block, language }) {
  const [device, setDevice] = useState('desktop');
  const [fullscreen, setFullscreen] = useState(false);

  const src = block.src;
  const note = language === 'ru' ? (block.ruNote || block.note || '') : (block.enNote || block.ruNote || block.note || '');
  const caption = language === 'ru' ? (block.ruCaption || '') : (block.enCaption || '');

  useEffect(() => {
    if (!fullscreen) {
      return undefined;
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setFullscreen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  const dev = DEVICES.find((d) => d.key === device) || DEVICES[2];
  const screenStyle = dev.width ? { width: `${dev.width}px`, maxWidth: '100%' } : { width: '100%' };

  return (
    <figure className="case-siteprev">
      {fullscreen ? <div className="siteprev-fs-backdrop" onClick={() => setFullscreen(false)} /> : null}
      <div className={fullscreen ? 'siteprev-window is-fs' : 'siteprev-window'}>
        <DeviceBar
          device={device}
          onDevice={setDevice}
          language={language}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((current) => !current)}
        />
        <div className={`siteprev-stage device-${device}`}>
          <div className="siteprev-screen" style={screenStyle}>
            <iframe
              className="siteprev-frame"
              src={withBase(src)}
              title={language === 'ru' ? 'Превью сайта LifeCopy' : 'LifeCopy site preview'}
              loading="lazy"
            />
          </div>
        </div>
      </div>
      {note ? <p className="siteprev-note">{note}</p> : null}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export default CaseSitePreview;
