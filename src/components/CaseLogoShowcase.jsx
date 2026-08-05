import { withBase } from '../utils/format';

const t = {
  ru: { old: 'Было', neo: 'Стало', favicons: 'Фавиконки', palette: 'Палитра', horizontal: 'Горизонтальная версия' },
  en: { old: 'Before', neo: 'After', favicons: 'Favicons', palette: 'Palette', horizontal: 'Horizontal lockup' },
};

function CaseLogoShowcase({ block, language }) {
  const copy = t[language] ?? t.ru;
  const hero = block.heroSrc || block.newSrc;
  const old = block.oldSrc;
  const horizontal = block.horizontalSrc;
  const favicons = block.faviconsSrc;
  const palette = block.paletteSrc;
  const caption = language === 'ru' ? (block.ruCaption || '') : (block.enCaption || '');

  return (
    <figure className="case-logo">
      <div className="case-logo-stage">
        {hero ? <img className="case-logo-hero" src={withBase(hero)} alt="LifeCopy logo" draggable="false" /> : null}
      </div>

      {old ? (
        <div className="case-logo-oldnew">
          <div className="case-logo-variant is-old">
            <span className="case-logo-tag">{copy.old}</span>
            <img src={withBase(old)} alt={copy.old} draggable="false" />
          </div>
          <div className="case-logo-variant is-new">
            <span className="case-logo-tag is-accent">{copy.neo}</span>
            <img src={withBase(hero)} alt={copy.neo} draggable="false" />
          </div>
        </div>
      ) : null}

      {horizontal ? (
        <div className="case-logo-sub">
          <span className="case-logo-sub-label">{copy.horizontal}</span>
          <img src={withBase(horizontal)} alt={copy.horizontal} draggable="false" />
        </div>
      ) : null}

      {favicons ? (
        <div className="case-logo-sub">
          <span className="case-logo-sub-label">{copy.favicons}</span>
          <img src={withBase(favicons)} alt={copy.favicons} draggable="false" />
        </div>
      ) : null}

      {palette ? (
        <div className="case-logo-sub">
          <span className="case-logo-sub-label">{copy.palette}</span>
          <img src={withBase(palette)} alt={copy.palette} draggable="false" />
        </div>
      ) : null}

      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export default CaseLogoShowcase;
