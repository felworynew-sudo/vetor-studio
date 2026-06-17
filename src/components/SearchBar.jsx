import { getLocalizedText } from '../utils/i18n';

function SearchBar({ language, value, onChange, placeholderKey = 'searchPlaceholder' }) {
  return (
    <label className="search-shell" aria-label={getLocalizedText(language, 'searchLabel')}>
      <svg viewBox="0 0 24 24" className="search-icon" aria-hidden="true" fill="none">
        <circle cx="10.8" cy="10.8" r="6.4" stroke="currentColor" strokeWidth="2" />
        <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={getLocalizedText(language, placeholderKey)}
      />
    </label>
  );
}

export default SearchBar;
