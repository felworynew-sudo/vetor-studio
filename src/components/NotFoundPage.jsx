function NotFoundPage({ language, onGoHome }) {
  const copy = language === 'ru'
    ? {
        title: 'Раздел не найден',
        text: 'Эта страница пока недоступна или скрыта в текущей версии сайта.',
        button: 'Вернуться на главную',
        imageAlt: 'Заглушка 404',
      }
    : {
        title: 'Page not found',
        text: 'This page is currently unavailable or hidden in this version of the site.',
        button: 'Back to home',
        imageAlt: '404 placeholder',
      };

  return (
    <section className="not-found surface-panel" role="status" aria-live="polite">
      <div className="not-found-copy">
        <h1>{copy.title}</h1>
        <p>{copy.text}</p>
        <button type="button" className="cta-button secondary" onClick={onGoHome}>
          {copy.button}
        </button>
      </div>
      <div className="not-found-visual" aria-hidden="true">
        <div className="not-found-image-placeholder" role="img" aria-label={copy.imageAlt}>
          404
        </div>
      </div>
    </section>
  );
}

export default NotFoundPage;
