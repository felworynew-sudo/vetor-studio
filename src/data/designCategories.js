export const designCategoryList = [
  { slug: 'all', ru: 'Все', en: 'All' },
  { slug: 'large-projects', ru: 'Крупные проекты', en: 'Large Projects' },
  { slug: 'websites', ru: 'Сайты', en: 'Websites' },
  { slug: 'logos', ru: 'Логотипы', en: 'Logos' },
  { slug: 'business-cards', ru: 'Визитки', en: 'Business Cards' },
  { slug: 'brand-identity', ru: 'Фирменный стиль', en: 'Brand Identity' },
  { slug: 'youtube', ru: 'YouTube', en: 'YouTube' },
  { slug: 'stickers', ru: 'Стикеры', en: 'Stickers' },
  { slug: 'restoration', ru: 'Реставрация', en: 'Restoration' },
];

export const designCategorySlugs = new Set(designCategoryList.map((category) => category.slug));

export function normalizeDesignCategory(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!slug) {
    return 'all';
  }
  return designCategorySlugs.has(slug) ? slug : 'all';
}
