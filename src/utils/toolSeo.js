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

export function toolFaqs(tool, lang) {
  const name = tool[lang]?.title || tool.slug;
  if (lang === 'en') {
    return [
      { q: `Is ${name} free?`, a: `Yes, ${name} is completely free — no limits, no watermarks, no hidden fees.` },
      { q: 'Are my files uploaded to a server?', a: `No. ${name} runs right in your browser — files never leave your device and nothing is sent anywhere.` },
      { q: 'Do I need to sign up or install anything?', a: 'No. No sign-up and no installation — just open the page and use it. It even works offline after the first load.' },
      { q: 'Does it work on a phone?', a: `Yes, ${name} works in the browser on phones, tablets and computers.` },
    ];
  }
  return [
    { q: `«${name}» — это бесплатно?`, a: `Да, «${name}» полностью бесплатный: без ограничений, водяных знаков и скрытых платежей.` },
    { q: 'Мои файлы загружаются на сервер?', a: `Нет. «${name}» работает прямо в браузере — файлы не покидают ваше устройство и никуда не отправляются.` },
    { q: 'Нужна ли регистрация или установка?', a: 'Нет. Ни регистрации, ни установки — просто откройте страницу и пользуйтесь. После первой загрузки работает даже офлайн.' },
    { q: 'Работает ли на телефоне?', a: `Да, «${name}» работает в браузере телефона, планшета и компьютера.` },
  ];
}
