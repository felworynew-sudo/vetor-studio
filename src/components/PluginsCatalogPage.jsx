import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';

const PLACEHOLDER = '/plugins/placeholder.svg';

// Каталог плагинов Vetor. Пока один Resto — добавляй новые записи сюда,
// каждая ведёт на свою страницу /plugins/<slug>.
const PLUGINS = [
  {
    slug: 'resto',
    ruTitle: 'Resto',
    enTitle: 'Resto',
    ruSubtitle: 'Реставрация старых фото и макеты для памятников',
    enSubtitle: 'Old-photo restoration and monument layouts',
    ruBadge: 'Плагин для Photoshop',
    enBadge: 'Photoshop plugin',
    image: '/plugins/resto-before-after.jpg',
    accentColor: '#5aa8ff',
  },
];

const catalogText = {
  ru: {
    eyebrow: 'Плагины',
    title: 'Плагины Vetor',
    lead: 'Инструменты, которые ускоряют рутину в графических редакторах. Выбери плагин — внутри описание, возможности и подписка.',
  },
  en: {
    eyebrow: 'Plugins',
    title: 'Vetor plugins',
    lead: 'Tools that speed up routine work in graphics editors. Pick a plugin — details, features, and subscription inside.',
  },
};

function PluginsCatalogPage({ language, onOpenPlugin, getPluginHref }) {
  const t = catalogText[language] ?? catalogText.ru;
  const titleKey = language === 'ru' ? 'ruTitle' : 'enTitle';
  const subtitleKey = language === 'ru' ? 'ruSubtitle' : 'enSubtitle';
  const badgeKey = language === 'ru' ? 'ruBadge' : 'enBadge';

  return (
    <section className="section-page price-cats-page plugins-catalog-page">
      <div className="section-page-head surface-panel">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
      </div>

      <div className="price-cats-grid">
        {PLUGINS.map((plugin) => {
          const style = plugin.accentColor ? { '--price-cat-accent': plugin.accentColor } : undefined;
          const title = plugin[titleKey] || plugin.ruTitle;
          const subtitle = plugin[subtitleKey] || plugin.ruSubtitle || '';
          const badge = plugin[badgeKey] || plugin.ruBadge || '';
          return (
            <a
              key={plugin.slug}
              className="price-cat-card"
              href={getPluginHref ? getPluginHref(plugin.slug) : `/plugins/${plugin.slug}`}
              style={style}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
                  return;
                }
                event.preventDefault();
                onOpenPlugin?.(plugin.slug);
              }}
            >
              <div className="price-cat-media">
                <ImageWithFallback src={withBase(plugin.image || PLACEHOLDER)} fallback={withBase(PLACEHOLDER)} alt={title} />
              </div>
              <div className="price-cat-body">
                <div className="price-cat-copy">
                  {badge ? <span className="plugin-card-badge">{badge}</span> : null}
                  <h2>{title}</h2>
                  {subtitle ? <p>{subtitle}</p> : null}
                </div>
                <span className="price-cat-go" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export default PluginsCatalogPage;
