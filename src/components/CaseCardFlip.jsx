import FlipCard from './FlipCard';

function CaseCardFlip({ block, language, title }) {
  const cards = Array.isArray(block.cards) ? block.cards : [];
  const caption = language === 'ru' ? (block.ruCaption || '') : (block.enCaption || '');
  const hint = language === 'ru'
    ? (block.ruHint || 'Наведите на визитку — она перевернётся. На телефоне нажмите.')
    : (block.enHint || 'Hover a card to flip it. On mobile, tap it.');
  const flipLabel = language === 'ru' ? 'Перевернуть визитку' : 'Flip card';

  return (
    <figure className="case-cards">
      <div className="case-cards-row">
        {cards.map((card, index) => (
          <FlipCard
            key={`${card.front}-${index}`}
            front={card.front}
            back={card.back}
            alt={(language === 'ru' ? card.ruAlt : card.enAlt) || title}
            label={flipLabel}
          />
        ))}
      </div>
      <p className="case-cards-hint">{hint}</p>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export default CaseCardFlip;
