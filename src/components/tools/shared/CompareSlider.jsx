import { useRef, useState } from 'react';

// Сравнение «до/после» со шторкой. Оба изображения растягиваются на одну площадь
// (after задаёт пропорции). Режим 100%: картинки в натуральную величину результата
// внутри прокручиваемого окна — чтобы разглядеть детали апскейла/сжатия.

const TEXT = {
  ru: { fit: 'Целиком', full: '100%', before: 'До', after: 'После' },
  en: { fit: 'Fit', full: '100%', before: 'Before', after: 'After' },
};

function CompareSlider({ before, after, language = 'ru', beforeLabel, afterLabel, pixelated = false }) {
  const t = TEXT[language] || TEXT.ru;
  const boxRef = useRef(null);
  const [pos, setPos] = useState(50);
  const [zoom, setZoom] = useState('fit');
  const [natural, setNatural] = useState(null);

  function move(clientX) {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }
  function start(e) {
    e.preventDefault();
    move(e.clientX);
    const mv = (ev) => move(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  const full = zoom === 'full' && natural;
  const imgStyle = full ? { width: natural.w, height: natural.h, maxWidth: 'none' } : undefined;
  const cls = pixelated ? 'cmp-img is-pixelated' : 'cmp-img';

  return (
    <div className="cmp">
      <div className="cmp-bar">
        <div className="segmented">
          <button type="button" className={zoom === 'fit' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setZoom('fit')}>{t.fit}</button>
          <button type="button" className={zoom === 'full' ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setZoom('full')}>{t.full}</button>
        </div>
        <span className="cmp-labels"><b>{beforeLabel || t.before}</b> ⟷ <b>{afterLabel || t.after}</b></span>
      </div>
      <div className={full ? 'cmp-scroll is-full' : 'cmp-scroll'}>
        <div className="cmp-box" ref={boxRef} onPointerDown={start} style={full ? { width: natural.w } : undefined}>
          <img src={after} alt="" className={cls} style={imgStyle} draggable="false" onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
          <img src={before} alt="" className={`${cls} cmp-before`} style={{ ...imgStyle, clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable="false" />
          <span className="cmp-handle" style={{ left: `${pos}%` }} />
        </div>
      </div>
    </div>
  );
}

export default CompareSlider;
