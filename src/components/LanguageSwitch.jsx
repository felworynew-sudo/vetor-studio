function LanguageSwitch({ language, onChange }) {
  return (
    <div className="language-switch" role="group" aria-label="Language switch">
      {['ru', 'en'].map((value) => (
        <button
          key={value}
          type="button"
          className={value === language ? 'language-button is-active' : 'language-button'}
          onClick={() => onChange(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default LanguageSwitch;
