import { formatChoices, recompressNote } from '../../../utils/audioFormat';

// Выбор формата экспорта для аудио-инструментов: «Как исходный (MP3)» по умолчанию, дальше
// остальные форматы. Если исходник сжатый и экспорт тоже сжатый — подсказка про повторное кодирование.
export default function FormatPicker({
  probe, value, onChange, language = 'ru', label, extra = null,
}) {
  const en = language === 'en';
  const choices = formatChoices(probe, language);
  const note = recompressNote(probe, value, language);
  return (
    <div className="fmt-picker">
      <div className="tool-field">
        <span className="tool-field-label">{label || (en ? 'Format' : 'Формат')}</span>
        <div className="segmented dm-seg">
          {choices.map((c) => (
            <button key={c.id} type="button" className={value === c.id ? 'segmented-btn is-active' : 'segmented-btn'} onClick={() => onChange(c.id)}>{c.label}</button>
          ))}
          {extra}
        </div>
      </div>
      {note && <p className="fmt-note">{note}</p>}
    </div>
  );
}
