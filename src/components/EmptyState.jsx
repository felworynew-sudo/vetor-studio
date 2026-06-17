import { getLocalizedText } from '../utils/i18n';

function EmptyState({ language, onReset }) {
  return (
    <section className="empty-state surface-panel">
      <div className="empty-illustration" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>{getLocalizedText(language, 'noResultsTitle')}</h2>
      <p>{getLocalizedText(language, 'noResultsText')}</p>
      <button type="button" className="cta-button secondary" onClick={onReset}>
        {getLocalizedText(language, 'clearFilters')}
      </button>
    </section>
  );
}

export default EmptyState;
