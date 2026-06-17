function PluginsPage({ language }) {
  const copy = language === 'ru'
    ? {
        eyebrow: 'Плагины',
        title: 'Инструменты и расширения',
        text: 'Здесь будут собраны плагины, пресеты и дополнительные материалы студии. Раздел уже готов для наполнения.',
      }
    : {
        eyebrow: 'Plugins',
        title: 'Tools and extensions',
        text: 'This section will host plugins, presets, and extra studio resources. The layout is ready for content.',
      };

  return (
    <section className="section-page">
      <div className="section-page-head surface-panel">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.text}</p>
      </div>
    </section>
  );
}

export default PluginsPage;
