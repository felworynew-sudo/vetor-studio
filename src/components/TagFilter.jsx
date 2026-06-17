import { getLocalizedText } from '../utils/i18n';

function TagFilter({
  language,
  tags,
  selectedTags,
  onToggleTag,
  onReset,
  getTagHref,
  getResetHref,
}) {
  function handleReset(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onReset();
  }

  function handleToggle(event, tagSlug) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onToggleTag(tagSlug);
  }

  return (
    <section className="tag-filter-section">
      <div className="tag-row" role="list" aria-label="Tag filters">
        <a
          href={getResetHref ? getResetHref() : '#'}
          className={selectedTags.length === 0 ? 'tag-pill is-active' : 'tag-pill'}
          onClick={handleReset}
        >
          {getLocalizedText(language, 'all')}
        </a>

        {tags.map((tag) => {
          const isActive = selectedTags.includes(tag.slug);
          return (
            <a
              key={tag.slug}
              href={getTagHref ? getTagHref(tag.slug) : '#'}
              className={isActive ? 'tag-pill is-active' : 'tag-pill'}
              onClick={(event) => handleToggle(event, tag.slug)}
            >
              {tag[language]}
            </a>
          );
        })}
      </div>
    </section>
  );
}

export default TagFilter;
