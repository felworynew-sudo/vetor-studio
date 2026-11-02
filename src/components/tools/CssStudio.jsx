import { useMemo, useState } from 'react';
import CodeExport from './shared/CodeExport';
import { PATTERN_TYPES, blobPath, blobSvg, patternSvg, svgUri } from '../../utils/cssShapes';

// CSS-студия: фон (цвет, градиент или бесшовный узор), органический блоб, карточка
// со стеклом (backdrop-filter) и многослойной тенью — всё в одном живом превью,
// как это будет выглядеть на сайте. Вкладки только переключают настройки.
// Экспорт: CSS и Tailwind для .scene и .card, SVG узора и блоба. Локально.
// Старые адреса box-shadow / glassmorphism / pattern-gen / blob открывают нужную вкладку.

const TEXT = {
  ru: {
    tabs: { bg: 'Фон', blob: 'Блоб', card: 'Стекло и карточка', shadow: 'Тень' },
    bgMode: 'Фон сцены', solid: 'Цвет', gradient: 'Градиент', pattern: 'Узор', angle: 'Угол', c1: 'Цвет 1', c2: 'Цвет 2',
    patType: 'Узор', patFg: 'Цвет узора', patBg: 'Фон узора', scale: 'Масштаб', weight: 'Толщина',
    blobOn: 'Показать блоб', points: 'Точек', irregular: 'Неровность', reroll: 'Другая форма', fill: 'Заливка', size: 'Размер', posX: 'Сдвиг X', posY: 'Сдвиг Y',
    glass: 'Матовое стекло', blur: 'Размытие', sat: 'Насыщенность', alpha: 'Непрозрачность', tint: 'Цвет карточки', border: 'Светлая граница', radius: 'Скругление', textColor: 'Цвет текста',
    addLayer: 'Добавить слой тени', x: 'X', y: 'Y', sBlur: 'Размытие', spread: 'Разброс', sAlpha: 'Прозрачность', inset: 'Внутрь', color: 'Цвет',
    sceneCode: 'Код фона (.scene)', cardCode: 'Код карточки (.card)', saveBlob: 'Скачать блоб SVG', savePattern: 'Скачать узор SVG',
    cardTitle: 'Карточка', cardText: 'Так блок будет выглядеть на сайте.',
    note: 'Стекло видно только поверх пёстрого фона — поэтому всё собрано в одной сцене.',
  },
  en: {
    tabs: { bg: 'Background', blob: 'Blob', card: 'Glass & card', shadow: 'Shadow' },
    bgMode: 'Scene background', solid: 'Color', gradient: 'Gradient', pattern: 'Pattern', angle: 'Angle', c1: 'Color 1', c2: 'Color 2',
    patType: 'Pattern', patFg: 'Pattern color', patBg: 'Pattern background', scale: 'Scale', weight: 'Thickness',
    blobOn: 'Show blob', points: 'Points', irregular: 'Irregularity', reroll: 'Reroll', fill: 'Fill', size: 'Size', posX: 'Offset X', posY: 'Offset Y',
    glass: 'Frosted glass', blur: 'Blur', sat: 'Saturation', alpha: 'Opacity', tint: 'Card color', border: 'Light border', radius: 'Radius', textColor: 'Text color',
    addLayer: 'Add shadow layer', x: 'X', y: 'Y', sBlur: 'Blur', spread: 'Spread', sAlpha: 'Opacity', inset: 'Inset', color: 'Color',
    sceneCode: 'Background code (.scene)', cardCode: 'Card code (.card)', saveBlob: 'Download blob SVG', savePattern: 'Download pattern SVG',
    cardTitle: 'Card', cardText: 'This is how the block will look on a site.',
    note: 'Glass is only visible over a busy background — that is why everything lives in one scene.',
  },
};

const BLOB_SIZE = 400;
let uid = 0;
const newLayer = (p = {}) => ({ id: (uid += 1), x: 0, y: 10, blur: 25, spread: -5, color: '#000000', alpha: 35, inset: false, ...p });

const rgba = (hex, a) => {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${Number(a).toFixed(2)})`;
};

function save(text, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const Seg = ({ value, options, onChange }) => (
  <div className="segmented">
    {options.map(([k, l]) => <button key={k} type="button" className={value === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => onChange(k)}>{l}</button>)}
  </div>
);
const Range = ({ label, value, min, max, step = 1, onChange }) => (
  <label className="tool-field"><span className="tool-field-label">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>
);
const Color = ({ label, value, onChange }) => (
  <label className="t3-color"><span className="tool-field-label">{label}</span><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /></label>
);

export default function CssStudio({ language = 'ru', initialTab = 'card' }) {
  const t = TEXT[language] || TEXT.ru;
  const [tab, setTab] = useState(initialTab);
  // фон
  const [bgMode, setBgMode] = useState(initialTab === 'bg' ? 'pattern' : 'gradient');
  const [angle, setAngle] = useState(135);
  const [c1, setC1] = useState('#6166ff');
  const [c2, setC2] = useState('#ff5c63');
  const [solid, setSolid] = useState('#0d0d11');
  const [pat, setPat] = useState({ type: 'dots', fg: '#6166ff', bg: '#0d0d11', scale: 28, weight: 3 });
  // блоб
  const [blob, setBlob] = useState({ on: true, points: 6, contrast: 0.3, seed: 12345, mode: 'gradient', c1: '#ffb703', c2: '#f72585', size: 70, x: -22, y: -18 });
  // карточка
  const [card, setCard] = useState({ glass: true, blur: 14, sat: 160, alpha: 18, tint: '#ffffff', border: 30, radius: 18, text: '#ffffff' });
  // тень
  const [layers, setLayers] = useState(() => [newLayer({ y: 20, blur: 40, spread: -10, alpha: 35 }), newLayer({ y: 2, blur: 6, spread: 0, alpha: 18 })]);

  const setB = (p) => setBlob((b) => ({ ...b, ...p }));
  const setC = (p) => setCard((c) => ({ ...c, ...p }));
  const setP = (p) => setPat((x) => ({ ...x, ...p }));
  const setL = (id, p) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const patSvg = useMemo(() => patternSvg(pat.type, pat.scale, pat.fg, pat.bg, pat.weight), [pat]);
  const blobD = useMemo(() => blobPath(blob.points, blob.contrast, blob.seed, BLOB_SIZE), [blob.points, blob.contrast, blob.seed]);
  const blobFile = blobSvg(blobD, BLOB_SIZE, blob.mode, blob.c1, blob.c2);

  const sceneDecls = bgMode === 'solid' ? [['background', solid]]
    : bgMode === 'gradient' ? [['background', `linear-gradient(${angle}deg, ${c1}, ${c2})`]]
      : [['background-color', pat.bg], ['background-image', svgUri(patSvg)]];
  const shadow = layers.map((l) => `${l.inset ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${rgba(l.color, l.alpha / 100)}`).join(', ');
  const cardDecls = [
    ['background', rgba(card.tint, card.glass ? card.alpha / 100 : 1)],
    ...(card.glass ? [['backdrop-filter', `blur(${card.blur}px) saturate(${card.sat}%)`], ['-webkit-backdrop-filter', `blur(${card.blur}px) saturate(${card.sat}%)`]] : []),
    ['border', `1px solid ${rgba('#ffffff', card.border / 100)}`],
    ['border-radius', `${card.radius}px`],
    ...(layers.length ? [['box-shadow', shadow]] : []),
    ['color', card.text],
  ];
  const style = (decls) => Object.fromEntries(decls.map(([k, v]) => [k.replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));

  return (
    <div className="tool-panel css-studio">
      <div className="cs-scene" style={style(sceneDecls)}>
        {blob.on && (
          <div className="cs-blob" style={{ width: `${blob.size}%`, transform: `translate(${blob.x}%, ${blob.y}%)` }} dangerouslySetInnerHTML={{ __html: blobFile.replace('id="g"', 'id="cs-blob-g"').replace('url(#g)', 'url(#cs-blob-g)') }} />
        )}
        <div className="cs-card" style={style(cardDecls)}>
          <strong>{t.cardTitle}</strong>
          <span>{t.cardText}</span>
        </div>
      </div>

      <div className="segmented cs-tabs">
        {Object.entries(t.tabs).map(([k, l]) => <button key={k} type="button" className={tab === k ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      <div className="cs-panel">
        {tab === 'bg' && (
          <>
            <div className="tool-field"><span className="tool-field-label">{t.bgMode}</span><Seg value={bgMode} onChange={setBgMode} options={[['solid', t.solid], ['gradient', t.gradient], ['pattern', t.pattern]]} /></div>
            {bgMode === 'solid' && <div className="t3-row"><Color label={t.color} value={solid} onChange={setSolid} /></div>}
            {bgMode === 'gradient' && (
              <div className="tool-controls">
                <div className="t3-row"><Color label={t.c1} value={c1} onChange={setC1} /><Color label={t.c2} value={c2} onChange={setC2} /></div>
                <Range label={`${t.angle}: ${angle}°`} value={angle} min={0} max={360} onChange={setAngle} />
              </div>
            )}
            {bgMode === 'pattern' && (
              <>
                <div className="gm-sets">
                  {Object.entries(PATTERN_TYPES).map(([k, v]) => <button key={k} type="button" className={pat.type === k ? 'crop-ratio is-active' : 'crop-ratio'} onClick={() => setP({ type: k })}>{v[language] || v.ru}</button>)}
                </div>
                <div className="tool-controls">
                  <div className="t3-row"><Color label={t.patFg} value={pat.fg} onChange={(v) => setP({ fg: v })} /><Color label={t.patBg} value={pat.bg} onChange={(v) => setP({ bg: v })} /></div>
                  <Range label={`${t.scale}: ${pat.scale}px`} value={pat.scale} min={10} max={80} onChange={(v) => setP({ scale: v })} />
                  <Range label={`${t.weight}: ${pat.weight}px`} value={pat.weight} min={1} max={12} onChange={(v) => setP({ weight: v })} />
                </div>
                <button type="button" className="tool-btn small" onClick={() => save(patSvg, `pattern-${pat.type}.svg`)}>{t.savePattern}</button>
              </>
            )}
          </>
        )}

        {tab === 'blob' && (
          <>
            <label className="wm-check"><input type="checkbox" checked={blob.on} onChange={(e) => setB({ on: e.target.checked })} />{t.blobOn}</label>
            <div className="tool-controls">
              <Range label={`${t.points}: ${blob.points}`} value={blob.points} min={3} max={12} onChange={(v) => setB({ points: v })} />
              <Range label={`${t.irregular}: ${Math.round(blob.contrast * 100)}%`} value={Math.round(blob.contrast * 100)} min={5} max={70} onChange={(v) => setB({ contrast: v / 100 })} />
              <Range label={`${t.size}: ${blob.size}%`} value={blob.size} min={20} max={120} onChange={(v) => setB({ size: v })} />
              <Range label={`${t.posX}: ${blob.x}%`} value={blob.x} min={-60} max={60} onChange={(v) => setB({ x: v })} />
              <Range label={`${t.posY}: ${blob.y}%`} value={blob.y} min={-60} max={60} onChange={(v) => setB({ y: v })} />
            </div>
            <div className="tool-controls">
              <div className="tool-field"><span className="tool-field-label">{t.fill}</span><Seg value={blob.mode} onChange={(v) => setB({ mode: v })} options={[['solid', t.solid], ['gradient', t.gradient]]} /></div>
              <div className="t3-row"><Color label={t.c1} value={blob.c1} onChange={(v) => setB({ c1: v })} />{blob.mode === 'gradient' && <Color label={t.c2} value={blob.c2} onChange={(v) => setB({ c2: v })} />}</div>
            </div>
            <div className="tool-actions">
              <button type="button" className="tool-btn small" onClick={() => setB({ seed: Math.floor(Math.random() * 1e9) })}>🎲 {t.reroll}</button>
              <button type="button" className="tool-btn small" onClick={() => save(blobFile, 'blob.svg')}>{t.saveBlob}</button>
            </div>
          </>
        )}

        {tab === 'card' && (
          <>
            <label className="wm-check"><input type="checkbox" checked={card.glass} onChange={(e) => setC({ glass: e.target.checked })} />{t.glass}</label>
            <div className="tool-controls">
              {card.glass && <Range label={`${t.blur}: ${card.blur}px`} value={card.blur} min={0} max={40} onChange={(v) => setC({ blur: v })} />}
              {card.glass && <Range label={`${t.sat}: ${card.sat}%`} value={card.sat} min={100} max={250} onChange={(v) => setC({ sat: v })} />}
              {card.glass && <Range label={`${t.alpha}: ${card.alpha}%`} value={card.alpha} min={0} max={80} onChange={(v) => setC({ alpha: v })} />}
              <Range label={`${t.border}: ${card.border}%`} value={card.border} min={0} max={80} onChange={(v) => setC({ border: v })} />
              <Range label={`${t.radius}: ${card.radius}px`} value={card.radius} min={0} max={48} onChange={(v) => setC({ radius: v })} />
              <div className="t3-row"><Color label={t.tint} value={card.tint} onChange={(v) => setC({ tint: v })} /><Color label={t.textColor} value={card.text} onChange={(v) => setC({ text: v })} /></div>
            </div>
          </>
        )}

        {tab === 'shadow' && (
          <>
            {layers.map((l, i) => (
              <div key={l.id} className="bs-layer">
                <div className="bs-layer-head">
                  <span>#{i + 1}</span>
                  <label className="rec-opt"><input type="checkbox" checked={l.inset} onChange={(e) => setL(l.id, { inset: e.target.checked })} /> {t.inset}</label>
                  <input type="color" value={l.color} aria-label={t.color} onChange={(e) => setL(l.id, { color: e.target.value })} />
                  <button type="button" className="tool-btn small ghost" onClick={() => setLayers((ls) => ls.filter((x) => x.id !== l.id))}>✕</button>
                </div>
                <div className="bs-sliders">
                  {[['x', t.x, -60, 60], ['y', t.y, -60, 60], ['blur', t.sBlur, 0, 120], ['spread', t.spread, -60, 60], ['alpha', t.sAlpha, 0, 100]].map(([k, lab, mn, mx]) => (
                    <label key={k} className="bs-mini"><span>{lab} {l[k]}</span><input type="range" min={mn} max={mx} value={l[k]} onChange={(e) => setL(l.id, { [k]: Number(e.target.value) })} /></label>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="tool-btn small" onClick={() => setLayers((ls) => [...ls, newLayer()])}>+ {t.addLayer}</button>
          </>
        )}
      </div>

      <span className="tool-field-label">{t.sceneCode}</span>
      <CodeExport language={language} decls={sceneDecls} selector=".scene" />
      <span className="tool-field-label">{t.cardCode}</span>
      <CodeExport language={language} decls={cardDecls} selector=".card" />

      <p className="tool-local-note">🔒 {t.note}</p>
    </div>
  );
}
