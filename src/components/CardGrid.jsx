import VideoCard from './VideoCard';
import MusicCard from './MusicCard';

function CardGrid({ items, language, tagsMap, onOpenItem, className = '' }) {
  return (
    <section className={`card-grid ${className}`.trim()} aria-live="polite">
      {items.map((item, index) =>
        item.type === 'video' ? (
          <VideoCard
            key={item.id}
            item={item}
            language={language}
            tagsMap={tagsMap}
            index={index}
            onOpen={() => onOpenItem(item)}
          />
        ) : (
          <MusicCard
            key={item.id}
            item={item}
            language={language}
            tagsMap={tagsMap}
            index={index}
            onOpen={() => onOpenItem(item)}
          />
        ),
      )}
    </section>
  );
}

export default CardGrid;
