import { useEffect, useState } from 'react';
import { defaultPalette, electricBluePalette, ghostPalette, paletteFields } from '../data/palette';
import { normalizePalette } from '../utils/palette';

const paletteCopy = {
  ru: {
    eyebrow: 'Dev-палитра',
    title: 'Цветовая палитра сайта',
    hint: 'Меняй только базовые цвета. Остальные состояния и прозрачности сайт собирает сам, чтобы дизайн не разваливался.',
    close: 'Закрыть',
    save: 'Сохранить палитру',
    reset: 'Вернуть по умолчанию',
    ghostPreset: 'Ghost-\u043f\u0440\u0435\u0441\u0435\u0442',
    bluePreset: 'Синий пресет',
  },
  en: {
    eyebrow: 'Dev palette',
    title: 'Site color palette',
    hint: 'Edit only the base colors. The site derives states and transparencies automatically, so the design stays consistent.',
    close: 'Close',
    save: 'Save palette',
    reset: 'Reset to default',
    ghostPreset: 'Ghost preset',
    bluePreset: 'Blue preset',
  },
};

function PaletteModal({ isOpen, language, palette, onSave, onReset, onClose }) {
  const [form, setForm] = useState(defaultPalette);
  const copy = paletteCopy[language] ?? paletteCopy.ru;

  useEffect(() => {
    if (isOpen) {
      setForm(normalizePalette(palette));
    }
  }, [isOpen, palette]);

  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function updateColor(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSave(event) {
    event.preventDefault();
    onSave(normalizePalette(form));
  }

  function handleReset() {
    setForm(defaultPalette);
    onReset();
  }

  function handleGhostPreset() {
    const normalized = normalizePalette(ghostPalette);
    setForm(normalized);
    onSave(normalized);
  }

  function handleBluePreset() {
    const normalized = normalizePalette(electricBluePalette);
    setForm(normalized);
    onSave(normalized);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="palette-modal" role="dialog" aria-modal="true" aria-label={copy.title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar palette-topbar">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{copy.title}</h2>
            <p>{copy.hint}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <form className="palette-body" onSubmit={handleSave}>
          <div className="palette-preview" style={{ '--preview-bg': form.bg, '--preview-surface': form.surface, '--preview-accent': form.accent, '--preview-text': form.text }}>
            <span />
            <strong>{copy.title}</strong>
          </div>

          <div className="palette-grid">
            {paletteFields.map((field) => (
              <label key={field.key} className="palette-field">
                <span>{field[language] || field.ru}</span>
                <input type="color" value={form[field.key]} onChange={(event) => updateColor(field.key, event.target.value)} />
                <code>{form[field.key]}</code>
              </label>
            ))}
          </div>

          <div className="palette-actions">
            <button type="button" className="cta-button secondary" onClick={handleReset}>
              {copy.reset}
            </button>
            <button type="button" className="cta-button secondary palette-preset-button" onClick={handleGhostPreset}>
              {copy.ghostPreset}
            </button>
            <button type="button" className="cta-button secondary palette-preset-button" onClick={handleBluePreset}>
              {copy.bluePreset}
            </button>
            <button type="submit" className="cta-button primary">
              {copy.save}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default PaletteModal;
