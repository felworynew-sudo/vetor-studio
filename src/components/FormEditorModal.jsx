import { useRef, useState } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  let cursor = next;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    cursor[key] = cursor[key] && typeof cursor[key] === 'object' ? { ...cursor[key] } : {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return next;
}

function Field({ field, value, onChange }) {
  const id = `fe-${field.key}`;
  if (field.type === 'textarea') {
    return (
      <label className="fe-field" htmlFor={id}>
        <span>{field.label}</span>
        <textarea id={id} rows={field.rows || 3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <label className="fe-field" htmlFor={id}>
        <span>{field.label}</span>
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === 'color') {
    return (
      <label className="fe-field fe-field-color" htmlFor={id}>
        <span>{field.label}</span>
        <span className="fe-color-row">
          <input type="color" value={value || '#ff8a3d'} onChange={(e) => onChange(e.target.value)} />
          <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="#ff8a3d" />
        </span>
      </label>
    );
  }
  return (
    <label className="fe-field" htmlFor={id}>
      <span>{field.label}{field.hint ? <em className="fe-hint"> — {field.hint}</em> : null}</span>
      <input id={id} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ''} />
    </label>
  );
}

function FormEditorModal({ target, language, onClose }) {
  const modalRef = useRef(null);
  const isOpen = Boolean(target);
  useModalAccessibility({ isOpen, modalRef, onClose });
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(target?.value ?? {})));

  if (!target) {
    return null;
  }

  const t = language === 'ru'
    ? { save: 'Сохранить', cancel: 'Отмена', add: 'Добавить строку', remove: 'Удалить' }
    : { save: 'Save', cancel: 'Cancel', add: 'Add row', remove: 'Remove' };

  const rowsConfig = target.rowsConfig;
  const rows = rowsConfig ? (getPath(draft, rowsConfig.path) || []) : [];

  function updateField(key, value) {
    setDraft((current) => setPath(current, key, value));
  }

  function updateRow(index, key, value) {
    setDraft((current) => {
      const list = [...(getPath(current, rowsConfig.path) || [])];
      list[index] = { ...list[index], [key]: value };
      return setPath(current, rowsConfig.path, list);
    });
  }

  function addRow() {
    setDraft((current) => {
      const list = [...(getPath(current, rowsConfig.path) || [])];
      const blank = {};
      rowsConfig.itemFields.forEach((f) => { blank[f.key] = ''; });
      list.push(blank);
      return setPath(current, rowsConfig.path, list);
    });
  }

  function removeRow(index) {
    setDraft((current) => {
      const list = [...(getPath(current, rowsConfig.path) || [])];
      list.splice(index, 1);
      return setPath(current, rowsConfig.path, list);
    });
  }

  function moveRow(index, dir) {
    setDraft((current) => {
      const list = [...(getPath(current, rowsConfig.path) || [])];
      const target2 = index + dir;
      if (target2 < 0 || target2 >= list.length) return current;
      [list[index], list[target2]] = [list[target2], list[index]];
      return setPath(current, rowsConfig.path, list);
    });
  }

  function handleSave() {
    target.onSave(draft);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={modalRef}
        className="price-modal form-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={target.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-topbar price-topbar">
          <div>
            <p className="eyebrow">{language === 'ru' ? 'Редактор' : 'Editor'}</p>
            <h2>{target.title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t.cancel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" /></svg>
          </button>
        </div>

        <div className="price-content fe-content">
          {target.fields.map((field) => (
            <Field key={field.key} field={field} value={getPath(draft, field.key)} onChange={(v) => updateField(field.key, v)} />
          ))}

          {rowsConfig ? (
            <div className="fe-rows">
              <div className="fe-rows-head">
                <h3>{rowsConfig.label}</h3>
                <button type="button" className="cta-button secondary" onClick={addRow}>{t.add}</button>
              </div>
              {rows.map((row, index) => (
                <div key={index} className="fe-row surface-subpanel">
                  <div className="fe-row-fields">
                    {rowsConfig.itemFields.map((f) => (
                      <Field key={f.key} field={f} value={row[f.key]} onChange={(v) => updateRow(index, f.key, v)} />
                    ))}
                  </div>
                  <div className="fe-row-actions">
                    <button type="button" onClick={() => moveRow(index, -1)} aria-label="up" title="↑">↑</button>
                    <button type="button" onClick={() => moveRow(index, 1)} aria-label="down" title="↓">↓</button>
                    <button type="button" className="danger" onClick={() => removeRow(index)} aria-label={t.remove} title={t.remove}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="fe-footer">
          <button type="button" className="cta-button secondary" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="cta-button primary" onClick={handleSave}>{t.save}</button>
        </div>
      </section>
    </div>
  );
}

export default FormEditorModal;
