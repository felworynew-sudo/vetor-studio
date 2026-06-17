import { useEffect, useMemo, useState } from 'react';
import { designCategoryList, normalizeDesignCategory } from '../data/designCategories';

const emptyItem = {
  id: '',
  ruTitle: '',
  enTitle: '',
  ruDescription: '',
  enDescription: '',
  ratio: 'square',
  designCategory: 'logos',
  images: [],
  createdAt: '',
  youtubeChannel: {
    name: '',
    handle: '',
    metaRu: '',
    metaEn: '',
    ctaUrl: '',
    ctaRu: '',
    ctaEn: '',
    cover: '',
    avatar: '',
  },
  stickers: {
    primaryRu: '',
    primaryEn: '',
    primaryUrl: '',
    secondaryRu: '',
    secondaryEn: '',
    secondaryUrl: '',
  },
};

const copyText = {
  ru: {
    eyebrow: 'Редактор раздела дизайн',
    title: 'Публикация дизайна',
    hint: 'Можно редактировать заголовки, описания, формат, изображения и специальные блоки YouTube/Стикеры.',
    close: 'Закрыть',
    save: 'Сохранить публикацию',
    main: 'Основное',
    images: 'Изображения',
    extras: 'Спецблок',
    ruTitle: 'Название RU',
    enTitle: 'Название EN',
    ruDescription: 'Описание RU',
    enDescription: 'Описание EN',
    ratio: 'Формат плитки',
    category: 'Подвкладка',
    createdAt: 'Дата',
    imageList: 'Пути к изображениям, каждый с новой строки',
    altHint: 'Alt берётся из названия публикации. При необходимости можно уточнить позже.',
    youtubeName: 'Название канала',
    youtubeHandle: 'Хэндл канала',
    youtubeMetaRu: 'Строка метаданных RU',
    youtubeMetaEn: 'Строка метаданных EN',
    youtubeCtaUrl: 'Ссылка кнопки',
    youtubeCtaRu: 'Текст кнопки RU',
    youtubeCtaEn: 'Текст кнопки EN',
    youtubeCover: 'Путь к шапке канала',
    youtubeAvatar: 'Путь к аватарке канала',
    stickerPrimaryRu: 'Кнопка 1 (RU)',
    stickerPrimaryEn: 'Кнопка 1 (EN)',
    stickerPrimaryUrl: 'Ссылка кнопки 1',
    stickerSecondaryRu: 'Кнопка 2 (RU)',
    stickerSecondaryEn: 'Кнопка 2 (EN)',
    stickerSecondaryUrl: 'Ссылка кнопки 2',
  },
  en: {
    eyebrow: 'Design editor',
    title: 'Design item',
    hint: 'Edit titles, descriptions, format, media paths, and YouTube/Stickers blocks.',
    close: 'Close',
    save: 'Save item',
    main: 'Main',
    images: 'Images',
    extras: 'Special block',
    ruTitle: 'RU title',
    enTitle: 'EN title',
    ruDescription: 'RU description',
    enDescription: 'EN description',
    ratio: 'Tile format',
    category: 'Subcategory',
    createdAt: 'Date',
    imageList: 'Image paths, one per line',
    altHint: 'Alt text uses item title by default.',
    youtubeName: 'Channel name',
    youtubeHandle: 'Channel handle',
    youtubeMetaRu: 'Meta line RU',
    youtubeMetaEn: 'Meta line EN',
    youtubeCtaUrl: 'CTA URL',
    youtubeCtaRu: 'CTA RU text',
    youtubeCtaEn: 'CTA EN text',
    youtubeCover: 'Channel cover path',
    youtubeAvatar: 'Channel avatar path',
    stickerPrimaryRu: 'Button 1 (RU)',
    stickerPrimaryEn: 'Button 1 (EN)',
    stickerPrimaryUrl: 'Button 1 URL',
    stickerSecondaryRu: 'Button 2 (RU)',
    stickerSecondaryEn: 'Button 2 (EN)',
    stickerSecondaryUrl: 'Button 2 URL',
  },
};

const ratios = ['wide', 'landscape', 'square', 'portrait'];

function cloneItem(item) {
  return {
    ...emptyItem,
    ...item,
    designCategory: normalizeDesignCategory(item?.designCategory || emptyItem.designCategory),
    youtubeChannel: {
      ...emptyItem.youtubeChannel,
      ...(item?.youtubeChannel || {}),
    },
    stickers: {
      ...emptyItem.stickers,
      ...(item?.stickers || {}),
    },
    images: Array.isArray(item?.images) ? item.images : [],
  };
}

function pathsToImages(value, item) {
  return value
    .split('\n')
    .map((src) => src.trim())
    .filter(Boolean)
    .map((src, index) => {
      const existing = item.images?.[index];
      return {
        src,
        ruAlt: existing?.ruAlt || item.ruTitle || item.enTitle || 'Изображение',
        enAlt: existing?.enAlt || item.enTitle || item.ruTitle || 'Image',
      };
    });
}

function GalleryItemEditorModal({ item, language, onSave, onClose }) {
  const [form, setForm] = useState(cloneItem(item || emptyItem));
  const copy = copyText[language] ?? copyText.ru;
  const isYoutube = normalizeDesignCategory(form.designCategory) === 'youtube';
  const isStickers = normalizeDesignCategory(form.designCategory) === 'stickers';

  useEffect(() => {
    setForm(cloneItem(item || emptyItem));
  }, [item]);

  useEffect(() => {
    if (!item) {
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
  }, [item, onClose]);

  const imagePathsValue = useMemo(() => (form.images || []).map((image) => image.src).join('\n'), [form.images]);

  if (!item) {
    return null;
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateYoutubeField(field, value) {
    setForm((current) => ({
      ...current,
      youtubeChannel: {
        ...(current.youtubeChannel || {}),
        [field]: value,
      },
    }));
  }

  function updateStickerField(field, value) {
    setForm((current) => ({
      ...current,
      stickers: {
        ...(current.stickers || {}),
        [field]: value,
      },
    }));
  }

  function handleImagePathsChange(value) {
    setForm((current) => ({ ...current, images: pathsToImages(value, current) }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const normalizedCategory = normalizeDesignCategory(form.designCategory);
    const nextItem = {
      ...form,
      designCategory: normalizedCategory,
      ratio: normalizedCategory === 'youtube' ? 'wide' : form.ratio || 'square',
      images: form.images?.length
        ? form.images
        : [{ src: '/gallery/gallery-placeholder.svg', ruAlt: form.ruTitle, enAlt: form.enTitle }],
      createdAt: form.createdAt || new Date().toISOString().slice(0, 10),
    };

    onSave(nextItem);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="gallery-editor-modal" role="dialog" aria-modal="true" aria-label={copy.title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar gallery-editor-topbar">
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

        <form className="gallery-editor-body" onSubmit={handleSubmit}>
          <section className="gallery-editor-section">
            <h3>{copy.main}</h3>
            <div className="gallery-editor-grid two">
              <label className="studio-field"><span>{copy.ruTitle}</span><input value={form.ruTitle || ''} onChange={(event) => updateField('ruTitle', event.target.value)} /></label>
              <label className="studio-field"><span>{copy.enTitle}</span><input value={form.enTitle || ''} onChange={(event) => updateField('enTitle', event.target.value)} /></label>
              <label className="studio-field"><span>{copy.ruDescription}</span><textarea value={form.ruDescription || ''} onChange={(event) => updateField('ruDescription', event.target.value)} /></label>
              <label className="studio-field"><span>{copy.enDescription}</span><textarea value={form.enDescription || ''} onChange={(event) => updateField('enDescription', event.target.value)} /></label>

              <label className="studio-field">
                <span>{copy.category}</span>
                <select value={form.designCategory || 'logos'} onChange={(event) => updateField('designCategory', event.target.value)}>
                  {designCategoryList.filter((category) => category.slug !== 'all').map((category) => (
                    <option key={category.slug} value={category.slug}>{category[language] || category.ru || category.en}</option>
                  ))}
                </select>
              </label>

              <label className="studio-field">
                <span>{copy.ratio}</span>
                <select
                  value={form.ratio || 'square'}
                  onChange={(event) => updateField('ratio', event.target.value)}
                  disabled={isYoutube}
                >
                  {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
              </label>

              <label className="studio-field"><span>{copy.createdAt}</span><input type="date" value={form.createdAt || ''} onChange={(event) => updateField('createdAt', event.target.value)} /></label>
            </div>
          </section>

          <section className="gallery-editor-section">
            <h3>{copy.images}</h3>
            <label className="studio-field">
              <span>{copy.imageList}</span>
              <textarea
                value={imagePathsValue}
                onChange={(event) => handleImagePathsChange(event.target.value)}
              />
            </label>
            <p className="gallery-editor-note">{copy.altHint}</p>
          </section>

          {isYoutube ? (
            <section className="gallery-editor-section">
              <h3>{copy.extras}</h3>
              <div className="gallery-editor-grid two">
                <label className="studio-field"><span>{copy.youtubeName}</span><input value={form.youtubeChannel?.name || ''} onChange={(event) => updateYoutubeField('name', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeHandle}</span><input value={form.youtubeChannel?.handle || ''} onChange={(event) => updateYoutubeField('handle', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeMetaRu}</span><input value={form.youtubeChannel?.metaRu || ''} onChange={(event) => updateYoutubeField('metaRu', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeMetaEn}</span><input value={form.youtubeChannel?.metaEn || ''} onChange={(event) => updateYoutubeField('metaEn', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeCtaUrl}</span><input value={form.youtubeChannel?.ctaUrl || ''} onChange={(event) => updateYoutubeField('ctaUrl', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeCtaRu}</span><input value={form.youtubeChannel?.ctaRu || ''} onChange={(event) => updateYoutubeField('ctaRu', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeCtaEn}</span><input value={form.youtubeChannel?.ctaEn || ''} onChange={(event) => updateYoutubeField('ctaEn', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeCover}</span><input value={form.youtubeChannel?.cover || ''} onChange={(event) => updateYoutubeField('cover', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.youtubeAvatar}</span><input value={form.youtubeChannel?.avatar || ''} onChange={(event) => updateYoutubeField('avatar', event.target.value)} /></label>
              </div>
            </section>
          ) : null}

          {isStickers ? (
            <section className="gallery-editor-section">
              <h3>{copy.extras}</h3>
              <div className="gallery-editor-grid two">
                <label className="studio-field"><span>{copy.stickerPrimaryRu}</span><input value={form.stickers?.primaryRu || ''} onChange={(event) => updateStickerField('primaryRu', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.stickerPrimaryEn}</span><input value={form.stickers?.primaryEn || ''} onChange={(event) => updateStickerField('primaryEn', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.stickerPrimaryUrl}</span><input value={form.stickers?.primaryUrl || ''} onChange={(event) => updateStickerField('primaryUrl', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.stickerSecondaryRu}</span><input value={form.stickers?.secondaryRu || ''} onChange={(event) => updateStickerField('secondaryRu', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.stickerSecondaryEn}</span><input value={form.stickers?.secondaryEn || ''} onChange={(event) => updateStickerField('secondaryEn', event.target.value)} /></label>
                <label className="studio-field"><span>{copy.stickerSecondaryUrl}</span><input value={form.stickers?.secondaryUrl || ''} onChange={(event) => updateStickerField('secondaryUrl', event.target.value)} /></label>
              </div>
            </section>
          ) : null}

          <div className="gallery-editor-actions">
            <button type="button" className="cta-button secondary" onClick={onClose}>{copy.close}</button>
            <button type="submit" className="cta-button primary">{copy.save}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default GalleryItemEditorModal;
