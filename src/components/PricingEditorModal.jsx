import { useEffect, useState } from 'react';

const emptyPricing = {
  hero: { ruTitle: '', enTitle: '', ruText: '', enText: '' },
  thumbnailSegments: [],
  services: [],
  channelPackages: [],
  footerNote: { ruText: '', enText: '' },
  contact: { ruLabel: '', enLabel: '', url: '', color: '#229ED9' },
};

const editorCopy = {
  ru: {
    eyebrow: 'Редактор прайса',
    title: 'Прайс без кода',
    hint: 'Меняй тексты, цены, цвета карточек и кнопку связи. Изменения сохраняются в dev-версии и попадут в публикацию через Publish.',
    close: 'Закрыть',
    save: 'Сохранить прайс',
    hero: 'Шапка поп-апа',
    thumbnails: 'Превью для YouTube',
    services: 'Другие задачи',
    packages: 'Пакеты канала',
    note: 'Пояснение внизу',
    contact: 'Кнопка связи',
    addThumbnail: 'Добавить превью',
    addService: 'Добавить услугу',
    addPackage: 'Добавить пакет',
    delete: 'Удалить',
    ruTitle: 'Название RU',
    enTitle: 'Название EN',
    ruText: 'Описание RU',
    enText: 'Описание EN',
    price: 'Цена',
    color: 'Цвет',
    background: 'Фон карточки, если нужен',
    theme: 'Тема карточки',
    ruItems: 'Пункты RU, каждый с новой строки',
    enItems: 'Пункты EN, каждый с новой строки',
    buttonRu: 'Текст кнопки RU',
    buttonEn: 'Текст кнопки EN',
    buttonUrl: 'Ссылка кнопки',
    buttonColor: 'Цвет кнопки',
  },
  en: {
    eyebrow: 'Pricing editor',
    title: 'Pricing without code',
    hint: 'Edit copy, prices, card colors, and the contact button. Changes are saved in dev and published with Publish.',
    close: 'Close',
    save: 'Save pricing',
    hero: 'Popup header',
    thumbnails: 'YouTube thumbnails',
    services: 'Other services',
    packages: 'Channel packages',
    note: 'Bottom note',
    contact: 'Contact button',
    addThumbnail: 'Add thumbnail',
    addService: 'Add service',
    addPackage: 'Add package',
    delete: 'Delete',
    ruTitle: 'RU title',
    enTitle: 'EN title',
    ruText: 'RU description',
    enText: 'EN description',
    price: 'Price',
    color: 'Color',
    background: 'Card background if needed',
    theme: 'Card theme',
    ruItems: 'RU items, one per line',
    enItems: 'EN items, one per line',
    buttonRu: 'Button text RU',
    buttonEn: 'Button text EN',
    buttonUrl: 'Button URL',
    buttonColor: 'Button color',
  },
};

function clonePricing(pricing) {
  return JSON.parse(JSON.stringify({ ...emptyPricing, ...pricing }));
}

function updateArrayItem(items, index, patch) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function linesToItems(value) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function PricingEditorModal({ isOpen, language, pricing, onSave, onClose }) {
  const [form, setForm] = useState(emptyPricing);
  const copy = editorCopy[language] ?? editorCopy.ru;

  useEffect(() => {
    if (isOpen) {
      setForm(clonePricing(pricing));
    }
  }, [isOpen, pricing]);

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

  function updateHero(field, value) {
    setForm((current) => ({ ...current, hero: { ...current.hero, [field]: value } }));
  }

  function updateContact(field, value) {
    setForm((current) => ({ ...current, contact: { ...current.contact, [field]: value } }));
  }

  function updateFooterNote(field, value) {
    setForm((current) => ({ ...current, footerNote: { ...current.footerNote, [field]: value } }));
  }

  function updateCollection(collection, index, patch) {
    setForm((current) => ({ ...current, [collection]: updateArrayItem(current[collection], index, patch) }));
  }

  function removeItem(collection, index) {
    setForm((current) => ({ ...current, [collection]: current[collection].filter((_, itemIndex) => itemIndex !== index) }));
  }

  function addThumbnail() {
    setForm((current) => ({
      ...current,
      thumbnailSegments: [
        ...current.thumbnailSegments,
        { ruName: 'Новое превью', enName: 'New thumbnail', ruDescription: '', enDescription: '', price: 'от 0 ₽', accentColor: '#9ae923' },
      ],
    }));
  }

  function addService() {
    setForm((current) => ({
      ...current,
      services: [
        ...current.services,
        { ruName: 'Новая услуга', enName: 'New service', ruDescription: '', enDescription: '', price: 'от 0 ₽', accentColor: '#9ae923' },
      ],
    }));
  }

  function addPackage() {
    setForm((current) => ({
      ...current,
      channelPackages: [
        ...current.channelPackages,
        { theme: 'custom', ruName: 'Новый пакет', enName: 'New package', price: 'от 0 ₽', ruItems: ['Пункт'], enItems: ['Item'], accentColor: '#9ae923' },
      ],
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(form);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="pricing-editor-modal" role="dialog" aria-modal="true" aria-label={copy.title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar pricing-editor-topbar">
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

        <form className="pricing-editor-body" onSubmit={handleSubmit}>
          <section className="pricing-editor-section">
            <h3>{copy.hero}</h3>
            <div className="pricing-editor-grid two">
              <label className="studio-field">
                <span>{copy.ruTitle}</span>
                <input value={form.hero.ruTitle || ''} onChange={(event) => updateHero('ruTitle', event.target.value)} />
              </label>
              <label className="studio-field">
                <span>{copy.enTitle}</span>
                <input value={form.hero.enTitle || ''} onChange={(event) => updateHero('enTitle', event.target.value)} />
              </label>
              <label className="studio-field">
                <span>{copy.ruText}</span>
                <textarea value={form.hero.ruText || ''} onChange={(event) => updateHero('ruText', event.target.value)} />
              </label>
              <label className="studio-field">
                <span>{copy.enText}</span>
                <textarea value={form.hero.enText || ''} onChange={(event) => updateHero('enText', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="pricing-editor-section">
            <div className="pricing-editor-section-head">
              <h3>{copy.thumbnails}</h3>
              <button type="button" className="cta-button secondary" onClick={addThumbnail}>{copy.addThumbnail}</button>
            </div>
            <div className="pricing-editor-cards">
              {form.thumbnailSegments.map((item, index) => (
                <article key={`${item.ruName}-${index}`} className="pricing-editor-card">
                  <div className="pricing-editor-grid two">
                    <label className="studio-field"><span>{copy.ruTitle}</span><input value={item.ruName || ''} onChange={(event) => updateCollection('thumbnailSegments', index, { ruName: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.enTitle}</span><input value={item.enName || ''} onChange={(event) => updateCollection('thumbnailSegments', index, { enName: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.ruText}</span><textarea value={item.ruDescription || ''} onChange={(event) => updateCollection('thumbnailSegments', index, { ruDescription: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.enText}</span><textarea value={item.enDescription || ''} onChange={(event) => updateCollection('thumbnailSegments', index, { enDescription: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.price}</span><input value={item.price || ''} onChange={(event) => updateCollection('thumbnailSegments', index, { price: event.target.value })} /></label>
                    <label className="studio-field color-field"><span>{copy.color}</span><input type="color" value={item.accentColor || '#9ae923'} onChange={(event) => updateCollection('thumbnailSegments', index, { accentColor: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.background}</span><input value={item.background || ''} onChange={(event) => updateCollection('thumbnailSegments', index, { background: event.target.value })} /></label>
                  </div>
                  <button type="button" className="cta-button danger" onClick={() => removeItem('thumbnailSegments', index)}>{copy.delete}</button>
                </article>
              ))}
            </div>
          </section>

          <section className="pricing-editor-section">
            <div className="pricing-editor-section-head">
              <h3>{copy.services}</h3>
              <button type="button" className="cta-button secondary" onClick={addService}>{copy.addService}</button>
            </div>
            <div className="pricing-editor-cards compact">
              {form.services.map((item, index) => (
                <article key={`${item.ruName}-${index}`} className="pricing-editor-card">
                  <div className="pricing-editor-grid service">
                    <label className="studio-field"><span>{copy.ruTitle}</span><input value={item.ruName || ''} onChange={(event) => updateCollection('services', index, { ruName: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.enTitle}</span><input value={item.enName || ''} onChange={(event) => updateCollection('services', index, { enName: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.price}</span><input value={item.price || ''} onChange={(event) => updateCollection('services', index, { price: event.target.value })} /></label>
                    <label className="studio-field color-field"><span>{copy.color}</span><input type="color" value={item.accentColor || '#9ae923'} onChange={(event) => updateCollection('services', index, { accentColor: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.ruText}</span><textarea value={item.ruDescription || ''} onChange={(event) => updateCollection('services', index, { ruDescription: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.enText}</span><textarea value={item.enDescription || ''} onChange={(event) => updateCollection('services', index, { enDescription: event.target.value })} /></label>
                  </div>
                  <button type="button" className="cta-button danger" onClick={() => removeItem('services', index)}>{copy.delete}</button>
                </article>
              ))}
            </div>
          </section>

          <section className="pricing-editor-section">
            <h3>{copy.note}</h3>
            <div className="pricing-editor-grid two">
              <label className="studio-field">
                <span>{copy.ruText}</span>
                <textarea value={form.footerNote?.ruText || ''} onChange={(event) => updateFooterNote('ruText', event.target.value)} />
              </label>
              <label className="studio-field">
                <span>{copy.enText}</span>
                <textarea value={form.footerNote?.enText || ''} onChange={(event) => updateFooterNote('enText', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="pricing-editor-section">
            <div className="pricing-editor-section-head">
              <h3>{copy.packages}</h3>
              <button type="button" className="cta-button secondary" onClick={addPackage}>{copy.addPackage}</button>
            </div>
            <div className="pricing-editor-cards">
              {form.channelPackages.map((item, index) => (
                <article key={`${item.theme}-${index}`} className="pricing-editor-card">
                  <div className="pricing-editor-grid two">
                    <label className="studio-field"><span>{copy.ruTitle}</span><input value={item.ruName || ''} onChange={(event) => updateCollection('channelPackages', index, { ruName: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.enTitle}</span><input value={item.enName || ''} onChange={(event) => updateCollection('channelPackages', index, { enName: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.theme}</span><input value={item.theme || ''} onChange={(event) => updateCollection('channelPackages', index, { theme: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.price}</span><input value={item.price || ''} onChange={(event) => updateCollection('channelPackages', index, { price: event.target.value })} /></label>
                    <label className="studio-field color-field"><span>{copy.color}</span><input type="color" value={item.accentColor || '#9ae923'} onChange={(event) => updateCollection('channelPackages', index, { accentColor: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.background}</span><input value={item.background || ''} onChange={(event) => updateCollection('channelPackages', index, { background: event.target.value })} /></label>
                    <label className="studio-field"><span>{copy.ruItems}</span><textarea value={(item.ruItems || []).join('\n')} onChange={(event) => updateCollection('channelPackages', index, { ruItems: linesToItems(event.target.value) })} /></label>
                    <label className="studio-field"><span>{copy.enItems}</span><textarea value={(item.enItems || []).join('\n')} onChange={(event) => updateCollection('channelPackages', index, { enItems: linesToItems(event.target.value) })} /></label>
                  </div>
                  <button type="button" className="cta-button danger" onClick={() => removeItem('channelPackages', index)}>{copy.delete}</button>
                </article>
              ))}
            </div>
          </section>

          <section className="pricing-editor-section">
            <h3>{copy.contact}</h3>
            <div className="pricing-editor-grid two">
              <label className="studio-field"><span>{copy.buttonRu}</span><input value={form.contact.ruLabel || ''} onChange={(event) => updateContact('ruLabel', event.target.value)} /></label>
              <label className="studio-field"><span>{copy.buttonEn}</span><input value={form.contact.enLabel || ''} onChange={(event) => updateContact('enLabel', event.target.value)} /></label>
              <label className="studio-field"><span>{copy.buttonUrl}</span><input value={form.contact.url || ''} onChange={(event) => updateContact('url', event.target.value)} /></label>
              <label className="studio-field color-field"><span>{copy.buttonColor}</span><input type="color" value={form.contact.color || '#229ED9'} onChange={(event) => updateContact('color', event.target.value)} /></label>
            </div>
          </section>

          <div className="pricing-editor-actions">
            <button type="button" className="cta-button secondary" onClick={onClose}>{copy.close}</button>
            <button type="submit" className="cta-button primary">{copy.save}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default PricingEditorModal;
