/* ============================================================
   КУКОЛКА — демо-данные каталога
   Фото товаров: assets/img/products/ (реальные съёмки из бренд-папки).
   Один и тот же снимок используется в разных карточках —
   это прототип, подменишь на настоящие фото поштучно.
   ============================================================ */

/* icon — готовые фирменные иконки из бренд-папки (красный круг уже внутри SVG) */
const CATEGORIES = [
  { key: 'vibrators', name: 'Вибраторы',              icon: 'assets/img/cats/vibrators.svg' },
  { key: 'bdsm',      name: 'БДСМ',                   icon: 'assets/img/cats/bdsm.svg' },
  { key: 'anal',      name: 'Анальные игрушки',       icon: 'assets/img/cats/anal.svg' },
  { key: 'roleplay',  name: 'Ролевые игры',           icon: 'assets/img/cats/roleplay.svg' },
  { key: 'lube',      name: 'Косметика и лубриканты', icon: 'assets/img/cats/lube.svg' },
  { key: 'couple',    name: 'Для двоих',              icon: 'assets/img/cats/couple.svg' },
];

const BRANDS = ['Kukolka Lab', 'Velvet Sin', 'Noir Touch', 'Red Room', 'Sweet Devil'];

const P = 'assets/img/products/';

const PRODUCTS = [
  {
    id: 'v-sweet-devil', name: 'Вибратор Sweet Devil', cat: 'vibrators', brand: 'Sweet Devil',
    price: 3990, old: 5490, img: P + 'vibrator.png', rating: 4.8, reviews: 126,
    badges: ['hit', 'sale'], stock: true, colors: ['Чёрный', 'Красный'],
    desc: 'Флагман коллекции: 10 режимов вибрации, мягкий медицинский силикон и корпус, который ложится в руку как влитой. Полная влагозащита — можно брать в душ.',
    specs: { 'Материал': 'Медицинский силикон', 'Длина': '19 см', 'Режимов вибрации': '10', 'Питание': 'USB-зарядка, 90 мин', 'Влагозащита': 'IPX7', 'Уровень шума': 'до 45 дБ' }
  },
  {
    id: 'v-hot-bunny', name: 'Вибратор-кролик Hot Bunny', cat: 'vibrators', brand: 'Velvet Sin',
    price: 4490, old: null, img: P + 'vibrator.png', rating: 4.9, reviews: 84,
    badges: ['new'], stock: true, colors: ['Красный', 'Чёрный'],
    desc: 'Двойная стимуляция и раздельные моторы: интенсивность подбираешь под себя. Тихий даже на максимуме.',
    specs: { 'Материал': 'Силикон + ABS', 'Длина': '21 см', 'Режимов вибрации': '12', 'Моторов': '2', 'Питание': 'USB-зарядка', 'Влагозащита': 'IPX6' }
  },
  {
    id: 'v-night-call', name: 'Мини-вибратор Night Call', cat: 'vibrators', brand: 'Kukolka Lab',
    price: 2290, old: 2990, img: P + 'vibrator.png', rating: 4.6, reviews: 212,
    badges: ['sale'], stock: true, colors: ['Чёрный'],
    desc: 'Компактный, помещается в косметичку, а мощности хватает с запасом. Идеальный первый вибратор.',
    specs: { 'Материал': 'Медицинский силикон', 'Длина': '11 см', 'Режимов вибрации': '7', 'Питание': 'USB-зарядка', 'Влагозащита': 'IPX5' }
  },
  {
    id: 'v-red-passion', name: 'Вибратор Red Passion', cat: 'vibrators', brand: 'Red Room',
    price: 2990, old: null, img: P + 'vibrator.png', rating: 4.7, reviews: 58,
    badges: [], stock: true, colors: ['Красный'],
    desc: 'Классическая форма, приятный вес и понятное управление одной кнопкой. Работает без сюрпризов.',
    specs: { 'Материал': 'Силикон', 'Длина': '17 см', 'Режимов вибрации': '8', 'Питание': 'USB-зарядка', 'Влагозащита': 'IPX6' }
  },
  {
    id: 'v-silent-storm', name: 'Вибромассажёр Silent Storm', cat: 'vibrators', brand: 'Noir Touch',
    price: 6490, old: 7900, img: P + 'vibrator.png', rating: 4.9, reviews: 41,
    badges: ['hit', 'sale'], stock: true, colors: ['Чёрный'],
    desc: 'Мощный мотор в тихом корпусе. Восемь скоростей, память последнего режима и магнитная зарядка.',
    specs: { 'Материал': 'Силикон soft-touch', 'Длина': '23 см', 'Режимов вибрации': '8', 'Питание': 'Магнитная зарядка', 'Влагозащита': 'IPX7', 'Уровень шума': 'до 40 дБ' }
  },
  {
    id: 'v-pocket-devil', name: 'Вибропуля Pocket Devil', cat: 'vibrators', brand: 'Kukolka Lab',
    price: 1290, old: null, img: P + 'vibrator.png', rating: 4.4, reviews: 305,
    badges: [], stock: false, colors: ['Чёрный', 'Красный'],
    desc: 'Крошечная, бесшумная, всегда с собой. Самый популярный товар в подарочных наборах.',
    specs: { 'Материал': 'ABS + силикон', 'Длина': '7 см', 'Режимов вибрации': '5', 'Питание': 'USB-зарядка', 'Влагозащита': 'IPX5' }
  },

  {
    id: 'b-cuffs-noir', name: 'Наручники Noir Classic', cat: 'bdsm', brand: 'Noir Touch',
    price: 1890, old: 2490, img: P + 'cuffs.png', rating: 4.7, reviews: 149,
    badges: ['hit', 'sale'], stock: true, colors: ['Чёрный'],
    desc: 'Металлическая база в мягкой оплётке: держат надёжно, но не натирают. Два ключа в комплекте.',
    specs: { 'Материал': 'Металл, эко-кожа', 'Обхват': '16–22 см', 'В комплекте': '2 ключа', 'Регулировка': 'Есть' }
  },
  {
    id: 'b-cuffs-red', name: 'Наручники Red Desire', cat: 'bdsm', brand: 'Red Room',
    price: 2190, old: null, img: P + 'cuffs.png', rating: 4.8, reviews: 62,
    badges: ['new'], stock: true, colors: ['Красный', 'Чёрный'],
    desc: 'Красная подкладка и мех по краю — для тех, кто пробует БДСМ впервые и хочет мягкий старт.',
    specs: { 'Материал': 'Эко-кожа, мех', 'Обхват': '15–24 см', 'В комплекте': '2 ключа', 'Регулировка': 'Есть' }
  },
  {
    id: 'b-whip-leather', name: 'Плеть Leather Touch', cat: 'bdsm', brand: 'Noir Touch',
    price: 2590, old: null, img: P + 'whip.png', rating: 4.6, reviews: 73,
    badges: ['hit'], stock: true, colors: ['Чёрный'],
    desc: 'Сорок мягких хвостов и удобная рукоять с петлёй. Звук громче ощущений — то, что нужно для игры.',
    specs: { 'Материал': 'Натуральная кожа', 'Длина': '58 см', 'Хвостов': '40', 'Рукоять': 'С петлёй' }
  },
  {
    id: 'b-whip-red', name: 'Плеть Red Passion', cat: 'bdsm', brand: 'Red Room',
    price: 2890, old: 3490, img: P + 'whip.png', rating: 4.5, reviews: 38,
    badges: ['sale'], stock: true, colors: ['Красный'],
    desc: 'Яркий акцент в коллекции. Хвосты чуть жёстче классической версии — ощущения ярче.',
    specs: { 'Материал': 'Эко-кожа', 'Длина': '62 см', 'Хвостов': '36', 'Рукоять': 'Витая' }
  },
  {
    id: 'b-collar-set', name: 'Бондаж-набор Bondage Set', cat: 'bdsm', brand: 'Velvet Sin',
    price: 4990, old: 6490, img: P + 'cuffs.png', rating: 4.8, reviews: 95,
    badges: ['hit', 'sale'], stock: true, colors: ['Чёрный'],
    desc: 'Ошейник, наручники, поножи и поводок в одной коробке. Готовый сценарий на вечер.',
    specs: { 'Материал': 'Эко-кожа, металл', 'Предметов': '6', 'Упаковка': 'Подарочная коробка', 'Регулировка': 'Все элементы' }
  },
  {
    id: 'b-whip-mini', name: 'Стек Mini Sting', cat: 'bdsm', brand: 'Kukolka Lab',
    price: 1490, old: null, img: P + 'whip.png', rating: 4.3, reviews: 44,
    badges: [], stock: true, colors: ['Чёрный', 'Красный'],
    desc: 'Короткий стек для точечных прикосновений. Хорош как первый предмет для новичков.',
    specs: { 'Материал': 'Эко-кожа', 'Длина': '42 см', 'Наконечник': 'Сердце', 'Рукоять': 'Прорезиненная' }
  },

  {
    id: 'a-plug-black-heart', name: 'Анальная пробка Black Heart', cat: 'anal', brand: 'Kukolka Lab',
    price: 1590, old: null, img: P + 'vibrator.png', rating: 4.7, reviews: 168,
    badges: ['hit'], stock: true, colors: ['Чёрный'],
    desc: 'Классическая каплевидная форма с широким основанием. Размер S — комфортный старт.',
    specs: { 'Материал': 'Медицинский силикон', 'Длина': '9 см', 'Диаметр': '3.2 см', 'Размер': 'S', 'Основание': 'Ограничитель' }
  },
  {
    id: 'a-plug-love-devil', name: 'Анальная пробка Love Devil', cat: 'anal', brand: 'Red Room',
    price: 1890, old: 2390, img: P + 'vibrator.png', rating: 4.6, reviews: 71,
    badges: ['new', 'sale'], stock: true, colors: ['Красный'],
    desc: 'Красный кристалл в основании и гладкая полировка. Смотрится дороже, чем стоит.',
    specs: { 'Материал': 'Сталь, кристалл', 'Длина': '8 см', 'Диаметр': '3 см', 'Размер': 'S', 'Вес': '92 г' }
  },
  {
    id: 'a-beads', name: 'Анальные шарики Chain Rise', cat: 'anal', brand: 'Velvet Sin',
    price: 2190, old: null, img: P + 'vibrator.png', rating: 4.5, reviews: 52,
    badges: [], stock: true, colors: ['Чёрный'],
    desc: 'Пять шариков с нарастающим диаметром и кольцо-ограничитель. Гибкая ось, ничего не давит.',
    specs: { 'Материал': 'Силикон', 'Длина': '24 см', 'Шариков': '5', 'Диаметр': '1.8–3.4 см' }
  },
  {
    id: 'a-plug-vibro', name: 'Вибропробка Deep Night', cat: 'anal', brand: 'Noir Touch',
    price: 3290, old: 3990, img: P + 'vibrator.png', rating: 4.8, reviews: 33,
    badges: ['sale'], stock: true, colors: ['Чёрный'],
    desc: 'Пробка с вибрацией и пультом. Радиус пульта — 8 метров, удобно передавать партнёру.',
    specs: { 'Материал': 'Силикон', 'Длина': '11 см', 'Режимов вибрации': '9', 'Пульт': 'Радио, 8 м', 'Питание': 'USB-зарядка' }
  },

  {
    id: 'r-mask-bunny', name: 'Маска Bunny Noir', cat: 'roleplay', brand: 'Noir Touch',
    price: 2790, old: null, img: P + 'mask-bunny.png', rating: 4.9, reviews: 187,
    badges: ['hit'], stock: true, colors: ['Чёрный'],
    desc: 'Та самая маска-зайка из фотосессий бренда. Плотная эко-кожа, красная подкладка ушей, ремешок с пряжкой.',
    specs: { 'Материал': 'Эко-кожа', 'Подкладка': 'Красный велюр', 'Ремешок': 'Регулируемый, пряжка', 'Фурнитура': 'Золотистая' }
  },
  {
    id: 'r-mask-eyes', name: 'Маска на глаза Devil Eyes', cat: 'roleplay', brand: 'Red Room',
    price: 890, old: 1290, img: P + 'mask-bunny.png', rating: 4.4, reviews: 240,
    badges: ['sale'], stock: true, colors: ['Чёрный', 'Красный'],
    desc: 'Мягкая маска, полностью перекрывает свет. Резинка не путается в волосах.',
    specs: { 'Материал': 'Сатин, поролон', 'Крепление': 'Резинка', 'Светонепроницаемость': '100%' }
  },
  {
    id: 'r-costume-maid', name: 'Костюм Maid Night', cat: 'roleplay', brand: 'Velvet Sin',
    price: 4290, old: null, img: P + 'mask-bunny.png', rating: 4.5, reviews: 29,
    badges: ['new'], stock: true, colors: ['Чёрный'],
    desc: 'Платье, фартук, чокер и ободок. Ткань держит форму и не просвечивает.',
    specs: { 'Материал': 'Полиэстер, кружево', 'Размеры': 'S, M, L', 'Предметов': '4', 'Уход': 'Ручная стирка' }
  },
  {
    id: 'r-mask-cat', name: 'Маска Cat Instinct', cat: 'roleplay', brand: 'Kukolka Lab',
    price: 2390, old: 2990, img: P + 'mask-bunny.png', rating: 4.6, reviews: 47,
    badges: ['sale'], stock: false, colors: ['Чёрный'],
    desc: 'Кошачья версия культовой маски. Уши держат форму, вырезы для глаз шире — удобнее носить.',
    specs: { 'Материал': 'Эко-кожа', 'Подкладка': 'Велюр', 'Ремешок': 'Регулируемый', 'Фурнитура': 'Серебристая' }
  },

  {
    id: 'l-lube-silk', name: 'Лубрикант Silk Water', cat: 'lube', brand: 'Kukolka Lab',
    price: 790, old: null, img: P + 'lube.png', rating: 4.8, reviews: 412,
    badges: ['hit'], stock: true, colors: [],
    desc: 'База — вода, без запаха и липкости. Совместим с игрушками и презервативами.',
    specs: { 'Основа': 'Вода', 'Объём': '100 мл', 'Совместимость': 'Латекс, силикон', 'Отдушка': 'Без запаха', 'pH': '4.5' }
  },
  {
    id: 'l-lube-warm', name: 'Лубрикант Warm Touch', cat: 'lube', brand: 'Red Room',
    price: 990, old: 1290, img: P + 'lube.png', rating: 4.6, reviews: 158,
    badges: ['sale'], stock: true, colors: [],
    desc: 'Согревающий эффект появляется от прикосновений. Мягко, без жжения.',
    specs: { 'Основа': 'Вода', 'Объём': '100 мл', 'Эффект': 'Согревающий', 'Совместимость': 'Латекс, силикон' }
  },
  {
    id: 'l-massage-oil', name: 'Массажное масло Velvet Night', cat: 'lube', brand: 'Velvet Sin',
    price: 1490, old: null, img: P + 'lube.png', rating: 4.7, reviews: 86,
    badges: ['new'], stock: true, colors: [],
    desc: 'Тёплый аромат ванили и сандала, впитывается без плёнки. Подходит для длинного массажа.',
    specs: { 'Основа': 'Масло', 'Объём': '150 мл', 'Аромат': 'Ваниль, сандал', 'Совместимость': 'Не для латекса' }
  },
  {
    id: 'l-cleaner', name: 'Очиститель игрушек Pure Care', cat: 'lube', brand: 'Kukolka Lab',
    price: 690, old: null, img: P + 'lube.png', rating: 4.9, reviews: 203,
    badges: [], stock: true, colors: [],
    desc: 'Антибактериальный спрей для силикона и стали. Не оставляет запаха и разводов.',
    specs: { 'Тип': 'Спрей', 'Объём': '150 мл', 'Спирт': 'Нет', 'Применение': 'До и после использования' }
  },

  {
    id: 'c-set-first-night', name: 'Набор для двоих First Night', cat: 'couple', brand: 'Kukolka Lab',
    price: 5490, old: 7290, img: P + 'cuffs.png', rating: 4.9, reviews: 118,
    badges: ['hit', 'sale'], stock: true, colors: ['Чёрный'],
    desc: 'Стартовый набор для пар: наручники, маска, перо, лубрикант и карточки со сценариями.',
    specs: { 'Предметов': '5', 'Упаковка': 'Подарочная коробка', 'Кому': 'Парам, новичкам', 'Бонус': '20 карточек-заданий' }
  },
  {
    id: 'c-cards', name: 'Игра «Секретные желания»', cat: 'couple', brand: 'Velvet Sin',
    price: 1190, old: null, img: P + 'cuffs.png', rating: 4.5, reviews: 96,
    badges: ['new'], stock: true, colors: [],
    desc: 'Пятьдесят карточек трёх уровней смелости. Разговорная игра, которая редко доходит до конца колоды.',
    specs: { 'Карточек': '50', 'Уровней': '3', 'Игроков': '2', 'Язык': 'Русский' }
  },
  {
    id: 'c-set-hot-week', name: 'Набор Hot Week', cat: 'couple', brand: 'Red Room',
    price: 6990, old: 8990, img: P + 'cuffs.png', rating: 4.7, reviews: 54,
    badges: ['sale'], stock: true, colors: ['Красный', 'Чёрный'],
    desc: 'Семь конвертов — по одному на каждый день. Внутри аксессуары и задания.',
    specs: { 'Предметов': '7', 'Упаковка': 'Подарочная коробка', 'Кому': 'Парам', 'Бонус': 'Открытка с пожеланием' }
  },
  {
    id: 'c-ring', name: 'Эрекционное кольцо Double Loop', cat: 'couple', brand: 'Noir Touch',
    price: 1690, old: null, img: P + 'vibrator.png', rating: 4.4, reviews: 67,
    badges: [], stock: true, colors: ['Чёрный'],
    desc: 'Мягкое кольцо с вибромодулем и выступом для стимуляции партнёра. Тянется, не пережимает.',
    specs: { 'Материал': 'Силикон', 'Диаметр': '3 см (тянется)', 'Режимов вибрации': '6', 'Питание': 'USB-зарядка' }
  },
];

/* Тексты и цифры для главной */

const REVIEWS = [
  { name: 'Алина К.', date: '12 августа', rate: 5, text: 'Заказ пришёл за два дня, коробка абсолютно нейтральная — курьер даже не понял, что везёт. Вибратор Sweet Devil тише, чем я ожидала.' },
  { name: 'М.', date: '9 августа', rate: 5, text: 'Брали набор First Night вдвоём. Карточки с заданиями оказались лучшей частью — вечер прошёл совсем не по плану.' },
  { name: 'Дарья', date: '2 августа', rate: 4, text: 'Маска-зайка шикарная, кожа плотная. Ремешок пришлось затянуть на максимум, но это моя особенность.' },
];

/* Отзывы для карточки товара — без упоминания конкретных моделей,
   чтобы один и тот же текст не выглядел странно на разных товарах */
const PRODUCT_REVIEWS = [
  { name: 'Ольга', date: '10 августа', rate: 5, text: 'Пришло на третий день, коробка без единой надписи. Качество лучше, чем ожидала за эти деньги.' },
  { name: 'К.', date: '5 августа', rate: 5, text: 'Заказывала второй раз, уже осознанно. Описание на сайте совпало с тем, что приехало, — это редкость.' },
  { name: 'Ирина', date: '28 июля', rate: 4, text: 'Всё понравилось, кроме срока доставки в мой город — ждала неделю. Сам товар отличный.' },
];

const PROMOCODES = {
  'КУКОЛКА': 10,
  'DEVIL15': 15,
  'FIRST': 10,
};
