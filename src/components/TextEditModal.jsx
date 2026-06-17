import { useEffect, useState } from 'react';

const modalCopy = {
  ru: {
    eyebrow: 'Редактор плашки',
    hint: 'Меняй текст без JSON: отдельно для русского и английского интерфейса.',
    close: 'Закрыть',
    save: 'Сохранить',
    ru: 'Русская версия',
    en: 'English version',
    label: 'Маленькая подпись',
    title: 'Заголовок',
    text: 'Описание',
    button: 'Текст кнопки',
  },
  en: {
    eyebrow: 'Banner editor',
    hint: 'Edit the copy without touching JSON: Russian and English are separate.',
    close: 'Close',
    save: 'Save',
    ru: 'Russian version',
    en: 'English version',
    label: 'Small label',
    title: 'Title',
    text: 'Description',
    button: 'Button text',
  },
};

const emptyCopy = {
  ru: { eyebrow: '', title: '', text: '', button: '' },
  en: { eyebrow: '', title: '', text: '', button: '' },
};

function TextEditModal({ target, language, onClose }) {
  const [form, setForm] = useState(emptyCopy);
  const copy = modalCopy[language] ?? modalCopy.ru;

  useEffect(() => {
    if (!target) {
      return;
    }

    setForm({
      ru: { ...emptyCopy.ru, ...(target.value?.ru || {}) },
      en: { ...emptyCopy.en, ...(target.value?.en || {}) },
    });
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

  const fields = target.fields || ['eyebrow', 'title', 'text'];

  function updateField(locale, field, value) {
    setForm((current) => ({
      ...current,
      [locale]: {
        ...current[locale],
        [field]: value,
      },
    }));
  }

  function handleSave(event) {
    event.preventDefault();
    target.onSave(form);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="text-edit-modal" role="dialog" aria-modal="true" aria-label={target.title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar text-edit-topbar">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{target.title}</h2>
            <p>{copy.hint}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <form className="text-edit-body" onSubmit={handleSave}>
          {['ru', 'en'].map((locale) => (
            <fieldset key={locale} className="text-edit-language">
              <legend>{copy[locale]}</legend>
              {fields.includes('eyebrow') ? (
                <label className="studio-field">
                  <span>{copy.label}</span>
                  <input value={form[locale].eyebrow} onChange={(event) => updateField(locale, 'eyebrow', event.target.value)} />
                </label>
              ) : null}
              {fields.includes('title') ? (
                <label className="studio-field">
                  <span>{copy.title}</span>
                  <input value={form[locale].title} onChange={(event) => updateField(locale, 'title', event.target.value)} />
                </label>
              ) : null}
              {fields.includes('text') ? (
                <label className="studio-field">
                  <span>{copy.text}</span>
                  <textarea value={form[locale].text} onChange={(event) => updateField(locale, 'text', event.target.value)} />
                </label>
              ) : null}
              {fields.includes('button') ? (
                <label className="studio-field">
                  <span>{copy.button}</span>
                  <input value={form[locale].button} onChange={(event) => updateField(locale, 'button', event.target.value)} />
                </label>
              ) : null}
            </fieldset>
          ))}

          <button type="submit" className="cta-button primary">
            {copy.save}
          </button>
        </form>
      </section>
    </div>
  );
}

export default TextEditModal;
