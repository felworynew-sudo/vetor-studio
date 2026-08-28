// Генерирует SEO/UX-контент для страницы инструмента: «как пользоваться», FAQ и
// смежные инструменты. Текст уникален за счёт названия/описания/категории тула —
// даёт краулерам содержимое, а пользователям пользу. FAQ идёт и в FAQPage-schema.

const UPLOAD_CATS = new Set(['image', 'audio', 'ai']);

export function toolHowto(tool, lang) {
  const upload = UPLOAD_CATS.has(tool.categoryId);
  if (lang === 'en') {
    return [
      upload ? 'Add a file — drag it onto the page or click the upload area. Everything is processed locally in your browser.'
        : 'Set the parameters — the result updates live as you tweak them.',
      upload ? 'Adjust the settings and watch the preview update in real time.'
        : 'Fine-tune colors, size and other options to taste.',
      'Download the result or copy the code. Nothing is uploaded to a server, so your files stay private.',
    ];
  }
  return [
    upload ? 'Добавьте файл — перетащите его в окно или нажмите на область загрузки. Всё считается локально в браузере.'
      : 'Задайте параметры — результат обновляется в реальном времени, пока вы их меняете.',
    upload ? 'Настройте параметры и следите за предпросмотром — он меняется сразу.'
      : 'Подберите цвета, размер и другие настройки под себя.',
    'Скачайте результат или скопируйте код. Файлы не загружаются на сервер — ваши данные остаются приватными.',
  ];
}

// Точечные вопросы под реальный поисковый интент топ-инструментов. Для каждого —
// 2-3 уникальных Q&A на язык. Они идут первыми в FAQ и делают FAQPage-разметку
// каждой такой страницы непохожей на остальные (сигнал уникального контента).
const SPECIFIC_FAQS = {
  'image-converter': {
    ru: [
      { q: 'Какие форматы поддерживает конвертер?', a: 'PNG, JPG, WebP, AVIF, TIFF, GIF, BMP, ICO, PSD, HEIC, TGA и десятки других — конвертация в любую сторону, в том числе пакетно.' },
      { q: 'Можно ли конвертировать HEIC в JPG?', a: 'Да. Загрузите файлы .heic с iPhone — конвертер декодирует их прямо в браузере и сохранит в JPG, PNG или WebP, ничего не отправляя на сервер.' },
      { q: 'Меняется ли качество при конвертации?', a: 'Для PNG, WebP и TIFF конвертация без потерь. Для JPG можно задать качество вручную.' },
    ],
    en: [
      { q: 'Which formats does the converter support?', a: 'PNG, JPG, WebP, AVIF, TIFF, GIF, BMP, ICO, PSD, HEIC, TGA and dozens more — convert in any direction, in batch too.' },
      { q: 'Can I convert HEIC to JPG?', a: 'Yes. Drop .heic files from your iPhone — the converter decodes them right in the browser and saves to JPG, PNG or WebP without uploading anything.' },
      { q: 'Does converting change the quality?', a: 'For PNG, WebP and TIFF the conversion is lossless. For JPG you can set the quality manually.' },
    ],
  },
  compressor: {
    ru: [
      { q: 'Как сжать фото до определённого размера в КБ?', a: 'Укажите целевой вес, например 200 КБ — инструмент подбирает качество бинарным поиском и при необходимости уменьшает разрешение, чтобы попасть в лимит.' },
      { q: 'В каком формате сохраняется сжатое фото?', a: 'WebP или JPG на выбор. WebP обычно даёт меньший вес при том же качестве.' },
    ],
    en: [
      { q: 'How do I compress a photo to a specific KB size?', a: 'Set a target size, e.g. 200 KB — the tool tunes quality with a binary search and downscales if needed to hit the limit.' },
      { q: 'What format is the compressed photo saved in?', a: 'WebP or JPG, your choice. WebP is usually smaller at the same quality.' },
    ],
  },
  'background-remover': {
    ru: [
      { q: 'Как удалить фон с фото бесплатно?', a: 'Загрузите снимок — ИИ-модель отделит объект от фона прямо в браузере. Результат скачивается в PNG с прозрачностью.' },
      { q: 'Нужен ли интернет после загрузки?', a: 'Модель скачивается один раз, дальше работает офлайн, а само фото никуда не отправляется.' },
    ],
    en: [
      { q: 'How do I remove a background from a photo for free?', a: 'Upload a photo — the AI model separates the subject from the background right in the browser. You get a transparent PNG.' },
      { q: 'Do I need internet after loading?', a: 'The model downloads once, then works offline, and the photo itself never leaves your device.' },
    ],
  },
  crop: {
    ru: [
      { q: 'Какие пропорции обрезки доступны?', a: 'Пресеты 1:1, 4:3, 16:9 и свободная рамка. Результат сохраняется в исходном качестве.' },
    ],
    en: [
      { q: 'Which crop ratios are available?', a: 'Presets 1:1, 4:3, 16:9 and a free frame. The result is saved at full quality.' },
    ],
  },
  'qr-generator': {
    ru: [
      { q: 'В каком формате скачивается QR-код?', a: 'SVG (векторный, для печати любого размера) или PNG. Цвет и фон настраиваются.' },
      { q: 'Можно ли отсканировать QR-код?', a: 'Да, встроен сканер: наведите камеру или загрузите картинку с кодом.' },
    ],
    en: [
      { q: 'What format is the QR code downloaded in?', a: 'SVG (vector, prints at any size) or PNG. Color and background are adjustable.' },
      { q: 'Can I scan a QR code too?', a: 'Yes, a scanner is built in: point your camera or upload an image with a code.' },
    ],
  },
  'favicon-generator': {
    ru: [
      { q: 'Какие размеры фавиконок создаёт генератор?', a: 'Полный набор (16–512px, apple-touch, Android) плюс manifest.json — всё одним ZIP из одной картинки.' },
    ],
    en: [
      { q: 'Which favicon sizes does it create?', a: 'A full set (16–512px, apple-touch, Android) plus manifest.json — all in one ZIP from a single image.' },
    ],
  },
  'color-converter': {
    ru: [
      { q: 'Как перевести HEX в RGB?', a: 'Вставьте HEX-код — инструмент сразу покажет RGB, HSL и приблизительный CMYK, значения копируются в клик.' },
    ],
    en: [
      { q: 'How do I convert HEX to RGB?', a: 'Paste a HEX code — the tool instantly shows RGB, HSL and approximate CMYK, and values copy in one click.' },
    ],
  },
  'contrast-checker': {
    ru: [
      { q: 'Что означают уровни AA и AAA?', a: 'AA — минимум по WCAG (4.5:1 для обычного текста), AAA — усиленный (7:1). Инструмент показывает, проходит ли пара цветов оба уровня.' },
    ],
    en: [
      { q: 'What do the AA and AAA levels mean?', a: 'AA is the WCAG minimum (4.5:1 for normal text), AAA is enhanced (7:1). The tool shows whether your color pair passes each.' },
    ],
  },
  'image-metadata': {
    ru: [
      { q: 'Как удалить EXIF и геолокацию из фото?', a: 'Загрузите JPEG или PNG — инструмент покажет найденные EXIF, GPS, XMP и IPTC и удалит их без потери качества.' },
      { q: 'Удаляются ли ИИ-метки C2PA?', a: 'Да, C2PA/ИИ-метки о происхождении изображения тоже вырезаются.' },
    ],
    en: [
      { q: 'How do I remove EXIF and GPS location from a photo?', a: 'Upload a JPEG or PNG — the tool shows the EXIF, GPS, XMP and IPTC it found and strips them losslessly.' },
      { q: 'Are C2PA/AI markers removed too?', a: 'Yes, C2PA/AI provenance markers are stripped as well.' },
    ],
  },
  upscaler: {
    ru: [
      { q: 'Насколько увеличивает апскейлер?', a: 'В 2 раза по каждой стороне нейросетью Swin2SR, сохраняя детали и без артефактов обычного растяжения.' },
    ],
    en: [
      { q: 'How much does the upscaler enlarge?', a: '2× on each side with the Swin2SR neural network, keeping details and avoiding plain-stretch artifacts.' },
    ],
  },
  watermark: {
    ru: [
      { q: 'Можно ли наложить водяной знак сразу на много фото?', a: 'Да, пакетно: логотип или текст добавляется на все загруженные изображения с настройкой позиции и прозрачности.' },
    ],
    en: [
      { q: 'Can I watermark many photos at once?', a: 'Yes, in batch: a logo or text is applied to every uploaded image with adjustable position and opacity.' },
    ],
  },
  'ascii-art': {
    ru: [
      { q: 'Как сделать ASCII-арт из картинки?', a: 'Загрузите изображение, задайте ширину и набор символов — инструмент построит текстовый арт, который можно скопировать.' },
    ],
    en: [
      { q: 'How do I make ASCII art from an image?', a: 'Upload an image, set the width and charset — the tool builds text art you can copy.' },
    ],
  },
  'gradient-generator': {
    ru: [
      { q: 'Как получить CSS-код градиента?', a: 'Настройте стопы, угол и тип (линейный или радиальный) — готовый background копируется одной кнопкой.' },
    ],
    en: [
      { q: 'How do I get the CSS for a gradient?', a: 'Set the stops, angle and type (linear or radial) — the ready background copies with one button.' },
    ],
  },
  'svg-cleaner': {
    ru: [
      { q: 'Что убирает очиститель SVG?', a: 'Метаданные редакторов, комментарии, пустые группы и лишние атрибуты из экспортов Figma и Illustrator — файл становится легче.' },
    ],
    en: [
      { q: 'What does the SVG cleaner remove?', a: 'Editor metadata, comments, empty groups and redundant attributes from Figma and Illustrator exports — the file gets lighter.' },
    ],
  },
  pixelizer: {
    ru: [
      { q: 'Можно ли получить пиксель-арт в векторе?', a: 'Да, кроме PNG инструмент экспортирует SVG, где каждый пиксель — отдельный квадрат, масштабируемый без потери резкости.' },
    ],
    en: [
      { q: 'Can I get pixel art as a vector?', a: 'Yes — besides PNG the tool exports SVG where each pixel is its own square, scalable without losing sharpness.' },
    ],
  },
  'smart-crop': {
    ru: [
      { q: 'Как инструмент выбирает область кадрирования?', a: 'ИИ находит лицо или главный объект и центрирует кадр под нужный формат: квадрат, сторис, широкий или круглый аватар.' },
    ],
    en: [
      { q: 'How does the tool choose the crop area?', a: 'The AI finds the face or main subject and centers the frame for the format you pick: square, story, wide or a circular avatar.' },
    ],
  },
  'voice-recorder': {
    ru: [
      { q: 'В каком формате сохраняется запись?', a: 'WAV без потерь или MP3 на выбор, с паузой во время записи и индикатором уровня.' },
    ],
    en: [
      { q: 'What format is the recording saved in?', a: 'Lossless WAV or MP3, your choice, with pause during recording and a level meter.' },
    ],
  },
  'yt-thumbnail': {
    ru: [
      { q: 'Как скачать превью видео с YouTube?', a: 'Вставьте ссылку на видео — инструмент покажет миниатюру во всех доступных размерах. Ссылка не уходит на сервер.' },
    ],
    en: [
      { q: 'How do I download a YouTube thumbnail?', a: 'Paste a video link — the tool shows the thumbnail in every available size. The link never leaves your device.' },
    ],
  },
  duotone: {
    ru: [
      { q: 'Как сделать дуотон-эффект из фото?', a: 'Загрузите снимок и выберите два цвета — светлый ляжет на светлые участки, тёмный на тёмные. Экспорт в PNG.' },
    ],
    en: [
      { q: 'How do I make a duotone effect from a photo?', a: 'Upload a photo and pick two colors — the light one maps to highlights, the dark one to shadows. Export to PNG.' },
    ],
  },
};

export function toolFaqs(tool, lang) {
  const name = tool[lang]?.title || tool.slug;
  const specific = SPECIFIC_FAQS[tool.slug]?.[lang] || SPECIFIC_FAQS[tool.slug]?.ru;

  if (lang === 'en') {
    const universal = [
      { q: `Are my files uploaded to a server?`, a: `No. ${name} runs right in your browser — files never leave your device and nothing is sent anywhere.` },
      { q: `Is ${name} free?`, a: `Yes, ${name} is completely free — no limits, no watermarks, no hidden fees.` },
    ];
    // Для топ-тулов: точечные вопросы + приватность + бесплатность (уникальный набор).
    // Для остальных — полный универсальный набор из 4 вопросов.
    if (specific && SPECIFIC_FAQS[tool.slug]?.en) return [...SPECIFIC_FAQS[tool.slug].en, ...universal];
    return [
      { q: `Is ${name} free?`, a: `Yes, ${name} is completely free — no limits, no watermarks, no hidden fees.` },
      { q: 'Are my files uploaded to a server?', a: `No. ${name} runs right in your browser — files never leave your device and nothing is sent anywhere.` },
      { q: 'Do I need to sign up or install anything?', a: 'No. No sign-up and no installation — just open the page and use it. It even works offline after the first load.' },
      { q: 'Does it work on a phone?', a: `Yes, ${name} works in the browser on phones, tablets and computers.` },
    ];
  }

  const universal = [
    { q: 'Мои файлы загружаются на сервер?', a: `Нет. «${name}» работает прямо в браузере — файлы не покидают ваше устройство и никуда не отправляются.` },
    { q: `«${name}» — это бесплатно?`, a: `Да, «${name}» полностью бесплатный: без ограничений, водяных знаков и скрытых платежей.` },
  ];
  if (specific && SPECIFIC_FAQS[tool.slug]?.ru) return [...SPECIFIC_FAQS[tool.slug].ru, ...universal];
  return [
    { q: `«${name}» — это бесплатно?`, a: `Да, «${name}» полностью бесплатный: без ограничений, водяных знаков и скрытых платежей.` },
    { q: 'Мои файлы загружаются на сервер?', a: `Нет. «${name}» работает прямо в браузере — файлы не покидают ваше устройство и никуда не отправляются.` },
    { q: 'Нужна ли регистрация или установка?', a: 'Нет. Ни регистрации, ни установки — просто откройте страницу и пользуйтесь. После первой загрузки работает даже офлайн.' },
    { q: 'Работает ли на телефоне?', a: `Да, «${name}» работает в браузере телефона, планшета и компьютера.` },
  ];
}
