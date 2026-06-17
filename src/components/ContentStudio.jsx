import { useEffect, useMemo, useState } from 'react';
import {
  ensureProjectPermission,
  loadProjectHandle,
  saveProjectHandle,
  supportsPersistentHandles,
} from '../utils/fileSystemAccess';

const studioText = {
  ru: {
    title: 'Content Studio',
    subtitle: 'Локальный менеджер для добавления, редактирования и удаления работ без ручного редактирования JSON.',
    support: 'Работает в Chromium-браузерах через доступ к папке проекта.',
    connect: 'Подключить папку проекта',
    connected: 'Папка проекта подключена',
    close: 'Закрыть',
    video: 'Видео',
    music: 'Музыка',
    add: 'Добавить работу',
    save: 'Сохранить изменения',
    adding: 'Сохраняем...',
    type: 'Тип контента',
    ruTitle: 'Название RU',
    enTitle: 'Название EN',
    description: 'Описание',
    channelName: 'Название канала',
    channelUrl: 'Ссылка на канал',
    videoUrl: 'Ссылка на видео',
    artistName: 'Имя исполнителя',
    artistUrl: 'Ссылка на исполнителя',
    trackUrl: 'Ссылка на трек',
    tags: 'Теги',
    featured: 'Показывать в избранном',
    date: 'Дата',
    thumbnail: 'Файл превью',
    channelAvatar: 'Файл аватарки канала',
    cover: 'Файл обложки',
    optionalPath: 'Или укажи готовый путь из public/',
    thumbnailPath: 'Например /thumbs/my-video.webp',
    avatarPath: 'Например /avatars/channel.webp',
    coverPath: 'Например /music/cover.webp',
    noFile: 'Файл не выбран',
    success: 'Работа сохранена. Лента уже обновилась, а JSON и картинки записаны в проект.',
    deleted: 'Работа удалена из проекта.',
    ownerSaved: 'Профиль дизайнера обновлён.',
    unsupported: 'Этот инструмент требует File System Access API. Открой проект в Chrome или Edge.',
    missingFolder: 'Сначала подключи корневую папку проекта.',
    requiredImage: 'Нужно выбрать файл изображения или указать готовый путь.',
    requiredField: 'Заполни обязательные поля перед сохранением.',
    sectionMain: 'Основное',
    sectionFiles: 'Файлы',
    sectionOwner: 'Профиль дизайнера',
    sectionLibrary: 'Существующие работы',
    ownerName: 'Имя дизайнера',
    ownerUrl: 'Ссылка на Telegram / сайт',
    ownerAvatar: 'Новая аватарка дизайнера',
    ownerAvatarPath: 'Или готовый путь до аватарки',
    saveOwner: 'Сохранить профиль',
    createNew: 'Новая работа',
    editing: 'Редактирование',
    deleting: 'Удаляем...',
    delete: 'Удалить проект',
    selectExisting: 'Выбери существующую карточку для редактирования или создай новую.',
    noProjects: 'Пока нет работ для редактирования.',
    note: 'Совет: Studio виден только локально или по адресу с ?studio=1, поэтому публичную витрину он не засоряет.',
    channelHint: 'Можно выбрать уже существующий канал, и ссылка с аватаркой подставятся автоматически.',
    deleteConfirm: 'Удалить этот проект из портфолио?',
  },
  en: {
    title: 'Content Studio',
    subtitle: 'Local manager for adding, editing, and deleting work without hand-editing JSON.',
    support: 'Works in Chromium browsers through project-folder access.',
    connect: 'Connect project folder',
    connected: 'Project folder connected',
    close: 'Close',
    video: 'Video',
    music: 'Music',
    add: 'Add item',
    save: 'Save changes',
    adding: 'Saving...',
    type: 'Content type',
    ruTitle: 'RU title',
    enTitle: 'EN title',
    description: 'Description',
    channelName: 'Channel name',
    channelUrl: 'Channel URL',
    videoUrl: 'Video URL',
    artistName: 'Artist name',
    artistUrl: 'Artist URL',
    trackUrl: 'Track URL',
    tags: 'Tags',
    featured: 'Mark as featured',
    date: 'Date',
    thumbnail: 'Thumbnail file',
    channelAvatar: 'Channel avatar file',
    cover: 'Cover file',
    optionalPath: 'Or use an existing path from public/',
    thumbnailPath: 'For example /thumbs/my-video.webp',
    avatarPath: 'For example /avatars/channel.webp',
    coverPath: 'For example /music/cover.webp',
    noFile: 'No file selected',
    success: 'Item saved. The feed is already updated, and the JSON plus assets were written into the project.',
    deleted: 'Item deleted from the project.',
    ownerSaved: 'Designer profile updated.',
    unsupported: 'This tool requires the File System Access API. Open the project in Chrome or Edge.',
    missingFolder: 'Connect the project root folder first.',
    requiredImage: 'Choose an image file or specify an existing path.',
    requiredField: 'Fill in all required fields before saving.',
    sectionMain: 'Main data',
    sectionFiles: 'Files',
    sectionOwner: 'Designer profile',
    sectionLibrary: 'Existing work',
    ownerName: 'Designer name',
    ownerUrl: 'Telegram / website URL',
    ownerAvatar: 'New designer avatar',
    ownerAvatarPath: 'Or use an existing avatar path',
    saveOwner: 'Save profile',
    createNew: 'New item',
    editing: 'Editing',
    deleting: 'Deleting...',
    delete: 'Delete project',
    selectExisting: 'Pick an existing card to edit or create a new one.',
    noProjects: 'No items to edit yet.',
    note: 'Tip: Studio is visible only locally or with ?studio=1, so the public showcase stays clean.',
    channelHint: 'You can pick an existing channel and the URL plus avatar will auto-fill.',
    deleteConfirm: 'Delete this project from the portfolio?',
  },
};

function createEmptyItemForm() {
  return {
    type: 'video',
    ruTitle: '',
    enTitle: '',
    channelName: '',
    description: '',
    enDescription: '',
    channelUrl: '',
    videoUrl: '',
    artistName: '',
    artistUrl: '',
    trackUrl: '',
    ratio: 'square',
    pdfPath: '',
    pdfFile: null,
    ruSectionsText: '',
    enSectionsText: '',
    blogImagePaths: '',
    blogImageFiles: [],
    galleryPath: '',
    galleryPaths: '',
    galleryFile: null,
    galleryFiles: [],
    tags: [],
    featured: false,
    createdAt: new Date().toISOString().slice(0, 10),
    thumbnailFile: null,
    channelAvatarFile: null,
    coverFile: null,
    thumbnailPath: '',
    channelAvatarPath: '',
    coverPath: '',
  };
}

function createItemFormFromItem(item) {
  return {
    type: item.type,
    ruTitle: item.ruTitle || '',
    enTitle: item.enTitle || '',
    channelName: item.channelName || '',
    description: item.description || item.ruDescription || '',
    enDescription: item.enDescription || '',
    channelUrl: item.channelUrl || '',
    videoUrl: item.videoUrl || '',
    artistName: item.artistName || '',
    artistUrl: item.artistUrl || '',
    trackUrl: item.trackUrl || '',
    ratio: item.ratio || 'square',
    pdfPath: item.pdfUrl || '',
    pdfFile: null,
    ruSectionsText: (item.ruSections || []).join('\n\n'),
    enSectionsText: (item.enSections || []).join('\n\n'),
    blogImagePaths: (item.images || []).map((image) => image.src).join('\n'),
    blogImageFiles: [],
    galleryPath: item.images?.[0]?.src || '',
    galleryPaths: (item.images || []).slice(1).map((image) => image.src).join('\n'),
    galleryFile: null,
    galleryFiles: [],
    tags: [...(item.tags || [])],
    featured: Boolean(item.featured),
    createdAt: item.createdAt || new Date().toISOString().slice(0, 10),
    thumbnailFile: null,
    channelAvatarFile: null,
    coverFile: null,
    thumbnailPath: item.thumbnail || '',
    channelAvatarPath: item.channelAvatar || '',
    coverPath: item.cover || '',
  };
}

function createOwnerForm(siteConfig) {
  return {
    name: siteConfig.owner?.name || '',
    url: siteConfig.owner?.url || '',
    avatarFile: null,
    avatarPath: siteConfig.owner?.avatar || '',
  };
}

function createHeroForm(siteConfig) {
  const sections = siteConfig.sections || {};
  return {
    eyebrowRu: siteConfig.heroEyebrow?.ru || '',
    eyebrowEn: siteConfig.heroEyebrow?.en || '',
    titleRu: siteConfig.siteName?.ru || '',
    titleEn: siteConfig.siteName?.en || '',
    taglineRu: siteConfig.siteTagline?.ru || '',
    taglineEn: siteConfig.siteTagline?.en || '',
    homeVisible: sections.home !== false,
    blogVisible: sections.blog !== false,
    galleryVisible: sections.gallery !== false,
    priceVisible: sections.price !== false,
    pluginsVisible: sections.plugins === true,
  };
}

function createTagForm(tag = {}) {
  return {
    slug: tag.slug || '',
    ru: tag.ru || '',
    en: tag.en || '',
  };
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeFileName(name) {
  return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Zа-яА-Я0-9._-]/g, '');
}

function nextId(items, prefix) {
  const max = items.reduce((highest, item) => {
    const match = String(item.id).match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]));
  }, 0);

  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

async function getNestedFileHandle(rootHandle, pathParts, create = false) {
  let currentHandle = rootHandle;

  for (let index = 0; index < pathParts.length - 1; index += 1) {
    currentHandle = await currentHandle.getDirectoryHandle(pathParts[index], { create });
  }

  return currentHandle.getFileHandle(pathParts[pathParts.length - 1], { create });
}

async function readJson(rootHandle, pathParts) {
  const fileHandle = await getNestedFileHandle(rootHandle, pathParts);
  const file = await fileHandle.getFile();
  return JSON.parse(await file.text());
}

async function writeJson(rootHandle, pathParts, data) {
  const fileHandle = await getNestedFileHandle(rootHandle, pathParts, true);
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(data, null, 2)}\n`);
  await writable.close();
}

async function copyAsset(rootHandle, file, targetDirectory, explicitPath = '') {
  const trimmedPath = explicitPath.trim();

  if (!file) {
    return trimmedPath;
  }

  const safeName = trimmedPath.startsWith(`/${targetDirectory}/`)
    ? trimmedPath.split('/').filter(Boolean).pop()
    : sanitizeFileName(file.name);
  const pathParts = ['public', targetDirectory, safeName];
  const fileHandle = await getNestedFileHandle(rootHandle, pathParts, true);
  const writable = await fileHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();

  return `/${targetDirectory}/${safeName}`;
}

async function listPublicFiles(rootHandle, targetDirectory) {
  try {
    const publicDir = await rootHandle.getDirectoryHandle('public');
    const targetDir = await publicDir.getDirectoryHandle(targetDirectory);
    const files = [];

    for await (const [name, handle] of targetDir.entries()) {
      if (handle.kind === 'file') {
        files.push(`/${targetDirectory}/${name}`);
      }
    }

    return files.sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function StudioField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  list,
  hint,
  multiline = false,
  readOnly = false,
}) {
  return (
    <label className="studio-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          rows={4}
          readOnly={readOnly}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          list={list}
          readOnly={readOnly}
        />
      )}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function AssetPicker({
  label,
  folder,
  currentPath,
  selectedFileName,
  options,
  onPathSelect,
  onFileSelect,
  language,
  accept = 'image/*',
}) {
  const folderLabel = language === 'ru' ? 'Выбрать из папки проекта' : 'Pick from project folder';
  const uploadLabel = language === 'ru' ? 'Или загрузить новый файл' : 'Or upload a new file';
  const currentPathLabel = language === 'ru' ? 'Текущий путь' : 'Current path';
  const placeholderLabel = language === 'ru' ? 'Выбери файл из папки' : 'Choose a file from the folder';
  const emptyLabel = language === 'ru' ? 'В папке пока нет файлов' : 'No files found in this folder yet';
  const noFileLabel = language === 'ru' ? 'Файл не выбран' : 'No file selected';

  return (
    <div className="studio-asset-picker studio-grid-span">
      <div className="studio-grid">
        <label className="studio-field">
          <span>{`${label}: ${folderLabel}`}</span>
          <select value={currentPath} onChange={(event) => onPathSelect(event.target.value)}>
            <option value="">{options.length > 0 ? placeholderLabel : emptyLabel}</option>
            {options.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
          <small>{`public/${folder}`}</small>
        </label>

        <label className="studio-file-field">
          <span>{`${label}: ${uploadLabel}`}</span>
          <input type="file" accept={accept} onChange={(event) => onFileSelect(event.target.files?.[0] || null)} />
          <strong>{selectedFileName || noFileLabel}</strong>
        </label>
      </div>

      <StudioField label={currentPathLabel} value={currentPath} onChange={() => {}} readOnly />
    </div>
  );
}

function MultiFilePicker({ label, selectedFiles, onFileSelect, language, accept = 'image/*' }) {
  const uploadLabel = language === 'ru' ? 'Загрузить несколько файлов' : 'Upload multiple files';
  const noFileLabel = language === 'ru' ? 'Файлы не выбраны' : 'No files selected';

  return (
    <label className="studio-file-field studio-grid-span">
      <span>{`${label}: ${uploadLabel}`}</span>
      <input
        type="file"
        accept={accept}
        multiple
        onChange={(event) => onFileSelect(Array.from(event.target.files || []))}
      />
      <strong>
        {selectedFiles?.length ? selectedFiles.map((file) => file.name).join(', ') : noFileLabel}
      </strong>
    </label>
  );
}

function ContentStudio({
  isOpen,
  language,
  tags,
  tagsConfig,
  onTagsConfigChange,
  onClose,
  projectHandle,
  onProjectHandleChange,
  siteConfig,
  onSiteConfigChange,
  videoItems,
  musicItems,
  blogItems = [],
  galleryItems = [],
  onVideoItemsChange,
  onMusicItemsChange,
  onBlogItemsChange,
  onGalleryItemsChange,
  selectedItem,
  onSelectItem,
}) {
  const copy = studioText[language];
  const availableTags = tagsConfig ?? tags;
  const showcaseCopy = language === 'ru'
    ? {
        section: 'Тексты витрины',
        eyebrowRu: 'Верхняя подпись RU',
        eyebrowEn: 'Верхняя подпись EN',
        titleRu: 'Заголовок RU',
        titleEn: 'Заголовок EN',
        taglineRu: 'Подзаголовок RU',
        taglineEn: 'Подзаголовок EN',
        sections: 'Видимость вкладок',
        tabHome: 'Показывать вкладку Главная',
        tabBlog: 'Показывать вкладку Блог',
        tabGallery: 'Показывать вкладку Дизайн',
        tabPrice: 'Показывать вкладку Прайс',
        tabPlugins: 'Показывать вкладку Плагины',
        save: 'Сохранить тексты',
        saved: 'Тексты витрины обновлены.',
      }
    : {
        section: 'Showcase copy',
        eyebrowRu: 'Eyebrow RU',
        eyebrowEn: 'Eyebrow EN',
        titleRu: 'Title RU',
        titleEn: 'Title EN',
        taglineRu: 'Tagline RU',
        taglineEn: 'Tagline EN',
        sections: 'Visible tabs',
        tabHome: 'Show Home tab',
        tabBlog: 'Show Blog tab',
        tabGallery: 'Show Design tab',
        tabPrice: 'Show Price tab',
        tabPlugins: 'Show Plugins tab',
        save: 'Save showcase copy',
        saved: 'Showcase copy updated.',
      };
  const tagEditorCopy = language === 'ru'
    ? {
        section: 'Редактор тегов',
        slug: 'Slug',
        ru: 'Тег RU',
        en: 'Тег EN',
        add: 'Добавить тег',
        save: 'Сохранить теги',
        saved: 'Теги обновлены.',
        delete: 'Убрать',
        duplicate: 'Slug тега должен быть уникальным.',
        required: 'Добавь хотя бы один заполненный тег.',
      }
    : {
        section: 'Tag editor',
        slug: 'Slug',
        ru: 'Tag RU',
        en: 'Tag EN',
        add: 'Add tag',
        save: 'Save tags',
        saved: 'Tags updated.',
        delete: 'Remove',
        duplicate: 'Each tag slug must be unique.',
        required: 'Add at least one filled tag.',
      };
  const contentTypeCopy = language === 'ru'
    ? {
        video: 'Видео',
        music: 'Музыка',
        gallery: 'Дизайн',
        blog: 'Блог',
        ruDescription: 'Описание RU',
        enDescription: 'Описание EN',
        ratio: 'Формат плитки',
        mainPhoto: 'Главное фото',
        galleryMore: 'Дополнительные фото для карусели',
        galleryPaths: 'Дополнительные пути к фото',
        galleryPathsHint: 'Каждый путь с новой строки, например /gallery/photo-2.webp',
        pdf: 'PDF-файл',
        blogCover: 'Обложка записи',
        blogImages: 'Картинки внутри записи',
        blogImagePaths: 'Пути к картинкам внутри записи',
        blogImagePathsHint: 'Каждый путь с новой строки, например /blog/process-01.webp. Картинки появятся в ленте после текста.',
        ruSections: 'Секции PDF RU',
        enSections: 'Секции PDF EN',
        sectionsHint: 'Каждый абзац через пустую строку. Это будет нативная вертикальная лента вместо чужой PDF-читалки.',
      }
    : {
        video: 'Video',
        music: 'Music',
        gallery: 'Design',
        blog: 'Blog',
        ruDescription: 'RU description',
        enDescription: 'EN description',
        ratio: 'Tile format',
        mainPhoto: 'Main photo',
        galleryMore: 'Extra carousel photos',
        galleryPaths: 'Extra photo paths',
        galleryPathsHint: 'One path per line, for example /gallery/photo-2.webp',
        pdf: 'PDF file',
        blogCover: 'Post cover',
        blogImages: 'Images inside the post',
        blogImagePaths: 'Post image paths',
        blogImagePathsHint: 'One path per line, for example /blog/process-01.webp. Images appear in the feed after the text.',
        ruSections: 'RU PDF sections',
        enSections: 'EN PDF sections',
        sectionsHint: 'Separate paragraphs with an empty line. This becomes a native vertical feed instead of an embedded PDF reader.',
      };
  const [itemForm, setItemForm] = useState(createEmptyItemForm);
  const [ownerForm, setOwnerForm] = useState(() => createOwnerForm(siteConfig));
  const [heroForm, setHeroForm] = useState(() => createHeroForm(siteConfig));
  const [tagForms, setTagForms] = useState(() => availableTags.map((tag) => createTagForm(tag)));
  const [openSections, setOpenSections] = useState({
    showcase: false,
    tags: false,
    owner: false,
    item: true,
  });
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isSavingOwner, setIsSavingOwner] = useState(false);
  const [isSavingHero, setIsSavingHero] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [supportsFileSystemAccess, setSupportsFileSystemAccess] = useState(false);
  const [isRestoringHandle, setIsRestoringHandle] = useState(false);
  const [assetOptions, setAssetOptions] = useState({
    thumbs: [],
    avatars: [],
    music: [],
    owner: [],
    blog: [],
    gallery: [],
  });

  useEffect(() => {
    setSupportsFileSystemAccess(typeof window !== 'undefined' && 'showDirectoryPicker' in window);
  }, []);

  useEffect(() => {
    if (!supportsFileSystemAccess || projectHandle || !supportsPersistentHandles()) {
      return undefined;
    }

    let isCancelled = false;

    async function restoreHandle() {
      setIsRestoringHandle(true);

      try {
        const savedHandle = await loadProjectHandle();
        if (!savedHandle) {
          return;
        }

        const hasPermission = await ensureProjectPermission(savedHandle);
        if (!isCancelled && hasPermission) {
          onProjectHandleChange(savedHandle);
          setStatus({
            type: 'success',
            message:
              language === 'ru'
                ? `Папка проекта подключена: ${savedHandle.name}`
                : `Project folder connected: ${savedHandle.name}`,
          });
        }
      } catch {
        // If the browser forgot the handle or permission, manual connection remains available.
      } finally {
        if (!isCancelled) {
          setIsRestoringHandle(false);
        }
      }
    }

    restoreHandle();

    return () => {
      isCancelled = true;
    };
  }, [language, onProjectHandleChange, projectHandle, supportsFileSystemAccess]);

  useEffect(() => {
    setOwnerForm(createOwnerForm(siteConfig));
  }, [siteConfig]);

  useEffect(() => {
    setHeroForm(createHeroForm(siteConfig));
  }, [siteConfig]);

  useEffect(() => {
    setTagForms(availableTags.map((tag) => createTagForm(tag)));
  }, [availableTags]);

  useEffect(() => {
    setItemForm(selectedItem ? createItemFormFromItem(selectedItem) : createEmptyItemForm());
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setOpenSections((current) => ({ ...current, item: true }));
  }, [selectedItem]);

  useEffect(() => {
    if (!projectHandle) {
      setAssetOptions({ thumbs: [], avatars: [], music: [], owner: [], blog: [], gallery: [] });
      return undefined;
    }

    let isCancelled = false;

    async function loadAssets() {
      const [thumbs, avatars, music, owner, blog, gallery] = await Promise.all([
        listPublicFiles(projectHandle, 'thumbs'),
        listPublicFiles(projectHandle, 'avatars'),
        listPublicFiles(projectHandle, 'music'),
        listPublicFiles(projectHandle, 'owner'),
        listPublicFiles(projectHandle, 'blog'),
        listPublicFiles(projectHandle, 'gallery'),
      ]);

      if (!isCancelled) {
        setAssetOptions({ thumbs, avatars, music, owner, blog, gallery });
      }
    }

    loadAssets();

    return () => {
      isCancelled = true;
    };
  }, [projectHandle]);

  const channelOptions = useMemo(() => {
    const unique = new Map();

    videoItems.forEach((item) => {
      const key = normalize(item.channelName);
      if (!key || unique.has(key)) {
        return;
      }

      unique.set(key, {
        channelName: item.channelName,
        channelUrl: item.channelUrl,
        channelAvatar: item.channelAvatar,
      });
    });

    return Array.from(unique.values()).sort((left, right) => left.channelName.localeCompare(right.channelName));
  }, [videoItems]);

  const isEditing = Boolean(selectedItem);
  const isVideo = itemForm.type === 'video';
  const isMusic = itemForm.type === 'music';
  const isGallery = itemForm.type === 'gallery';
  const isBlog = itemForm.type === 'blog';
  const activeTypeLabel = contentTypeCopy[itemForm.type] || copy.video;

  function updateItemField(field, value) {
    setItemForm((current) => ({ ...current, [field]: value }));
  }

  function updateOwnerField(field, value) {
    setOwnerForm((current) => ({ ...current, [field]: value }));
  }

  function updateHeroField(field, value) {
    setHeroForm((current) => ({ ...current, [field]: value }));
  }

  function updateTagField(index, field, value) {
    setTagForms((current) =>
      current.map((tag, tagIndex) =>
        tagIndex === index ? { ...tag, [field]: value } : tag,
      ),
    );
  }

  function addTagForm() {
    setTagForms((current) => [...current, createTagForm()]);
  }

  function removeTagForm(index) {
    setTagForms((current) => current.filter((_, tagIndex) => tagIndex !== index));
  }

  function toggleSection(sectionKey) {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }

  function handleAssetFileSelect(fileField, pathField, folder, file) {
    setItemForm((current) => ({
      ...current,
      [fileField]: file,
      [pathField]: file ? `/${folder}/${sanitizeFileName(file.name)}` : current[pathField],
    }));
  }

  function handleGalleryFilesSelect(files) {
    setItemForm((current) => {
      const generatedPaths = files.map((file) => `/gallery/${sanitizeFileName(file.name)}`);
      const existingPaths = current.galleryPaths
        .split('\n')
        .map((path) => path.trim())
        .filter(Boolean);

      return {
        ...current,
        galleryFiles: files,
        galleryPaths: Array.from(new Set([...existingPaths, ...generatedPaths])).join('\n'),
      };
    });
  }

  function handleBlogImageFilesSelect(files) {
    setItemForm((current) => {
      const generatedPaths = files.map((file) => `/blog/${sanitizeFileName(file.name)}`);
      const existingPaths = current.blogImagePaths
        .split('\n')
        .map((path) => path.trim())
        .filter(Boolean);

      return {
        ...current,
        blogImageFiles: files,
        blogImagePaths: Array.from(new Set([...existingPaths, ...generatedPaths])).join('\n'),
      };
    });
  }

  function handleOwnerAssetFileSelect(file) {
    setOwnerForm((current) => ({
      ...current,
      avatarFile: file,
      avatarPath: file ? `/owner/${sanitizeFileName(file.name)}` : current.avatarPath,
    }));
  }

  function toggleTag(slug) {
    setItemForm((current) => ({
      ...current,
      tags: current.tags.includes(slug)
        ? current.tags.filter((item) => item !== slug)
        : [...current.tags, slug],
    }));
  }

  function startCreatingNewItem() {
    onSelectItem(null);
    setStatus({ type: 'idle', message: '' });
  }

  function syncChannelFields(channelName) {
    updateItemField('channelName', channelName);

    const match = channelOptions.find((channel) => normalize(channel.channelName) === normalize(channelName));
    if (!match) {
      return;
    }

    setItemForm((current) => ({
      ...current,
      channelName,
      channelUrl: match.channelUrl || current.channelUrl,
      channelAvatarPath: match.channelAvatar || current.channelAvatarPath,
    }));
  }

  async function handleConnectFolder() {
    try {
      const handle = await window.showDirectoryPicker();
      onProjectHandleChange(handle);
      if (supportsPersistentHandles()) {
        await saveProjectHandle(handle);
      }
      setStatus({ type: 'success', message: `${copy.connected}: ${handle.name}` });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setStatus({ type: 'error', message: error.message });
      }
    }
  }

  function validateItemForm() {
    if (!projectHandle) {
      return copy.missingFolder;
    }

    if (!itemForm.ruTitle.trim() || !itemForm.enTitle.trim() || !itemForm.createdAt) {
      return copy.requiredField;
    }

    if (isVideo) {
      if (!itemForm.channelName.trim() || !itemForm.channelUrl.trim() || !itemForm.videoUrl.trim()) {
        return copy.requiredField;
      }

      if (!itemForm.thumbnailPath.trim()) {
        return copy.requiredImage;
      }
    } else if (isMusic) {
      if (!itemForm.artistName.trim() || !itemForm.artistUrl.trim() || !itemForm.trackUrl.trim()) {
        return copy.requiredField;
      }

      if (!itemForm.coverPath.trim()) {
        return copy.requiredImage;
      }
    } else if (isGallery) {
      if (!itemForm.galleryPath.trim() && !itemForm.galleryPaths.trim() && itemForm.galleryFiles.length === 0) {
        return copy.requiredImage;
      }
    } else if (isBlog) {
      if (!itemForm.pdfPath.trim() && !itemForm.pdfFile) {
        return copy.requiredField;
      }
    }

    return null;
  }

  function validateTagForms() {
    if (!projectHandle) {
      return copy.missingFolder;
    }

    const cleanedTags = tagForms
      .map((tag) => ({
        slug: tag.slug.trim(),
        ru: tag.ru.trim(),
        en: tag.en.trim(),
      }))
      .filter((tag) => tag.slug || tag.ru || tag.en);

    if (cleanedTags.length === 0) {
      return tagEditorCopy.required;
    }

    const hasInvalidTag = cleanedTags.some((tag) => !tag.slug || !tag.ru || !tag.en);
    if (hasInvalidTag) {
      return copy.requiredField;
    }

    const normalizedSlugs = cleanedTags.map((tag) => normalize(tag.slug));
    if (new Set(normalizedSlugs).size !== normalizedSlugs.length) {
      return tagEditorCopy.duplicate;
    }

    return null;
  }

  async function handleSaveOwner(event) {
    event.preventDefault();

    if (!projectHandle) {
      setStatus({ type: 'error', message: copy.missingFolder });
      return;
    }

    if (!ownerForm.name.trim() || !ownerForm.url.trim()) {
      setStatus({ type: 'error', message: copy.requiredField });
      return;
    }

    setIsSavingOwner(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const avatarPath = ownerForm.avatarFile
        ? await copyAsset(projectHandle, ownerForm.avatarFile, 'owner', ownerForm.avatarPath)
        : ownerForm.avatarPath.trim();

      const nextConfig = {
        ...siteConfig,
        owner: {
          ...siteConfig.owner,
          name: ownerForm.name.trim(),
          url: ownerForm.url.trim(),
          avatar: avatarPath,
        },
      };

      await writeJson(projectHandle, ['src', 'data', 'siteConfig.json'], nextConfig);
      onSiteConfigChange(nextConfig);
      setOwnerForm((current) => ({
        ...current,
        avatarFile: null,
        avatarPath,
      }));
      setStatus({ type: 'success', message: copy.ownerSaved });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSavingOwner(false);
    }
  }

  async function handleSaveHero(event) {
    event.preventDefault();

    if (!projectHandle) {
      setStatus({ type: 'error', message: copy.missingFolder });
      return;
    }

    if (
      !heroForm.eyebrowRu.trim()
      || !heroForm.eyebrowEn.trim()
      || !heroForm.titleRu.trim()
      || !heroForm.titleEn.trim()
      || !heroForm.taglineRu.trim()
      || !heroForm.taglineEn.trim()
    ) {
      setStatus({ type: 'error', message: copy.requiredField });
      return;
    }

    setIsSavingHero(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const nextConfig = {
        ...siteConfig,
        heroEyebrow: {
          ru: heroForm.eyebrowRu.trim(),
          en: heroForm.eyebrowEn.trim(),
        },
        siteName: {
          ru: heroForm.titleRu.trim(),
          en: heroForm.titleEn.trim(),
        },
        siteTagline: {
          ru: heroForm.taglineRu.trim(),
          en: heroForm.taglineEn.trim(),
        },
        sections: {
          ...(siteConfig.sections || {}),
          home: heroForm.homeVisible,
          blog: heroForm.blogVisible,
          gallery: heroForm.galleryVisible,
          price: heroForm.priceVisible,
          plugins: heroForm.pluginsVisible,
        },
      };

      await writeJson(projectHandle, ['src', 'data', 'siteConfig.json'], nextConfig);
      onSiteConfigChange(nextConfig);
      setStatus({ type: 'success', message: showcaseCopy.saved });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSavingHero(false);
    }
  }

  async function handleSaveTags(event) {
    event.preventDefault();

    const validationMessage = validateTagForms();
    if (validationMessage) {
      setStatus({ type: 'error', message: validationMessage });
      return;
    }

    setIsSavingTags(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const nextTags = tagForms
        .map((tag) => ({
          slug: tag.slug.trim(),
          ru: tag.ru.trim(),
          en: tag.en.trim(),
        }))
        .filter((tag) => tag.slug && tag.ru && tag.en);

      await writeJson(projectHandle, ['src', 'data', 'tags.json'], nextTags);
      onTagsConfigChange(nextTags);
      setItemForm((current) => ({
        ...current,
        tags: current.tags.filter((slug) => nextTags.some((tag) => tag.slug === slug)),
      }));
      setStatus({ type: 'success', message: tagEditorCopy.saved });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSavingTags(false);
    }
  }

  async function handleSaveItem(event) {
    event.preventDefault();

    const validationMessage = validateItemForm();
    if (validationMessage) {
      setStatus({ type: 'error', message: validationMessage });
      return;
    }

    setIsSavingItem(true);
    setStatus({ type: 'idle', message: '' });

    try {
      let collectionPath = ['src', 'data', 'videos.json'];
      let currentData = [];
      let nextItem = null;
      let updateCollection = onVideoItemsChange;

      if (isVideo) {
        collectionPath = ['src', 'data', 'videos.json'];
        currentData = await readJson(projectHandle, collectionPath);
        updateCollection = onVideoItemsChange;

        const thumbnailPath = await copyAsset(projectHandle, itemForm.thumbnailFile, 'thumbs', itemForm.thumbnailPath);
        const optionalAvatarPath = itemForm.channelAvatarFile
          ? await copyAsset(projectHandle, itemForm.channelAvatarFile, 'avatars', itemForm.channelAvatarPath)
          : itemForm.channelAvatarPath.trim() || '/avatars/placeholder-channel.svg';

        nextItem = {
          id: isEditing ? selectedItem.id : nextId(videoItems, 'video'),
          type: 'video',
          ruTitle: itemForm.ruTitle.trim(),
          enTitle: itemForm.enTitle.trim(),
          description: itemForm.description.trim(),
          channelName: itemForm.channelName.trim(),
          channelUrl: itemForm.channelUrl.trim(),
          channelAvatar: optionalAvatarPath,
          videoUrl: itemForm.videoUrl.trim(),
          thumbnail: thumbnailPath,
          tags: itemForm.tags,
          featured: itemForm.featured,
          createdAt: itemForm.createdAt,
        };
      }

      if (isMusic) {
        collectionPath = ['src', 'data', 'music.json'];
        currentData = await readJson(projectHandle, collectionPath);
        updateCollection = onMusicItemsChange;

        const coverPath = await copyAsset(projectHandle, itemForm.coverFile, 'music', itemForm.coverPath);
        nextItem = {
          id: isEditing ? selectedItem.id : nextId(musicItems, 'music'),
          type: 'music',
          ruTitle: itemForm.ruTitle.trim(),
          enTitle: itemForm.enTitle.trim(),
          description: itemForm.description.trim(),
          artistName: itemForm.artistName.trim(),
          artistUrl: itemForm.artistUrl.trim(),
          trackUrl: itemForm.trackUrl.trim(),
          cover: coverPath,
          tags: itemForm.tags,
          featured: itemForm.featured,
          createdAt: itemForm.createdAt,
        };
      }

      if (isGallery) {
        collectionPath = ['src', 'data', 'gallery.json'];
        currentData = await readJson(projectHandle, collectionPath);
        updateCollection = onGalleryItemsChange;

        const mainPath = await copyAsset(projectHandle, itemForm.galleryFile, 'gallery', itemForm.galleryPath);
        const uploadedPaths = await Promise.all(
          itemForm.galleryFiles.map((file) => copyAsset(projectHandle, file, 'gallery', '')),
        );
        const typedPaths = itemForm.galleryPaths
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean);
        const imagePaths = Array.from(new Set([mainPath, ...typedPaths, ...uploadedPaths].filter(Boolean)));

        nextItem = {
          id: isEditing ? selectedItem.id : nextId(galleryItems, 'gallery'),
          ruTitle: itemForm.ruTitle.trim(),
          enTitle: itemForm.enTitle.trim(),
          ruDescription: itemForm.description.trim(),
          enDescription: itemForm.enDescription.trim() || itemForm.description.trim(),
          ratio: itemForm.ratio || 'square',
          images: imagePaths.map((src) => ({
            src,
            ruAlt: itemForm.ruTitle.trim(),
            enAlt: itemForm.enTitle.trim(),
          })),
          createdAt: itemForm.createdAt,
        };
      }

      if (isBlog) {
        collectionPath = ['src', 'data', 'blog.json'];
        currentData = await readJson(projectHandle, collectionPath);
        updateCollection = onBlogItemsChange;

        const pdfUrl = await copyAsset(projectHandle, itemForm.pdfFile, 'blog', itemForm.pdfPath);
        const coverPath = itemForm.coverFile
          ? await copyAsset(projectHandle, itemForm.coverFile, 'blog', itemForm.coverPath)
          : itemForm.coverPath.trim() || '/blog/pdf-cover.svg';
        const ruSections = itemForm.ruSectionsText.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
        const enSections = itemForm.enSectionsText.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
        const uploadedImages = await Promise.all(
          itemForm.blogImageFiles.map((file) => copyAsset(projectHandle, file, 'blog', '')),
        );
        const typedImages = itemForm.blogImagePaths
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean);
        const blogImages = Array.from(new Set([...typedImages, ...uploadedImages].filter(Boolean)));

        nextItem = {
          id: isEditing ? selectedItem.id : nextId(blogItems, 'blog'),
          ruTitle: itemForm.ruTitle.trim(),
          enTitle: itemForm.enTitle.trim(),
          ruDescription: itemForm.description.trim(),
          enDescription: itemForm.enDescription.trim() || itemForm.description.trim(),
          ...(ruSections.length ? { ruSections } : {}),
          ...(enSections.length ? { enSections } : {}),
          ...(blogImages.length
            ? {
                images: blogImages.map((src) => ({
                  src,
                  ratio: 'wide',
                  ruAlt: itemForm.ruTitle.trim(),
                  enAlt: itemForm.enTitle.trim(),
                })),
              }
            : {}),
          pdfUrl,
          cover: coverPath,
          tags: itemForm.tags,
          featured: itemForm.featured,
          createdAt: itemForm.createdAt,
        };
      }

      let nextData;
      if (isEditing) {
        nextData = currentData.map((item, index) => (index === selectedItem._sourceIndex ? nextItem : item));
      } else {
        nextData = [...currentData, nextItem];
      }

      await writeJson(projectHandle, collectionPath, nextData);
      updateCollection?.(nextData);
      setStatus({ type: 'success', message: copy.success });

      if (isEditing) {
        return;
      }

      onSelectItem(null);
      setItemForm(createEmptyItemForm());
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSavingItem(false);
    }
  }

  async function handleDeleteItem() {
    if (!selectedItem) {
      return;
    }

    if (!projectHandle) {
      setStatus({ type: 'error', message: copy.missingFolder });
      return;
    }

    if (!window.confirm(copy.deleteConfirm)) {
      return;
    }

    setIsDeleting(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const collectionMap = {
        video: { path: ['src', 'data', 'videos.json'], update: onVideoItemsChange },
        music: { path: ['src', 'data', 'music.json'], update: onMusicItemsChange },
        blog: { path: ['src', 'data', 'blog.json'], update: onBlogItemsChange },
        gallery: { path: ['src', 'data', 'gallery.json'], update: onGalleryItemsChange },
      };
      const collection = collectionMap[selectedItem.type] || collectionMap.video;
      const currentData = await readJson(projectHandle, collection.path);
      const nextData = currentData.filter((_, index) => index !== selectedItem._sourceIndex);

      await writeJson(projectHandle, collection.path, nextData);
      collection.update?.(nextData);

      onSelectItem(null);
      setItemForm(createEmptyItemForm());
      setStatus({ type: 'success', message: copy.deleted });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsDeleting(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop studio-backdrop" role="presentation" onClick={onClose}>
      <aside className="studio-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="studio-header">
          <div>
            <p className="eyebrow">{copy.title}</p>
            <h2>{copy.subtitle}</h2>
            <p className="studio-note">{copy.support}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        {!supportsFileSystemAccess ? (
          <div className="studio-alert error studio-alert-spaced">{copy.unsupported}</div>
        ) : (
          <>
            <div className="studio-toolbar">
              <button type="button" className="cta-button secondary" onClick={handleConnectFolder}>
                {copy.connect}
              </button>
              <div className={projectHandle ? 'studio-chip success' : 'studio-chip'}>
                {projectHandle
                  ? `${copy.connected}: ${projectHandle.name}`
                  : isRestoringHandle
                    ? (language === 'ru' ? 'Пробуем восстановить доступ...' : 'Restoring access...')
                    : copy.missingFolder}
              </div>
              {isEditing && (
                <button type="button" className="tag-pill" onClick={startCreatingNewItem}>
                  {copy.createNew}
                </button>
              )}
            </div>
            <p className="studio-note compact studio-toolbar-note">
              {language === 'ru'
                ? 'После первого выбора Studio постарается сама помнить эту папку.'
                : 'After the first selection, Studio will try to remember this folder automatically.'}
            </p>

            <div className="studio-form">
              {status.message && <div className={status.type === 'error' ? 'studio-alert error' : 'studio-alert success'}>{status.message}</div>}

              <section className="studio-section surface-subpanel">
                <button
                  type="button"
                  className="studio-section-toggle"
                  onClick={() => toggleSection('showcase')}
                  aria-expanded={openSections.showcase}
                >
                  <span className="studio-section-toggle-labels">
                    <span>{showcaseCopy.section}</span>
                  </span>
                  <span className={openSections.showcase ? 'studio-section-icon is-open' : 'studio-section-icon'} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z" fill="currentColor" />
                    </svg>
                  </span>
                </button>
                {openSections.showcase && (
                  <div className="studio-section-body">
                    <form className="studio-grid" onSubmit={handleSaveHero}>
                      <StudioField
                        label={showcaseCopy.eyebrowRu}
                        value={heroForm.eyebrowRu}
                        onChange={(value) => updateHeroField('eyebrowRu', value)}
                        required
                      />
                      <StudioField
                        label={showcaseCopy.eyebrowEn}
                        value={heroForm.eyebrowEn}
                        onChange={(value) => updateHeroField('eyebrowEn', value)}
                        required
                      />
                      <StudioField
                        label={showcaseCopy.titleRu}
                        value={heroForm.titleRu}
                        onChange={(value) => updateHeroField('titleRu', value)}
                        required
                      />
                      <StudioField
                        label={showcaseCopy.titleEn}
                        value={heroForm.titleEn}
                        onChange={(value) => updateHeroField('titleEn', value)}
                        required
                      />
                      <div className="studio-grid-span">
                        <StudioField
                          label={showcaseCopy.taglineRu}
                          value={heroForm.taglineRu}
                          onChange={(value) => updateHeroField('taglineRu', value)}
                          multiline
                          required
                        />
                      </div>
                      <div className="studio-grid-span">
                        <StudioField
                          label={showcaseCopy.taglineEn}
                          value={heroForm.taglineEn}
                          onChange={(value) => updateHeroField('taglineEn', value)}
                          multiline
                          required
                        />
                      </div>
                      <div className="studio-grid-span">
                        <div className="studio-section slim">
                          <div className="studio-section-head">
                            <span>{showcaseCopy.sections}</span>
                          </div>
                          <div className="studio-grid">
                            <label className="studio-checkbox">
                              <input
                                type="checkbox"
                                checked={heroForm.homeVisible}
                                onChange={(event) => updateHeroField('homeVisible', event.target.checked)}
                              />
                              <span>{showcaseCopy.tabHome}</span>
                            </label>
                            <label className="studio-checkbox">
                              <input
                                type="checkbox"
                                checked={heroForm.blogVisible}
                                onChange={(event) => updateHeroField('blogVisible', event.target.checked)}
                              />
                              <span>{showcaseCopy.tabBlog}</span>
                            </label>
                            <label className="studio-checkbox">
                              <input
                                type="checkbox"
                                checked={heroForm.galleryVisible}
                                onChange={(event) => updateHeroField('galleryVisible', event.target.checked)}
                              />
                              <span>{showcaseCopy.tabGallery}</span>
                            </label>
                            <label className="studio-checkbox">
                              <input
                                type="checkbox"
                                checked={heroForm.priceVisible}
                                onChange={(event) => updateHeroField('priceVisible', event.target.checked)}
                              />
                              <span>{showcaseCopy.tabPrice}</span>
                            </label>
                            <label className="studio-checkbox">
                              <input
                                type="checkbox"
                                checked={heroForm.pluginsVisible}
                                onChange={(event) => updateHeroField('pluginsVisible', event.target.checked)}
                              />
                              <span>{showcaseCopy.tabPlugins}</span>
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="studio-inline-actions studio-grid-span">
                        <button type="submit" className="cta-button secondary" disabled={isSavingHero}>
                          {isSavingHero ? copy.adding : showcaseCopy.save}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </section>

              <section className="studio-section surface-subpanel">
                <button
                  type="button"
                  className="studio-section-toggle"
                  onClick={() => toggleSection('tags')}
                  aria-expanded={openSections.tags}
                >
                  <span className="studio-section-toggle-labels">
                    <span>{tagEditorCopy.section}</span>
                  </span>
                  <span className={openSections.tags ? 'studio-section-icon is-open' : 'studio-section-icon'} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z" fill="currentColor" />
                    </svg>
                  </span>
                </button>
                {openSections.tags && (
                  <div className="studio-section-body">
                    <form onSubmit={handleSaveTags}>
                  <div className="studio-tag-editor">
                    {tagForms.map((tag, index) => (
                      <div key={`${tag.slug || 'new'}-${index}`} className="studio-tag-row">
                        <StudioField
                          label={tagEditorCopy.slug}
                          value={tag.slug}
                          onChange={(value) => updateTagField(index, 'slug', value)}
                          placeholder="gaming"
                        />
                        <StudioField
                          label={tagEditorCopy.ru}
                          value={tag.ru}
                          onChange={(value) => updateTagField(index, 'ru', value)}
                          placeholder="Гейминг"
                        />
                        <StudioField
                          label={tagEditorCopy.en}
                          value={tag.en}
                          onChange={(value) => updateTagField(index, 'en', value)}
                          placeholder="Gaming"
                        />
                        <button
                          type="button"
                          className="cta-button danger studio-tag-remove"
                          onClick={() => removeTagForm(index)}
                        >
                          {tagEditorCopy.delete}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="studio-inline-actions studio-grid-span studio-tag-actions">
                    <button type="button" className="tag-pill" onClick={addTagForm}>
                      {tagEditorCopy.add}
                    </button>
                    <button type="submit" className="cta-button secondary" disabled={isSavingTags}>
                      {isSavingTags ? copy.adding : tagEditorCopy.save}
                    </button>
                  </div>
                </form>
                  </div>
                )}
              </section>

              <section className="studio-section surface-subpanel">
                <button
                  type="button"
                  className="studio-section-toggle"
                  onClick={() => toggleSection('owner')}
                  aria-expanded={openSections.owner}
                >
                  <span className="studio-section-toggle-labels">
                    <span>{copy.sectionOwner}</span>
                  </span>
                  <span className={openSections.owner ? 'studio-section-icon is-open' : 'studio-section-icon'} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z" fill="currentColor" />
                    </svg>
                  </span>
                </button>
                {openSections.owner && (
                  <div className="studio-section-body">
                    <form className="studio-grid" onSubmit={handleSaveOwner}>
                      <StudioField label={copy.ownerName} value={ownerForm.name} onChange={(value) => updateOwnerField('name', value)} required />
                      <StudioField label={copy.ownerUrl} value={ownerForm.url} onChange={(value) => updateOwnerField('url', value)} required />
                      <AssetPicker
                        label={copy.ownerAvatar || 'Owner avatar'}
                        folder="owner"
                        currentPath={ownerForm.avatarPath}
                        selectedFileName={ownerForm.avatarFile?.name}
                        options={assetOptions.owner}
                        onPathSelect={(value) =>
                          setOwnerForm((current) => ({ ...current, avatarPath: value, avatarFile: null }))
                        }
                        onFileSelect={handleOwnerAssetFileSelect}
                        language={language}
                      />
                      <div className="studio-inline-actions studio-grid-span">
                        <button type="submit" className="cta-button secondary" disabled={isSavingOwner}>
                          {isSavingOwner ? copy.adding : copy.saveOwner}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </section>

              <section className="studio-section surface-subpanel">
                <button
                  type="button"
                  className="studio-section-toggle"
                  onClick={() => toggleSection('item')}
                  aria-expanded={openSections.item}
                >
                  <span className="studio-section-toggle-labels">
                    <span>{isEditing ? copy.editing : copy.add}</span>
                    <span className="studio-section-meta">{activeTypeLabel}</span>
                  </span>
                  <span className={openSections.item ? 'studio-section-icon is-open' : 'studio-section-icon'} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z" fill="currentColor" />
                    </svg>
                  </span>
                </button>

                {openSections.item && (
                  <div className="studio-section-body">
                    {!isEditing && (
                      <>
                    <p className="studio-note compact">
                      {language === 'ru'
                        ? 'Открыто создание новой работы. Для редактирования существующей открой карточку и нажми карандаш.'
                        : 'New item mode is open. To edit an existing one, open its card and press the pencil.'}
                    </p>
                    <div className="studio-type-toggle studio-top-gap">
                      {['video', 'music', 'gallery'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={itemForm.type === type ? 'tag-pill is-active' : 'tag-pill'}
                          onClick={() => updateItemField('type', type)}
                        >
                          {contentTypeCopy[type]}
                        </button>
                      ))}
                    </div>
                      </>
                    )}

                    <form onSubmit={handleSaveItem}>
                  <section className="studio-section slim">
                    <div className="studio-section-head">
                      <span>{copy.sectionMain}</span>
                    </div>
                    <div className="studio-grid">
                      <StudioField label={copy.ruTitle} value={itemForm.ruTitle} onChange={(value) => updateItemField('ruTitle', value)} required />
                      <StudioField label={copy.enTitle} value={itemForm.enTitle} onChange={(value) => updateItemField('enTitle', value)} required />

                      {(isGallery || isBlog) ? (
                        <>
                          <div className="studio-grid-span">
                            <StudioField
                              label={contentTypeCopy.ruDescription}
                              value={itemForm.description}
                              onChange={(value) => updateItemField('description', value)}
                              multiline
                            />
                          </div>
                          <div className="studio-grid-span">
                            <StudioField
                              label={contentTypeCopy.enDescription}
                              value={itemForm.enDescription}
                              onChange={(value) => updateItemField('enDescription', value)}
                              multiline
                            />
                          </div>
                        </>
                      ) : (
                        <div className="studio-grid-span">
                          <StudioField
                            label={copy.description}
                            value={itemForm.description}
                            onChange={(value) => updateItemField('description', value)}
                            multiline
                          />
                        </div>
                      )}

                      {isVideo && (
                        <>
                          <StudioField
                            label={copy.channelName}
                            value={itemForm.channelName}
                            onChange={syncChannelFields}
                            required
                            list="studio-channel-options"
                            hint={copy.channelHint}
                          />
                          <StudioField label={copy.channelUrl} value={itemForm.channelUrl} onChange={(value) => updateItemField('channelUrl', value)} required />
                          <StudioField label={copy.videoUrl} value={itemForm.videoUrl} onChange={(value) => updateItemField('videoUrl', value)} required />
                        </>
                      )}

                      {isMusic && (
                        <>
                          <StudioField label={copy.artistName} value={itemForm.artistName} onChange={(value) => updateItemField('artistName', value)} required />
                          <StudioField label={copy.artistUrl} value={itemForm.artistUrl} onChange={(value) => updateItemField('artistUrl', value)} required />
                          <StudioField label={copy.trackUrl} value={itemForm.trackUrl} onChange={(value) => updateItemField('trackUrl', value)} required />
                        </>
                      )}

                      {isGallery && (
                        <label className="studio-field">
                          <span>{contentTypeCopy.ratio}</span>
                          <select value={itemForm.ratio} onChange={(event) => updateItemField('ratio', event.target.value)}>
                            <option value="wide">wide 16:9</option>
                            <option value="landscape">landscape 3:2</option>
                            <option value="square">square 1:1</option>
                            <option value="portrait">portrait 4:5</option>
                          </select>
                        </label>
                      )}

                      {isBlog && (
                        <>
                          <div className="studio-grid-span">
                            <StudioField
                              label={contentTypeCopy.ruSections}
                              value={itemForm.ruSectionsText}
                              onChange={(value) => updateItemField('ruSectionsText', value)}
                              hint={contentTypeCopy.sectionsHint}
                              multiline
                            />
                          </div>
                          <div className="studio-grid-span">
                            <StudioField
                              label={contentTypeCopy.enSections}
                              value={itemForm.enSectionsText}
                              onChange={(value) => updateItemField('enSectionsText', value)}
                              hint={contentTypeCopy.sectionsHint}
                              multiline
                            />
                          </div>
                        </>
                      )}

                      <StudioField label={copy.date} type="date" value={itemForm.createdAt} onChange={(value) => updateItemField('createdAt', value)} required />
                      <label className="studio-checkbox">
                        <input
                          type="checkbox"
                          checked={itemForm.featured}
                          onChange={(event) => updateItemField('featured', event.target.checked)}
                        />
                        <span>{copy.featured}</span>
                      </label>
                    </div>
                  </section>

                  <section className="studio-section slim">
                    <div className="studio-section-head">
                      <span>{copy.tags}</span>
                    </div>
                    <div className="studio-tag-cloud">
                      {availableTags.map((tag) => (
                        <button
                          key={tag.slug}
                          type="button"
                          className={itemForm.tags.includes(tag.slug) ? 'tag-pill is-active' : 'tag-pill'}
                          onClick={() => toggleTag(tag.slug)}
                        >
                          {tag[language]}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="studio-section slim">
                    <div className="studio-section-head">
                      <span>{copy.sectionFiles}</span>
                    </div>
                    {isVideo && (
                      <>
                        <AssetPicker
                          label={copy.thumbnail}
                          folder="thumbs"
                          currentPath={itemForm.thumbnailPath}
                          selectedFileName={itemForm.thumbnailFile?.name}
                          options={assetOptions.thumbs}
                          onPathSelect={(value) =>
                            setItemForm((current) => ({ ...current, thumbnailPath: value, thumbnailFile: null }))
                          }
                          onFileSelect={(file) => handleAssetFileSelect('thumbnailFile', 'thumbnailPath', 'thumbs', file)}
                          language={language}
                        />
                        <AssetPicker
                          label={copy.channelAvatar}
                          folder="avatars"
                          currentPath={itemForm.channelAvatarPath}
                          selectedFileName={itemForm.channelAvatarFile?.name}
                          options={assetOptions.avatars}
                          onPathSelect={(value) =>
                            setItemForm((current) => ({ ...current, channelAvatarPath: value, channelAvatarFile: null }))
                          }
                          onFileSelect={(file) => handleAssetFileSelect('channelAvatarFile', 'channelAvatarPath', 'avatars', file)}
                          language={language}
                        />
                      </>
                    )}

                    {isMusic && (
                      <AssetPicker
                        label={copy.cover}
                        folder="music"
                        currentPath={itemForm.coverPath}
                        selectedFileName={itemForm.coverFile?.name}
                        options={assetOptions.music}
                        onPathSelect={(value) =>
                          setItemForm((current) => ({ ...current, coverPath: value, coverFile: null }))
                        }
                        onFileSelect={(file) => handleAssetFileSelect('coverFile', 'coverPath', 'music', file)}
                        language={language}
                      />
                    )}

                    {isGallery && (
                      <>
                        <AssetPicker
                          label={contentTypeCopy.mainPhoto}
                          folder="gallery"
                          currentPath={itemForm.galleryPath}
                          selectedFileName={itemForm.galleryFile?.name}
                          options={assetOptions.gallery}
                          onPathSelect={(value) =>
                            setItemForm((current) => ({ ...current, galleryPath: value, galleryFile: null }))
                          }
                          onFileSelect={(file) => handleAssetFileSelect('galleryFile', 'galleryPath', 'gallery', file)}
                          language={language}
                        />
                        <MultiFilePicker
                          label={contentTypeCopy.galleryMore}
                          selectedFiles={itemForm.galleryFiles}
                          onFileSelect={handleGalleryFilesSelect}
                          language={language}
                        />
                        <div className="studio-grid-span">
                          <StudioField
                            label={contentTypeCopy.galleryPaths}
                            value={itemForm.galleryPaths}
                            onChange={(value) => updateItemField('galleryPaths', value)}
                            hint={contentTypeCopy.galleryPathsHint}
                            multiline
                          />
                        </div>
                      </>
                    )}

                    {isBlog && (
                      <>
                        <AssetPicker
                          label={contentTypeCopy.pdf}
                          folder="blog"
                          currentPath={itemForm.pdfPath}
                          selectedFileName={itemForm.pdfFile?.name}
                          options={assetOptions.blog}
                          onPathSelect={(value) =>
                            setItemForm((current) => ({ ...current, pdfPath: value, pdfFile: null }))
                          }
                          onFileSelect={(file) => handleAssetFileSelect('pdfFile', 'pdfPath', 'blog', file)}
                          language={language}
                          accept="application/pdf"
                        />
                        <AssetPicker
                          label={contentTypeCopy.blogCover}
                          folder="blog"
                          currentPath={itemForm.coverPath}
                          selectedFileName={itemForm.coverFile?.name}
                          options={assetOptions.blog}
                          onPathSelect={(value) =>
                            setItemForm((current) => ({ ...current, coverPath: value, coverFile: null }))
                          }
                          onFileSelect={(file) => handleAssetFileSelect('coverFile', 'coverPath', 'blog', file)}
                          language={language}
                        />
                        <MultiFilePicker
                          label={contentTypeCopy.blogImages}
                          selectedFiles={itemForm.blogImageFiles}
                          onFileSelect={handleBlogImageFilesSelect}
                          language={language}
                        />
                        <div className="studio-grid-span">
                          <StudioField
                            label={contentTypeCopy.blogImagePaths}
                            value={itemForm.blogImagePaths}
                            onChange={(value) => updateItemField('blogImagePaths', value)}
                            hint={contentTypeCopy.blogImagePathsHint}
                            multiline
                          />
                        </div>
                      </>
                    )}
                  </section>

                  <datalist id="studio-channel-options">
                    {channelOptions.map((channel) => (
                      <option key={channel.channelName} value={channel.channelName} />
                    ))}
                  </datalist>

                  <div className="studio-footer">
                    <p className="studio-note small">{copy.note}</p>
                    <div className="studio-inline-actions">
                      {isEditing && (
                        <button type="button" className="cta-button danger" onClick={handleDeleteItem} disabled={isDeleting || isSavingItem}>
                          {isDeleting ? copy.deleting : copy.delete}
                        </button>
                      )}
                      <button type="submit" className="cta-button primary" disabled={isSavingItem || isDeleting}>
                        {isSavingItem ? copy.adding : isEditing ? copy.save : copy.add}
                      </button>
                    </div>
                  </div>
                </form>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default ContentStudio;
