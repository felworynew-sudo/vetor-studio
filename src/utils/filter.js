import { isPsdDownloadItem } from './links';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export function sortWorks(items) {
  return [...items].sort((a, b) => {
    if (a.featured !== b.featured) {
      return Number(b.featured) - Number(a.featured);
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function filterWorks(items, query, selectedTags, tagsMap) {
  const normalizedQuery = normalize(query);

  return items.filter((item) => {
    const itemTags = isPsdDownloadItem(item) && !item.tags.includes('psd') ? [...item.tags, 'psd'] : item.tags;
    const matchesTags = selectedTags.length === 0 || selectedTags.every((tag) => itemTags.includes(tag));

    if (!matchesTags) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const localizedTagNames = itemTags
      .map((slug) => tagsMap.get(slug))
      .filter(Boolean)
      .flatMap((tag) => [tag.ru, tag.en]);

    const haystack = [
      item.ruTitle,
      item.enTitle,
      item.channelName,
      item.artistName,
      ...(item.description ? [item.description] : []),
      ...itemTags,
      ...localizedTagNames,
    ]
      .filter(Boolean)
      .map(normalize)
      .join(' ');

    return haystack.includes(normalizedQuery);
  });
}
