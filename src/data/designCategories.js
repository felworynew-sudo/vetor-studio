export const designCategoryList = [
  { slug: 'all', ru: 'Все', en: 'All' },
  { slug: 'logos', ru: 'Логотипы', en: 'Logos' },
  { slug: 'business-cards', ru: 'Визитки', en: 'Business Cards' },
  { slug: 'brand-identity', ru: 'Фирменный стиль', en: 'Brand Identity' },
  { slug: 'youtube', ru: 'YouTube', en: 'YouTube' },
  { slug: 'stickers', ru: 'Стикеры', en: 'Stickers' },
];

export const designCategorySlugs = new Set(designCategoryList.map((category) => category.slug));

export function normalizeDesignCategory(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!slug) {
    return 'all';
  }
  return designCategorySlugs.has(slug) ? slug : 'all';
}
