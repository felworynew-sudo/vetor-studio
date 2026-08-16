import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';

const PLACEHOLDER = '/plugins/placeholder.svg';

// Каталог софта Vetor. Внутренние записи (без externalUrl) ведут на свою
// страницу /plugins/<slug>; записи с externalUrl открывают внешнюю ссылку
// (напр. GitHub) в новой вкладке.
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
  {
    slug: 'krypto',
    ruTitle: 'Krypto',
    enTitle: 'Krypto',
    ruSubtitle: 'Софт для криптографии: шифрование и расшифровка файлов и текста',
    enSubtitle: 'Cryptography software: encrypt and decrypt files and text',
    ruBadge: 'Криптография',
    enBadge: 'Cryptography',
    image: PLACEHOLDER,
    accentColor: '#8b7cf6',
    externalUrl: 'https://github.com/felworynew-sudo/krypto/releases/download/v1.0/Krypto.exe',
    isDownload: true,
    ruLinkLabel: 'Скачать',
    enLinkLabel: 'Download',
  },
  {
    slug: 'org-finder',
    ruTitle: 'Org-Finder',
    enTitle: 'Org-Finder',
    ruSubtitle: 'Поиск организаций и контактов по Яндекс.Картам и 2ГИС — по категории и городу, для лидов',
    enSubtitle: 'Finds organizations and contacts across Yandex Maps and 2GIS by category and city — for leads',
    ruBadge: 'Поиск лидов',
    enBadge: 'Lead finder',
    image: PLACEHOLDER,
    accentColor: '#3ec98a',
    externalUrl: 'https://github.com/felworynew-sudo/org-finder',
  },
];

const catalogText = {
  ru: {
    eyebrow: 'Софт',
    title: 'Софт Vetor',
    lead: 'Плагины для графических редакторов и отдельные программы: реставрация фото, криптография, поиск лидов.',
    github: 'GitHub',
  },
  en: {
    eyebrow: 'Software',
    title: 'Vetor software',
    lead: 'Plugins for graphics editors and standalone apps: photo restoration, cryptography, lead finding.',
    github: 'GitHub',
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
          const isExternal = Boolean(plugin.externalUrl);
          const linkLabel = plugin[language === 'ru' ? 'ruLinkLabel' : 'enLinkLabel'] || t.github;

          const externalProps = isExternal
            ? { href: plugin.externalUrl, target: '_blank', rel: 'noopener noreferrer' }
            : {
                href: getPluginHref ? getPluginHref(plugin.slug) : `/plugins/${plugin.slug}`,
                onClick: (event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
                    return;
                  }
                  event.preventDefault();
                  onOpenPlugin?.(plugin.slug);
                },
              };

          return (
            <a key={plugin.slug} className="price-cat-card" style={style} {...externalProps}>
              <div className="price-cat-media">
                <ImageWithFallback src={withBase(plugin.image || PLACEHOLDER)} fallback={withBase(PLACEHOLDER)} alt={title} />
              </div>
              <div className="price-cat-body">
                <div className="price-cat-copy">
                  {badge ? <span className="plugin-card-badge">{badge}</span> : null}
                  <h2>{title}</h2>
                  {subtitle ? <p>{subtitle}</p> : null}
                </div>
                {isExternal ? (
                  <span className="price-cat-go plugin-card-github" aria-hidden="true">
                    {plugin.isDownload ? (
                      <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.4-1.27.74-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.28 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
                      </svg>
                    )}
                    {linkLabel}
                  </span>
                ) : (
                  <span className="price-cat-go" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export default PluginsCatalogPage;
