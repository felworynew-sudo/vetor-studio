import { useEffect, useMemo, useRef, useState } from 'react';
import ImageWithFallback from './ImageWithFallback';
import { withBase } from '../utils/format';

const composerCopy = {
  ru: {
    eyebrow: 'Редактор блога',
    create: 'Новая публикация',
    edit: 'Редактирование публикации',
    hint: 'Собирай публикацию блоками: текст, фото, GIF или горизонтальная карусель.',
    close: 'Закрыть',
    publish: 'Опубликовать',
    cover: 'Обложка',
    titleRu: 'Заголовок RU',
    titleEn: 'Заголовок EN',
    descriptionRu: 'Описание RU',
    descriptionEn: 'Описание EN',
    tags: 'Теги',
    canvas: 'Лист публикации',
    tools: 'Инструменты',
    addText: 'Добавить текст',
    addImage: 'Фото/GIF',
    addCarousel: 'Карусель',
    addBeforeAfter: 'До/после',
    addTable: 'Таблица',
    bold: 'Bold',
    italic: 'Italic',
    link: 'Ссылка',
    bigger: 'Крупнее',
    button: 'Кнопка',
    color: 'Цвет',
    showTags: 'Показать теги',
    hideTags: 'Скрыть теги',
    normal: 'Обычный',
    moveUp: 'Вверх',
    moveDown: 'Вниз',
    delete: 'Удалить блок',
    ruText: 'Текст RU',
    enText: 'Текст EN',
    captionRu: 'Подпись RU',
    captionEn: 'Подпись EN',
    beforeLabelRu: 'Лейбл слева RU',
    beforeLabelEn: 'Лейбл слева EN',
    afterLabelRu: 'Лейбл справа RU',
    afterLabelEn: 'Лейбл справа EN',
    beforeImage: 'Изображение до',
    afterImage: 'Изображение после',
    noBlocks: 'Добавь первый текстовый блок или медиа справа.',
    rows: 'Строки',
    columns: 'Столбцы',
    horizontalLines: 'Горизонтальные линии',
    verticalLines: 'Вертикальные линии',
    tableRu: 'Таблица RU',
    tableEn: 'Таблица EN',
  },
  en: {
    eyebrow: 'Blog editor',
    create: 'New post',
    edit: 'Edit post',
    hint: 'Build a post with blocks: text, photos, GIFs, or a horizontal carousel.',
    close: 'Close',
    publish: 'Publish',
    cover: 'Cover',
    titleRu: 'RU title',
    titleEn: 'EN title',
    descriptionRu: 'RU description',
    descriptionEn: 'EN description',
    tags: 'Tags',
    canvas: 'Post canvas',
    tools: 'Tools',
    addText: 'Add text',
    addImage: 'Photo/GIF',
    addCarousel: 'Carousel',
    addBeforeAfter: 'Before/after',
    addTable: 'Table',
    bold: 'Bold',
    italic: 'Italic',
    link: 'Link',
    button: 'Button',
    color: 'Color',
    showTags: 'Show tags',
    hideTags: 'Hide tags',
    bigger: 'Bigger',
    normal: 'Normal',
    moveUp: 'Move up',
    moveDown: 'Move down',
    delete: 'Delete block',
    ruText: 'RU text',
    enText: 'EN text',
    captionRu: 'RU caption',
    captionEn: 'EN caption',
    beforeLabelRu: 'Left label RU',
    beforeLabelEn: 'Left label EN',
    afterLabelRu: 'Right label RU',
    afterLabelEn: 'Right label EN',
    beforeImage: 'Before image',
    afterImage: 'After image',
    noBlocks: 'Add the first text block or media from the sidebar.',
    rows: 'Rows',
    columns: 'Columns',
    horizontalLines: 'Horizontal lines',
    verticalLines: 'Vertical lines',
    tableRu: 'Table RU',
    tableEn: 'Table EN',
  },
};

function createBlockId() {
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPostId() {
  return `blog-${Date.now()}`;
}

function createTextBlock() {
  return {
    id: createBlockId(),
    type: 'text',
    ruText: '',
    enText: '',
    size: 'body',
    bold: false,
    italic: false,
    linkUrl: '',
    linkStyle: 'text',
    accent: false,
  };
}

function normalizeTableSize(value, fallback, min = 1, max = 8) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function createTableMatrix(rows, columns) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''));
}

function ensureTableCells(cells, rows, columns) {
  const source = Array.isArray(cells) ? cells : [];

  return Array.from({ length: rows }, (_, rowIndex) => {
    const sourceRow = Array.isArray(source[rowIndex]) ? source[rowIndex] : [];
    return Array.from({ length: columns }, (_, columnIndex) => String(sourceRow[columnIndex] || ''));
  });
}

function normalizeTableBlock(block) {
  const rows = normalizeTableSize(block?.rows, 3);
  const columns = normalizeTableSize(block?.columns, 3);

  return {
    ...block,
    rows,
    columns,
    showHorizontal: block?.showHorizontal !== false,
    showVertical: block?.showVertical !== false,
    ruCells: ensureTableCells(block?.ruCells, rows, columns),
    enCells: ensureTableCells(block?.enCells, rows, columns),
    ruCaption: block?.ruCaption || '',
    enCaption: block?.enCaption || '',
  };
}

function createTableBlock() {
  return normalizeTableBlock({
    id: createBlockId(),
    type: 'table',
  });
}

function createEmptyPost() {
  return {
    id: createPostId(),
    ruTitle: '',
    enTitle: '',
    ruDescription: '',
    enDescription: '',
    cover: '/blog/pdf-cover.svg',
    tags: [],
    blocks: [createTextBlock()],
    featured: false,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function preparePost(post) {
  if (!post) {
    return createEmptyPost();
  }

  const legacyBlocks = post.blocks?.length
    ? post.blocks
    : (post.ruSections || []).map((section, index) => ({
        id: createBlockId(),
        type: 'text',
        ruText: section,
        enText: post.enSections?.[index] || section,
        size: index === 0 ? 'hero' : 'body',
        bold: index === 0,
        italic: false,
        linkUrl: '',
      }));

  return {
    ...createEmptyPost(),
    ...post,
    blocks: legacyBlocks.length
      ? legacyBlocks.map((block) => {
          const baseBlock = { id: block.id || createBlockId(), ...block };
          return baseBlock.type === 'table' ? normalizeTableBlock(baseBlock) : baseBlock;
        })
      : [createTextBlock()],
  };
}

function readRawFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function optimizeImageDataUrl(dataUrl, { maxWidth = 1600, maxHeight = 1600, quality = 0.84 } = {}) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const scale = Math.min(1, maxWidth / width, maxHeight / height);

      if (scale >= 0.995 && dataUrl.length < 1_600_000) {
        resolve(dataUrl);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      try {
        const optimized = canvas.toDataURL('image/webp', quality);
        resolve(optimized.length < dataUrl.length ? optimized : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };

    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function readFileAsDataUrl(file, options = {}) {
  const {
    optimize = true,
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.84,
  } = options;

  const raw = await readRawFileAsDataUrl(file);

  if (
    !optimize
    || !file.type.startsWith('image/')
    || file.type === 'image/gif'
    || file.type === 'image/svg+xml'
  ) {
    return raw;
  }

  return optimizeImageDataUrl(raw, { maxWidth, maxHeight, quality });
}

function BlogComposerModal({ isOpen, language, post, tags, onSave, onClose }) {
  const [form, setForm] = useState(() => createEmptyPost());
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [areTagsOpen, setAreTagsOpen] = useState(false);
  const imageInputRef = useRef(null);
  const carouselInputRef = useRef(null);
  const beforeAfterInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const copy = composerCopy[language] ?? composerCopy.ru;

  useEffect(() => {
    if (isOpen) {
      const nextPost = preparePost(post);
      setForm(nextPost);
      setSelectedBlockId(nextPost.blocks[0]?.id || '');
      setContextMenu(null);
      setAreTagsOpen(false);
    }
  }, [isOpen, post]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    function handleClick() {
      setContextMenu(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, [isOpen, onClose]);

  const selectedBlock = useMemo(
    () => form.blocks.find((block) => block.id === selectedBlockId),
    [form.blocks, selectedBlockId],
  );

  if (!isOpen) {
    return null;
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateBlock(blockId, patch) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
    }));
  }

  function updateTableLayout(blockId, patch) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId || block.type !== 'table') {
          return block;
        }

        const nextRows = normalizeTableSize(patch.rows, block.rows || 3);
        const nextColumns = normalizeTableSize(patch.columns, block.columns || 3);
        return {
          ...block,
          ...patch,
          rows: nextRows,
          columns: nextColumns,
          ruCells: ensureTableCells(block.ruCells, nextRows, nextColumns),
          enCells: ensureTableCells(block.enCells, nextRows, nextColumns),
        };
      }),
    }));
  }

  function updateTableCell(blockId, languageKey, rowIndex, columnIndex, value) {
    const targetKey = languageKey === 'en' ? 'enCells' : 'ruCells';

    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => {
        if (block.id !== blockId || block.type !== 'table') {
          return block;
        }

        const rows = normalizeTableSize(block.rows, 3);
        const columns = normalizeTableSize(block.columns, 3);
        const nextCells = ensureTableCells(block[targetKey], rows, columns);
        nextCells[rowIndex][columnIndex] = value;

        return {
          ...block,
          [targetKey]: nextCells,
        };
      }),
    }));
  }

  function addBlock(block) {
    setForm((current) => {
      const selectedIndex = current.blocks.findIndex((item) => item.id === selectedBlockId);

      if (selectedIndex === -1) {
        return { ...current, blocks: [...current.blocks, block] };
      }

      const nextBlocks = [...current.blocks];
      nextBlocks.splice(selectedIndex + 1, 0, block);
      return { ...current, blocks: nextBlocks };
    });
    setSelectedBlockId(block.id);
  }

  function deleteSelectedBlock() {
    if (!selectedBlockId) {
      return;
    }

    setForm((current) => {
      const selectedIndex = current.blocks.findIndex((block) => block.id === selectedBlockId);
      const nextBlocks = current.blocks.filter((block) => block.id !== selectedBlockId);
      const nextSelection = nextBlocks[Math.max(0, selectedIndex - 1)] || nextBlocks[0];
      setSelectedBlockId(nextSelection?.id || '');
      return { ...current, blocks: nextBlocks };
    });
  }

  function moveSelectedBlock(direction) {
    if (!selectedBlockId) {
      return;
    }

    setForm((current) => {
      const currentIndex = current.blocks.findIndex((block) => block.id === selectedBlockId);
      const nextIndex = currentIndex + direction;

      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= current.blocks.length) {
        return current;
      }

      const nextBlocks = [...current.blocks];
      const [movedBlock] = nextBlocks.splice(currentIndex, 1);
      nextBlocks.splice(nextIndex, 0, movedBlock);

      return { ...current, blocks: nextBlocks };
    });
  }

  function toggleTag(slug) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(slug)
        ? current.tags.filter((item) => item !== slug)
        : [...current.tags, slug],
    }));
  }

  async function handleCoverSelect(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    updateField('cover', await readFileAsDataUrl(file, { maxWidth: 1600, maxHeight: 900, quality: 0.82 }));
    event.target.value = '';
  }

  async function handleImageSelect(event) {
    const files = Array.from(event.target.files || []);
    const [file] = files;

    if (!file) {
      return;
    }

    const src = await readFileAsDataUrl(file, { maxWidth: 1800, maxHeight: 1800, quality: 0.84 });
    addBlock({
      id: createBlockId(),
      type: 'image',
      src,
      ratio: 'wide',
      ruCaption: '',
      enCaption: '',
    });
    event.target.value = '';
  }

  async function handleCarouselSelect(event) {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    const images = await Promise.all(files.map(async (file) => ({
      src: await readFileAsDataUrl(file, { maxWidth: 1800, maxHeight: 1800, quality: 0.84 }),
      ratio: 'wide',
      ruAlt: file.name,
      enAlt: file.name,
    })));

    addBlock({
      id: createBlockId(),
      type: 'carousel',
      images,
      ruCaption: '',
      enCaption: '',
    });
    event.target.value = '';
  }

  async function handleBeforeAfterSelect(event) {
    const files = Array.from(event.target.files || []).slice(0, 2);

    if (!files.length) {
      return;
    }

    const [beforeFile, afterFile] = files;
    const beforeSrc = await readFileAsDataUrl(beforeFile, { maxWidth: 1800, maxHeight: 1800, quality: 0.84 });
    const afterSrc = afterFile ? await readFileAsDataUrl(afterFile, { maxWidth: 1800, maxHeight: 1800, quality: 0.84 }) : beforeSrc;

    addBlock({
      id: createBlockId(),
      type: 'beforeAfter',
      beforeSrc,
      afterSrc,
      ruBeforeLabel: '',
      enBeforeLabel: '',
      ruAfterLabel: '',
      enAfterLabel: '',
      ruCaption: '',
      enCaption: '',
    });
    event.target.value = '';
  }

  function openContextMenu(event, blockId) {
    event.preventDefault();
    setSelectedBlockId(blockId);
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  function promptLink() {
    if (!selectedBlock) {
      return;
    }

    const nextUrl = window.prompt(language === 'ru' ? 'Вставь ссылку' : 'Paste a link', selectedBlock.linkUrl || 'https://');
    if (nextUrl !== null) {
      updateBlock(selectedBlock.id, { linkUrl: nextUrl.trim(), linkStyle: 'text' });
    }
  }

  function promptButtonLink() {
    if (!selectedBlock) {
      return;
    }

    const nextUrl = window.prompt(language === 'ru' ? 'Вставь ссылку для кнопки' : 'Paste a button link', selectedBlock.linkUrl || 'https://');
    if (nextUrl !== null) {
      updateBlock(selectedBlock.id, { linkUrl: nextUrl.trim(), linkStyle: 'button' });
    }
  }

  function handlePublish(event) {
    event.preventDefault();

    const cleanedPost = {
      ...form,
      ruTitle: form.ruTitle.trim() || 'Новая публикация',
      enTitle: form.enTitle.trim() || form.ruTitle.trim() || 'New post',
      ruDescription: form.ruDescription.trim(),
      enDescription: form.enDescription.trim() || form.ruDescription.trim(),
      blocks: form.blocks.filter((block) => {
        if (block.type === 'text') {
          return block.ruText?.trim() || block.enText?.trim();
        }

        if (block.type === 'carousel') {
          return block.images?.length;
        }

        if (block.type === 'beforeAfter') {
          return block.beforeSrc || block.afterSrc;
        }

        if (block.type === 'table') {
          const ruCells = ensureTableCells(block.ruCells, normalizeTableSize(block.rows, 3), normalizeTableSize(block.columns, 3));
          const enCells = ensureTableCells(block.enCells, normalizeTableSize(block.rows, 3), normalizeTableSize(block.columns, 3));
          const hasRu = ruCells.some((row) => row.some((cell) => String(cell || '').trim()));
          const hasEn = enCells.some((row) => row.some((cell) => String(cell || '').trim()));
          return hasRu || hasEn;
        }

        return Boolean(block.src);
      }),
    };

    onSave(cleanedPost);
    onClose();
  }

  const selectedBlockIndex = form.blocks.findIndex((block) => block.id === selectedBlockId);
  const canMoveSelectedUp = selectedBlockIndex > 0;
  const canMoveSelectedDown = selectedBlockIndex !== -1 && selectedBlockIndex < form.blocks.length - 1;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="blog-editor-modal" role="dialog" aria-modal="true" aria-label={copy.create} onClick={(event) => event.stopPropagation()}>
        <div className="modal-topbar blog-editor-topbar">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{post ? copy.edit : copy.create}</h2>
            <p>{copy.hint}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <form className="blog-editor-body" onSubmit={handlePublish}>
          <div className="blog-editor-main">
            <div className="blog-editor-meta">
              <button type="button" className="blog-cover-picker" onClick={() => coverInputRef.current?.click()}>
                <ImageWithFallback src={withBase(form.cover)} fallback={withBase('/blog/pdf-cover.svg')} alt={copy.cover} />
                <span>{copy.cover}</span>
              </button>
              <input ref={coverInputRef} type="file" accept="image/*,.gif" onChange={handleCoverSelect} hidden />

              <label className="studio-field">
                <span>{copy.titleRu}</span>
                <input value={form.ruTitle} onChange={(event) => updateField('ruTitle', event.target.value)} />
              </label>
              <label className="studio-field">
                <span>{copy.titleEn}</span>
                <input value={form.enTitle} onChange={(event) => updateField('enTitle', event.target.value)} />
              </label>
              <label className="studio-field studio-grid-span">
                <span>{copy.descriptionRu}</span>
                <textarea value={form.ruDescription} onChange={(event) => updateField('ruDescription', event.target.value)} />
              </label>
              <label className="studio-field studio-grid-span">
                <span>{copy.descriptionEn}</span>
                <textarea value={form.enDescription} onChange={(event) => updateField('enDescription', event.target.value)} />
              </label>
            </div>

            <div className="blog-editor-canvas">
              <div className="blog-editor-canvas-head">
                <span>{copy.canvas}</span>
              </div>

              {form.blocks.length === 0 ? <div className="blog-editor-empty">{copy.noBlocks}</div> : null}

              {form.blocks.map((block) => (
                <article
                  key={block.id}
                  className={`blog-editor-block ${selectedBlockId === block.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedBlockId(block.id)}
                  onContextMenu={(event) => openContextMenu(event, block.id)}
                >
                  {block.type === 'text' && (
                    <div className={`blog-editor-text-fields ${block.size || 'body'} ${block.bold ? 'is-bold' : ''} ${block.italic ? 'is-italic' : ''} ${block.accent ? 'is-accent' : ''}`}>
                      <label>
                        <span>{copy.ruText}</span>
                        <textarea value={block.ruText || ''} onChange={(event) => updateBlock(block.id, { ruText: event.target.value })} />
                      </label>
                      <label>
                        <span>{copy.enText}</span>
                        <textarea value={block.enText || ''} onChange={(event) => updateBlock(block.id, { enText: event.target.value })} />
                      </label>
                    </div>
                  )}

                  {block.type === 'image' && (
                    <div className="blog-editor-media-block">
                      <ImageWithFallback src={withBase(block.src)} fallback={withBase('/blog/pdf-cover.svg')} alt={block.ruCaption || form.ruTitle} />
                      <label className="studio-field">
                        <span>{copy.captionRu}</span>
                        <input value={block.ruCaption || ''} onChange={(event) => updateBlock(block.id, { ruCaption: event.target.value })} />
                      </label>
                      <label className="studio-field">
                        <span>{copy.captionEn}</span>
                        <input value={block.enCaption || ''} onChange={(event) => updateBlock(block.id, { enCaption: event.target.value })} />
                      </label>
                    </div>
                  )}

                  {block.type === 'carousel' && (
                    <div className="blog-editor-carousel-block">
                      <div className="blog-editor-carousel-track">
                        {(block.images || []).map((image, index) => (
                          <ImageWithFallback key={`${image.src}-${index}`} src={withBase(image.src)} fallback={withBase('/blog/pdf-cover.svg')} alt={image.ruAlt || form.ruTitle} />
                        ))}
                      </div>
                      <label className="studio-field">
                        <span>{copy.captionRu}</span>
                        <input value={block.ruCaption || ''} onChange={(event) => updateBlock(block.id, { ruCaption: event.target.value })} />
                      </label>
                      <label className="studio-field">
                        <span>{copy.captionEn}</span>
                        <input value={block.enCaption || ''} onChange={(event) => updateBlock(block.id, { enCaption: event.target.value })} />
                      </label>
                    </div>
                  )}

                  {block.type === 'beforeAfter' && (
                    <div className="blog-editor-before-after-block">
                      <div className="blog-editor-before-after-preview">
                        <div>
                          <ImageWithFallback src={withBase(block.beforeSrc)} fallback={withBase('/blog/pdf-cover.svg')} alt={block.ruBeforeLabel || form.ruTitle} />
                          {(block[language === 'ru' ? 'ruBeforeLabel' : 'enBeforeLabel'] || '').trim()
                            ? <span>{(block[language === 'ru' ? 'ruBeforeLabel' : 'enBeforeLabel'] || '').trim()}</span>
                            : null}
                        </div>
                        <div>
                          <ImageWithFallback src={withBase(block.afterSrc)} fallback={withBase('/blog/pdf-cover.svg')} alt={block.ruAfterLabel || form.ruTitle} />
                          {(block[language === 'ru' ? 'ruAfterLabel' : 'enAfterLabel'] || '').trim()
                            ? <span>{(block[language === 'ru' ? 'ruAfterLabel' : 'enAfterLabel'] || '').trim()}</span>
                            : null}
                        </div>
                      </div>
                      <div className="blog-editor-before-after-fields">
                        <label className="studio-field">
                          <span>{copy.beforeLabelRu}</span>
                          <input value={block.ruBeforeLabel || ''} onChange={(event) => updateBlock(block.id, { ruBeforeLabel: event.target.value })} />
                        </label>
                        <label className="studio-field">
                          <span>{copy.beforeLabelEn}</span>
                          <input value={block.enBeforeLabel || ''} onChange={(event) => updateBlock(block.id, { enBeforeLabel: event.target.value })} />
                        </label>
                        <label className="studio-field">
                          <span>{copy.afterLabelRu}</span>
                          <input value={block.ruAfterLabel || ''} onChange={(event) => updateBlock(block.id, { ruAfterLabel: event.target.value })} />
                        </label>
                        <label className="studio-field">
                          <span>{copy.afterLabelEn}</span>
                          <input value={block.enAfterLabel || ''} onChange={(event) => updateBlock(block.id, { enAfterLabel: event.target.value })} />
                        </label>
                      </div>
                      <label className="studio-field">
                        <span>{copy.captionRu}</span>
                        <input value={block.ruCaption || ''} onChange={(event) => updateBlock(block.id, { ruCaption: event.target.value })} />
                      </label>
                      <label className="studio-field">
                        <span>{copy.captionEn}</span>
                        <input value={block.enCaption || ''} onChange={(event) => updateBlock(block.id, { enCaption: event.target.value })} />
                      </label>
                    </div>
                  )}

                  {block.type === 'table' && (
                    <div className="blog-editor-table-block">
                      <div className="blog-editor-table-layout">
                        <label className="studio-field">
                          <span>{copy.rows}</span>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={block.rows || 3}
                            onChange={(event) => updateTableLayout(block.id, { rows: event.target.value })}
                          />
                        </label>
                        <label className="studio-field">
                          <span>{copy.columns}</span>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={block.columns || 3}
                            onChange={(event) => updateTableLayout(block.id, { columns: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="blog-editor-table-switches">
                        <label className="tool-chip blog-editor-switch">
                          <input
                            type="checkbox"
                            checked={block.showHorizontal !== false}
                            onChange={(event) => updateBlock(block.id, { showHorizontal: event.target.checked })}
                          />
                          <span>{copy.horizontalLines}</span>
                        </label>
                        <label className="tool-chip blog-editor-switch">
                          <input
                            type="checkbox"
                            checked={block.showVertical !== false}
                            onChange={(event) => updateBlock(block.id, { showVertical: event.target.checked })}
                          />
                          <span>{copy.verticalLines}</span>
                        </label>
                      </div>
                      <div className="blog-editor-table-editors">
                        <div>
                          <p>{copy.tableRu}</p>
                          <table
                            className={`blog-editor-table ${block.showHorizontal === false ? 'no-horizontal' : ''} ${block.showVertical === false ? 'no-vertical' : ''}`}
                          >
                            <tbody>
                              {ensureTableCells(block.ruCells, block.rows || 3, block.columns || 3).map((row, rowIndex) => (
                                <tr key={`ru-row-${rowIndex}`}>
                                  {row.map((cell, columnIndex) => (
                                    <td key={`ru-cell-${rowIndex}-${columnIndex}`}>
                                      <textarea
                                        value={cell}
                                        onChange={(event) => updateTableCell(block.id, 'ru', rowIndex, columnIndex, event.target.value)}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <p>{copy.tableEn}</p>
                          <table
                            className={`blog-editor-table ${block.showHorizontal === false ? 'no-horizontal' : ''} ${block.showVertical === false ? 'no-vertical' : ''}`}
                          >
                            <tbody>
                              {ensureTableCells(block.enCells, block.rows || 3, block.columns || 3).map((row, rowIndex) => (
                                <tr key={`en-row-${rowIndex}`}>
                                  {row.map((cell, columnIndex) => (
                                    <td key={`en-cell-${rowIndex}-${columnIndex}`}>
                                      <textarea
                                        value={cell}
                                        onChange={(event) => updateTableCell(block.id, 'en', rowIndex, columnIndex, event.target.value)}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <label className="studio-field">
                        <span>{copy.captionRu}</span>
                        <input value={block.ruCaption || ''} onChange={(event) => updateBlock(block.id, { ruCaption: event.target.value })} />
                      </label>
                      <label className="studio-field">
                        <span>{copy.captionEn}</span>
                        <input value={block.enCaption || ''} onChange={(event) => updateBlock(block.id, { enCaption: event.target.value })} />
                      </label>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>

          <aside className="blog-editor-tools">
            <span>{copy.tools}</span>
            <button type="button" className="cta-button secondary" onClick={() => addBlock(createTextBlock())}>{copy.addText}</button>
            <button type="button" className="cta-button secondary" onClick={() => imageInputRef.current?.click()}>{copy.addImage}</button>
            <button type="button" className="cta-button secondary" onClick={() => carouselInputRef.current?.click()}>{copy.addCarousel}</button>
            <button type="button" className="cta-button secondary" onClick={() => beforeAfterInputRef.current?.click()}>{copy.addBeforeAfter}</button>
            <button type="button" className="cta-button secondary" onClick={() => addBlock(createTableBlock())}>{copy.addTable}</button>
            <input ref={imageInputRef} type="file" accept="image/*,.gif" onChange={handleImageSelect} hidden />
            <input ref={carouselInputRef} type="file" accept="image/*,.gif" multiple onChange={handleCarouselSelect} hidden />
            <input ref={beforeAfterInputRef} type="file" accept="image/*,.gif" multiple onChange={handleBeforeAfterSelect} hidden />

            {selectedBlock?.type === 'text' && (
              <div className="blog-editor-tool-group">
                <button type="button" className={selectedBlock.bold ? 'tool-chip is-active' : 'tool-chip'} onClick={() => updateBlock(selectedBlock.id, { bold: !selectedBlock.bold })}>{copy.bold}</button>
                <button type="button" className={selectedBlock.italic ? 'tool-chip is-active' : 'tool-chip'} onClick={() => updateBlock(selectedBlock.id, { italic: !selectedBlock.italic })}>{copy.italic}</button>
                <button type="button" className="tool-chip" onClick={() => updateBlock(selectedBlock.id, { size: selectedBlock.size === 'hero' ? 'body' : 'hero' })}>
                  {selectedBlock.size === 'hero' ? copy.normal : copy.bigger}
                </button>
                <button type="button" className={selectedBlock.accent ? 'tool-chip is-active' : 'tool-chip'} onClick={() => updateBlock(selectedBlock.id, { accent: !selectedBlock.accent })}>{copy.color}</button>
                <button type="button" className="tool-chip" onClick={promptLink}>{copy.link}</button>
                <button type="button" className={selectedBlock.linkStyle === 'button' ? 'tool-chip is-active' : 'tool-chip'} onClick={promptButtonLink}>{copy.button}</button>
              </div>
            )}

            {selectedBlock ? (
              <div className="blog-editor-order-tools" aria-label="Block order">
                <button type="button" className="tool-chip" onClick={() => moveSelectedBlock(-1)} disabled={!canMoveSelectedUp}>
                  {copy.moveUp}
                </button>
                <button type="button" className="tool-chip" onClick={() => moveSelectedBlock(1)} disabled={!canMoveSelectedDown}>
                  {copy.moveDown}
                </button>
              </div>
            ) : null}

            {selectedBlock ? <button type="button" className="cta-button danger" onClick={deleteSelectedBlock}>{copy.delete}</button> : null}

            <div className="blog-editor-publish-divider" aria-hidden="true" />

            <div className={areTagsOpen ? 'blog-editor-tags is-open' : 'blog-editor-tags'}>
              <button type="button" className="blog-editor-tags-toggle" onClick={() => setAreTagsOpen((current) => !current)}>
                <span>{copy.tags}</span>
                <strong>{areTagsOpen ? copy.hideTags : copy.showTags}</strong>
              </button>
              {areTagsOpen && (
                <div>
                  {tags.map((tag) => (
                    <button
                      key={tag.slug}
                      type="button"
                      className={form.tags.includes(tag.slug) ? 'tag-pill is-active' : 'tag-pill'}
                      onClick={() => toggleTag(tag.slug)}
                    >
                      {tag[language]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" className="cta-button primary">{copy.publish}</button>
          </aside>
        </form>

        {contextMenu && selectedBlock?.type === 'text' ? (
          <div className="blog-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => updateBlock(selectedBlock.id, { bold: !selectedBlock.bold })}>{copy.bold}</button>
            <button type="button" onClick={() => updateBlock(selectedBlock.id, { italic: !selectedBlock.italic })}>{copy.italic}</button>
            <button type="button" onClick={promptLink}>{copy.link}</button>
            <button type="button" onClick={promptButtonLink}>{copy.button}</button>
            <button type="button" onClick={() => updateBlock(selectedBlock.id, { accent: !selectedBlock.accent })}>{copy.color}</button>
            <button type="button" onClick={() => updateBlock(selectedBlock.id, { size: selectedBlock.size === 'hero' ? 'body' : 'hero' })}>
              {selectedBlock.size === 'hero' ? copy.normal : copy.bigger}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default BlogComposerModal;
