const tabLabels = {
  ru: {
    home: 'Главная',
    blog: 'Блог',
    gallery: 'Дизайн',
    price: 'Прайс',
    plugins: 'Плагины',
  },
  en: {
    home: 'Home',
    blog: 'Blog',
    gallery: 'Design',
    price: 'Price',
    plugins: 'Plugins',
  },
};

const tabs = ['home', 'blog', 'gallery', 'price', 'plugins'];

function NavigationTabsLinked({ language, activeSection, onChange, visibleTabs = tabs, getHref }) {
  const labels = tabLabels[language] ?? tabLabels.ru;
  const renderedTabs = tabs.filter((tab) => visibleTabs.includes(tab));
  const ariaLabel = language === 'ru' ? 'Разделы сайта' : 'Site sections';

  function handleClick(event, tab) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onChange(tab);
  }

  return (
    <nav className="section-tabs-wrap" aria-label={ariaLabel}>
      <div className="section-tabs">
        {renderedTabs.map((tab) => (
          <a
            key={tab}
            href={getHref ? getHref(tab) : '#'}
            data-section={tab}
            className={activeSection === tab ? 'section-tab is-active' : 'section-tab'}
            onClick={(event) => handleClick(event, tab)}
          >
            {labels[tab] ?? tab}
          </a>
        ))}
      </div>
    </nav>
  );
}

export default NavigationTabsLinked;
