# Designer Portfolio Mini App

Статическое React-портфолио для дизайнера в логике media feed: превью для YouTube, музыкальные обложки, поиск, теги, RU/EN и detail modal. Проект сделан как чистый showcase без backend, чтобы его было легко редактировать руками и спокойно выкладывать на GitHub Pages, custom domain или позже использовать как Telegram Mini App.

## Что внутри

- `React + Vite`
- `2 типа карточек`: видео-превью и музыкальные обложки
- `RU / EN` без тяжёлой i18n-системы
- `поиск` по названиям, артистам, каналам и тегам
- `множественные теги`
- `modal/detail view`
- `локальные JSON-файлы`
- `локальные изображения` через `public/`
- `адаптивный тёмный интерфейс` с приоритетом на мобильный Telegram WebView

## Быстрый старт

1. Установите зависимости:

```bash
npm install
```

2. Запустите проект:

```bash
npm run dev
```

3. Откройте адрес из терминала, обычно это `http://localhost:5173`.

## Content Studio

Чтобы не добавлять новые работы руками через код, в проект встроен локальный менеджер контента.

Как открыть:

1. Запустите проект через `npm run dev`
2. Откройте сайт на `localhost`
3. В header появится кнопка `Studio`
4. Нажмите `Подключить папку проекта`
5. Выберите корневую папку проекта `D:\price`
6. Заполните поля, выберите картинку и нажмите `Добавить работу`

Что делает Studio:

- копирует выбранную картинку в нужную папку внутри `public/`
- дописывает новую запись в `videos.json` или `music.json`
- сразу показывает новую карточку в ленте

Важно:

- Studio рассчитан на локальную работу в Chrome или Edge
- в публичной версии он скрыт, чтобы не засорять витрину
- при необходимости его можно открыть и не локально через `?studio=1`

## Сборка

Обычная production-сборка:

```bash
npm run build
```

Предпросмотр собранной версии:

```bash
npm run preview
```

## Скриншоты для проверки дизайна

Чтобы быстро проверить, как сайт выглядит на мобильных и desktop-размерах, есть команда:

```bash
npm run screenshots
```

Она сама поднимает локальный Vite-сервер, открывает страницы в Chrome или Edge и сохраняет скриншоты в:

```text
screenshots/latest/
```

Там же создаётся файл:

```text
screenshots/latest/index.html
```

Его удобно открыть в браузере и быстро просмотреть все состояния сеткой.

По умолчанию снимаются:

- главная
- открытая карточка работы
- прайс
- блог
- открытая статья блога
- галерея
- просмотр изображения в галерее

По умолчанию используются ширины:

- `320`
- `390`
- `533`
- `617`
- `789`
- `1440`

Если нужно снять только пару размеров или только один экран:

```bash
npm run screenshots -- --widths=390,617 --scenarios=home,price
```

Если dev-сервер уже запущен отдельно:

```bash
npm run screenshots -- --url=http://localhost:5173
```

Если браузер не найден автоматически, можно указать путь:

```bash
$env:SCREENSHOT_BROWSER='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run screenshots
```

## Структура проекта

```text
public/
  logos/       логотип сайта
  owner/       аватар владельца портфолио
  avatars/     аватары каналов
  thumbs/      превью YouTube-работ
  music/       музыкальные обложки
  favicon/     favicon

src/
  components/  крупные UI-компоненты
  data/        JSON-данные и конфиг сайта
  hooks/       простой хук языка
  utils/       фильтрация, тексты, форматирование
  styles/      глобальные стили
```

## Где менять основные настройки

Главный конфиг лежит в [siteConfig.json](/D:/price/src/data/siteConfig.json).

Там можно поменять:

- название сайта
- подзаголовок
- аватар владельца
- ссылку на Telegram / Behance / сайт
- путь к логотипу
- язык по умолчанию

Пример:

```js
owner: {
  name: 'Kirill',
  avatar: '/owner/owner-avatar.webp',
  url: 'https://t.me/username',
}
```

## Как добавить новую YouTube-работу

1. Положите превью в папку `public/thumbs/`.
2. Если нужен новый аватар канала, положите его в `public/avatars/`.
3. Откройте [src/data/videos.json](/D:/price/src/data/videos.json).
4. Добавьте новый объект по образцу:

```json
{
  "id": "video-005",
  "type": "video",
  "ruTitle": "Русское название",
  "enTitle": "English title",
  "channelName": "Название канала",
  "channelUrl": "https://youtube.com/@channel",
  "channelAvatar": "/avatars/channel-005.webp",
  "videoUrl": "https://youtube.com/watch?v=xxxx",
  "thumbnail": "/thumbs/video-005.webp",
  "tags": ["gaming", "dark"],
  "featured": true,
  "createdAt": "2026-04-06"
}
```

### Важно по полям

- `id`: уникальный идентификатор
- `thumbnail`: путь внутри `public/`
- `tags`: массив slug-ов из `tags.json`
- `featured`: `true`, если работу нужно поднять выше в ленте
- `createdAt`: дата в формате `YYYY-MM-DD`

## Как добавить новую музыкальную работу

1. Положите обложку в `public/music/`.
2. Откройте [src/data/music.json](/D:/price/src/data/music.json).
3. Добавьте новый объект:

```json
{
  "id": "music-004",
  "type": "music",
  "ruTitle": "Русское название",
  "enTitle": "English title",
  "artistName": "Имя артиста",
  "artistUrl": "https://music.yandex.ru/artist/xxxx",
  "trackUrl": "https://music.yandex.ru/album/xxxx/track/xxxx",
  "cover": "/music/music-004.webp",
  "tags": ["music", "cover", "dark"],
  "featured": false,
  "createdAt": "2026-04-06"
}
```

## Как добавить или поменять теги

Список тегов лежит в [src/data/tags.json](/D:/price/src/data/tags.json).

Каждый тег выглядит так:

```json
{ "slug": "gaming", "ru": "Гейминг", "en": "Gaming" }
```

Правило простое:

- `slug` используется в `videos.json` и `music.json`
- `ru` и `en` показываются в интерфейсе

Если удалить тег из `tags.json`, но оставить его в работе, фильтр для него не появится.

## Куда класть картинки

- логотип: `public/logos/`
- аватар владельца: `public/owner/`
- аватары каналов: `public/avatars/`
- видео-превью: `public/thumbs/`
- музыкальные обложки: `public/music/`
- favicon: `public/favicon/`

Лучше использовать `webp`, но `png`, `jpg` и `svg` тоже подойдут.

## Как менять язык

Язык переключается в интерфейсе кнопками `RU / EN`.

Что уже локализовано:

- названия работ
- теги
- тексты интерфейса
- подписи в модалке

Выбранный язык сохраняется в `localStorage`.

## Как работает поиск

Поиск ищет сразу по обоим языкам, даже если интерфейс сейчас переключён только на `RU` или `EN`.

Для видео учитываются:

- `ruTitle`
- `enTitle`
- `channelName`
- slug-и тегов
- локализованные названия тегов

Для музыки учитываются:

- `ruTitle`
- `enTitle`
- `artistName`
- slug-и тегов
- локализованные названия тегов

## GitHub Pages и custom domain

Проект уже подготовлен под статический деплой через Vite.

### Если у вас custom domain

Ничего менять не нужно. Базовый путь уже корректный: `/`.

Сборка:

```bash
npm run build
```

### Если деплой идёт на GitHub Pages без custom domain

Нужно указать имя репозитория как base path во время сборки.

Пример для репозитория `designer-portfolio`:

```bash
$env:VITE_BASE_PATH='/designer-portfolio/'
npm run build
```

После этого папку `dist/` можно публиковать в GitHub Pages.

### Если подключаете свой домен позже

1. Добавьте файл `CNAME` в `public/`.
2. Внутри укажите домен, например:

```text
portfolio.example.com
```

3. Верните обычную сборку без `VITE_BASE_PATH`, если сайт будет открываться с корня домена.

## Почему пути к изображениям не ломаются

В данных используются пути в виде:

```text
/thumbs/video-001.webp
/music/music-001.webp
/owner/owner-avatar.webp
```

Дальше приложение само корректно добавляет `BASE_URL` Vite. Поэтому один и тот же JSON удобен и для локальной разработки, и для GitHub Pages.

## Telegram Mini App readiness

Проект уже дружелюбен к Telegram WebView:

- без backend
- без тяжёлых библиотек
- без роутера и сложной навигации
- адаптивный header
- крупные карточки на мобилке
- modal не тесная на телефоне

Если позже понадобится интеграция Telegram SDK, её лучше добавить отдельным маленьким модулем, не ломая текущую структуру.

## Что можно менять без страха

Обычно вам достаточно трогать только это:

- [src/data/videos.json](/D:/price/src/data/videos.json)
- [src/data/music.json](/D:/price/src/data/music.json)
- [src/data/tags.json](/D:/price/src/data/tags.json)
- [siteConfig.json](/D:/price/src/data/siteConfig.json)
- папки в `public/`

## Что лучше не трогать без необходимости

- [src/utils/filter.js](/D:/price/src/utils/filter.js)
- [src/utils/i18n.js](/D:/price/src/utils/i18n.js)
- [src/styles/globals.css](/D:/price/src/styles/globals.css)

Там лежит логика поиска, текстов и вся визуальная система.

## Идеи для аккуратного развития позже

Если захотите улучшить проект без перегруза, хорошими следующими шагами будут:

1. Добавить реальные `webp`-обложки и превью вместо заглушек.
2. Сохранять выбранные теги в URL, чтобы делиться готовой подборкой.
3. Подключить Telegram SDK отдельным модулем, когда понадобится Mini App логика.
4. Добавить светлую тему вторым набором CSS-переменных, не меняя структуру компонентов.

## Как добавлять публикации в блог

PDF-логика убрана из основного блога. Теперь блог работает как блочный редактор: текст, крупный текст, bold, italic, ссылки, одиночные фото, GIF и горизонтальные карусели.

Самый удобный путь:

1. Откройте сайт локально.
2. Перейдите во вкладку `Блог`.
3. Нажмите `Добавить публикацию`.
4. Заполните заголовок, описание, обложку, теги и блоки публикации.
5. Для текста используйте инструменты справа или правый клик по блоку.
6. Для GIF выберите `.gif` как обычную картинку: она будет работать через стандартный `img`.
7. Нажмите `Опубликовать`.

Ручной путь через JSON тоже остаётся:

1. Положите картинки/GIF в `public/blog/` или используйте существующие картинки из `public/thumbs/`, `public/music/`, `public/gallery/`.
2. Откройте [src/data/blog.json](/D:/price/src/data/blog.json).
3. Добавьте запись:

```json
{
  "id": "blog-002",
  "ruTitle": "Название публикации",
  "enTitle": "Post title",
  "ruDescription": "Короткое описание публикации.",
  "enDescription": "Short post description.",
  "cover": "/blog/my-cover.webp",
  "blocks": [
    {
      "id": "block-001",
      "type": "text",
      "ruText": "Текст публикации.",
      "enText": "Post text.",
      "size": "hero",
      "bold": true,
      "italic": false,
      "linkUrl": ""
    },
    {
      "id": "block-002",
      "type": "image",
      "src": "/blog/process-01.webp",
      "ratio": "wide",
      "ruCaption": "Подпись к картинке.",
      "enCaption": "Image caption."
    },
    {
      "id": "block-003",
      "type": "carousel",
      "ruCaption": "Карусель процесса.",
      "enCaption": "Process carousel.",
      "images": [
        { "src": "/blog/process-02.webp", "ratio": "wide" },
        { "src": "/blog/process-03.gif", "ratio": "wide" }
      ]
    }
  ],
  "tags": ["process"],
  "featured": false,
  "createdAt": "2026-04-14"
}
```

Если обложки нет, можно оставить стандартную:

```json
"cover": "/blog/pdf-cover.svg"
```

## Как менять палитру

В dev-версии в header есть кнопка `Палитра`.

1. Нажмите `Палитра`.
2. Выберите базовые цвета.
3. Нажмите `Сохранить палитру`.
4. Если результат не нравится, нажмите `Вернуть по умолчанию`.

Палитра сохраняется в `localStorage`, поэтому публичный сайт не даёт случайному зрителю менять цвета.

## Как добавлять фото в галерею

Галерея лежит в [src/data/gallery.json](/D:/price/src/data/gallery.json), а картинки можно класть в `public/gallery/` или использовать уже существующие из `public/thumbs/` и `public/music/`.

Поддерживаемые форматы плиток:

- `wide` — крупная горизонтальная плитка
- `landscape` — обычная горизонтальная плитка
- `square` — квадрат
- `portrait` — вертикальная плитка

Пример:

```json
{
  "id": "gallery-005",
  "ruTitle": "Название работы",
  "enTitle": "Work title",
  "ruDescription": "Описание для модального окна.",
  "enDescription": "Description for the modal window.",
  "ratio": "wide",
  "images": [
    {
      "src": "/gallery/work-001.webp",
      "ruAlt": "Описание картинки",
      "enAlt": "Image description"
    },
    {
      "src": "/gallery/work-001-detail.webp",
      "ruAlt": "Деталь работы",
      "enAlt": "Work detail"
    }
  ],
  "createdAt": "2026-04-14"
}
```

Если в `images` несколько файлов, в модалке появится карусель.

## Как менять прайс

Прайс находится в [src/data/pricing.json](/D:/price/src/data/pricing.json).

Там можно менять:

- рекламный текст плашки и модалки
- три сегмента цен на превью
- цены на логотипы, визитки, рекламу и обложки
- три пакета оформления YouTube-канала

Плашка на главной открывает этот прайс автоматически. Код компонентов трогать не нужно, если меняются только названия, списки и цены.
