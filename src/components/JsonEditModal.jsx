import { useEffect, useState } from 'react';

const editorText = {
  ru: {
    close: 'Закрыть',
    save: 'Сохранить',
    title: 'Dev-редактор',
    hint: 'Изменения сохраняются в браузере для dev-версии. Если нужно закрепить их в проекте, перенесите итоговый JSON в соответствующий файл.',
    invalid: 'JSON сейчас невалидный. Проверьте запятые и кавычки.',
  },
  en: {
    close: 'Close',
    save: 'Save',
    title: 'Dev editor',
    hint: 'Changes are saved in the browser for the dev version. To make them permanent, move the final JSON into the matching file.',
    invalid: 'The JSON is invalid. Check commas and quotes.',
  },
};

function JsonEditModal({ target, language, onClose }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const copy = editorText[language] ?? editorText.ru;

  useEffect(() => {
    if (!target) {
      return;
    }

    setValue(JSON.stringify(target.value, null, 2));
    setError('');
  }, [target]);

  useEffect(() => {
    if (!target) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [target, onClose]);

  if (!target) {
    return null;
  }

  function handleSave() {
    try {
      const parsed = JSON.parse(value);
      target.onSave(parsed);
      onClose();
    } catch {
      setError(copy.invalid);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="json-edit-modal" role="dialog" aria-modal="true" aria-label={target.title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar json-edit-topbar">
          <div>
            <p className="eyebrow">{copy.title}</p>
            <h2>{target.title}</h2>
            <p>{copy.hint}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="json-edit-body">
          {error ? <div className="studio-alert error">{error}</div> : null}
          <textarea value={value} onChange={(event) => setValue(event.target.value)} spellCheck="false" />
          <button type="button" className="cta-button primary" onClick={handleSave}>
            {copy.save}
          </button>
        </div>
      </section>
    </div>
  );
}

export default JsonEditModal;
