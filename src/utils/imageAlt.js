// Осмысленный alt-текст для картинок портфолио. Пустой/односложный alt (просто
// название) плохо работает и для доступности, и для Google Images — а именно
// через картинки студию превью/обложек ищут визуально. Поэтому alt описывает,
// ЧТО на изображении и какую задачу решали, с ключевым словом на нужном языке.

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildVideoAlt(item, language) {
  const title = clean(item?.[language === 'ru' ? 'ruTitle' : 'enTitle'] || item?.ruTitle || item?.enTitle);
  const channel = clean(item?.channelName);
  if (language === 'ru') {
    return `Превью для YouTube${title ? ` — ${title}` : ''}${channel ? ` для канала ${channel}` : ''}`;
  }
  return `YouTube thumbnail design${title ? ` — ${title}` : ''}${channel ? ` for the channel ${channel}` : ''}`;
}

export function buildMusicAlt(item, language) {
  const title = clean(item?.[language === 'ru' ? 'ruTitle' : 'enTitle'] || item?.ruTitle || item?.enTitle);
  const artist = clean(item?.artistName);
  if (language === 'ru') {
    return `Обложка трека${title ? ` — ${title}` : ''}${artist ? `, ${artist}` : ''}`;
  }
  return `Music cover art${title ? ` — ${title}` : ''}${artist ? `, ${artist}` : ''}`;
}

// Дизайн-работа из галереи. Предпочитаем осмысленное описание работы, иначе —
// шаблон с названием и (если есть) типом работы/категорией.
export function buildGalleryAlt(item, language, imageIndex = 0) {
  const title = clean(item?.[language === 'ru' ? 'ruTitle' : 'enTitle'] || item?.ruTitle || item?.enTitle);
  const description = clean(item?.[language === 'ru' ? 'ruDescription' : 'enDescription']);
  const base = language === 'ru' ? 'Дизайн-работа' : 'Design work';
  if (description) {
    return imageIndex > 0 && title ? `${title} — ${description}` : description;
  }
  return `${base}${title ? ` — ${title}` : ''}`;
}
