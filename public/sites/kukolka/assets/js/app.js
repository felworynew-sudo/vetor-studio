/* ============================================================
   КУКОЛКА — логика прототипа
   Корзина, избранное, фильтры, поиск, оформление заказа.
   Состояние живёт в localStorage — между страницами не теряется.
   ============================================================ */

/* ---------- Утилиты ---------- */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const icon = (name, cls = '') => `<svg class="${cls}"><use href="#i-${name}"></use></svg>`;

const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';

const byId = id => PRODUCTS.find(p => p.id === id);

const catName = key => (CATEGORIES.find(c => c.key === key) || {}).name || '';

const params = new URLSearchParams(location.search);

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

/* ---------- Хранилище ---------- */

const Store = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem('kukolka:' + key)) ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) {
    localStorage.setItem('kukolka:' + key, JSON.stringify(value));
  },
};

let cart = Store.read('cart', []);          // [{id, qty, color}]
let favs = Store.read('favs', []);          // [id]

const saveCart = () => { Store.write('cart', cart); syncBadges(); };
const saveFavs = () => { Store.write('favs', favs); syncBadges(); };

const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
const cartSum   = () => cart.reduce((s, i) => s + (byId(i.id)?.price || 0) * i.qty, 0);

/* ---------- Тосты ---------- */

function toast(text, ico = 'check') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.append(box); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = icon(ico) + '<span>' + text + '</span>';
  box.append(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); }, 2600);
}

/* ---------- Корзина ---------- */

function addToCart(id, qty = 1, color = null) {
  const product = byId(id);
  if (!product || !product.stock) return;
  const line = cart.find(i => i.id === id && i.color === color);
  if (line) line.qty += qty; else cart.push({ id, qty, color });
  saveCart();
  /* Шторка сама по себе подтверждает добавление — тост здесь был бы лишним
     и на телефоне перекрывал бы кнопку оформления */
  renderDrawer();
  openDrawer();
}

function setQty(id, color, qty) {
  const line = cart.find(i => i.id === id && i.color === color);
  if (!line) return;
  line.qty = Math.max(1, Math.min(99, qty));
  saveCart();
}

function removeFromCart(id, color) {
  cart = cart.filter(i => !(i.id === id && i.color === color));
  saveCart();
}

function toggleFav(id) {
  const i = favs.indexOf(id);
  if (i > -1) { favs.splice(i, 1); toast('Убрали из избранного', 'heart'); }
  else { favs.push(id); toast('Добавили в избранное', 'heart-fill'); }
  saveFavs();
  $$('[data-fav="' + id + '"]').forEach(b => b.classList.toggle('is-on', favs.includes(id)));
  /* На странице избранного карточка должна исчезнуть сразу */
  if ($('#favs-grid')) initFavs();
}

function syncBadges() {
  const set = (sel, n) => $$(sel).forEach(b => {
    b.textContent = n;
    b.classList.toggle('is-on', n > 0);
  });
  set('[data-badge="cart"]', cartCount());
  set('[data-badge="favs"]', favs.length);
}

/* ---------- Рейтинг ---------- */

function stars(rate) {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    if (rate >= i) out += icon('star');
    else if (rate >= i - .5) out += icon('star-half');
    else out += icon('star', 'is-off');
  }
  return `<span class="rating__stars">${out}</span>`;
}

/* ---------- Карточка товара ---------- */

const BADGE_TEXT = { new: 'Новинка', hit: 'Хит', sale: 'Скидка' };

function cardHTML(p) {
  const tags = p.badges.map(b =>
    `<span class="tag ${b === 'sale' ? 'tag--red' : b === 'new' ? 'tag--white' : ''}">${BADGE_TEXT[b]}</span>`
  ).join('');

  return `
  <article class="card ${p.stock ? '' : 'card--out'}">
    <div class="card__media">
      <div class="card__tags">${tags}${p.stock ? '' : '<span class="tag">Нет в наличии</span>'}</div>
      <button class="card__fav ${favs.includes(p.id) ? 'is-on' : ''}" data-fav="${p.id}" aria-label="В избранное">
        ${icon(favs.includes(p.id) ? 'heart-fill' : 'heart')}
      </button>
      <a href="product.html?id=${p.id}"><img src="${p.img}" alt="${p.name}" loading="lazy"></a>
    </div>
    <span class="card__cat">${catName(p.cat)}</span>
    <a href="product.html?id=${p.id}"><h3 class="card__name">${p.name}</h3></a>
    <div class="rating">${stars(p.rating)}<span>${p.rating} · ${p.reviews}</span></div>
    <div class="card__bottom">
      <div class="price">
        ${p.old ? `<span class="price__old">${money(p.old)}</span>` : ''}
        ${money(p.price)}
      </div>
      <button class="card__add" data-add="${p.id}" aria-label="В корзину">${icon('cart')}</button>
    </div>
  </article>`;
}

function renderGrid(node, list) {
  if (!node) return;
  node.innerHTML = list.map(cardHTML).join('');
}

/* Делегирование кликов по кнопкам карточек */
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) { addToCart(add.dataset.add); add.classList.add('is-added'); }

  const fav = e.target.closest('[data-fav]');
  if (fav) { toggleFav(fav.dataset.fav); fav.innerHTML = icon(favs.includes(fav.dataset.fav) ? 'heart-fill' : 'heart'); }
});

/* ---------- Шторка мини-корзины ---------- */

function overlayEl() {
  let o = $('.overlay');
  if (!o) {
    o = document.createElement('div');
    o.className = 'overlay';
    o.addEventListener('click', closeAll);
    document.body.append(o);
  }
  return o;
}

function openDrawer() {
  const d = $('#drawer'); if (!d) return;
  d.classList.add('is-open');
  overlayEl().classList.add('is-on');
  document.body.classList.add('is-locked');
}

function closeAll() {
  $$('.drawer, .mobile-nav').forEach(n => n.classList.remove('is-open'));
  overlayEl().classList.remove('is-on');
  document.body.classList.remove('is-locked');
}

function renderDrawer() {
  const body = $('#drawer-body'), total = $('#drawer-total');
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = `<div class="empty" style="padding:50px 0">
      ${icon('cart')}<h3>Пока пусто</h3>
      <p class="small">Загляни в каталог — там есть на что посмотреть.</p>
      <a class="btn btn--red btn--sm" href="catalog.html">В каталог</a></div>`;
  } else {
    body.innerHTML = cart.map(line => {
      const p = byId(line.id);
      return `<div class="mini-item">
        <div class="mini-item__img"><img src="${p.img}" alt="${p.name}"></div>
        <div>
          <div class="mini-item__name">${p.name}</div>
          <div class="mini-item__meta">${line.qty} × ${money(p.price)}${line.color ? ' · ' + line.color : ''}</div>
        </div>
        <button class="mini-item__del" data-drop="${p.id}" data-color="${line.color || ''}" aria-label="Удалить">${icon('trash')}</button>
      </div>`;
    }).join('');
  }
  if (total) total.textContent = money(cartSum());
  const checkout = $('#drawer-checkout');
  if (checkout) checkout.classList.toggle('is-hidden', !cart.length);
}

document.addEventListener('click', e => {
  if (e.target.closest('#open-cart')) { e.preventDefault(); renderDrawer(); openDrawer(); }
  if (e.target.closest('[data-close]')) closeAll();
  if (e.target.closest('#open-menu')) {
    $('.mobile-nav')?.classList.add('is-open');
    overlayEl().classList.add('is-on');
  }
  const drop = e.target.closest('[data-drop]');
  if (drop) {
    removeFromCart(drop.dataset.drop, drop.dataset.color || null);
    renderDrawer();
    if (typeof renderCartPage === 'function') renderCartPage();
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

/* ---------- Поиск с подсказками ---------- */

function initSearch() {
  const field = $('#search-field'), box = $('#suggest');
  if (!field || !box) return;

  const run = () => {
    const q = field.value.trim().toLowerCase();
    if (q.length < 2) { box.classList.remove('is-open'); return; }

    const found = PRODUCTS.filter(p =>
      p.name.toLowerCase().includes(q) ||
      catName(p.cat).toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q)
    ).slice(0, 6);

    box.innerHTML = found.length
      ? found.map(p => `<a class="suggest__item" href="product.html?id=${p.id}">
          <img src="${p.img}" alt="">
          <span><span class="suggest__name">${p.name}</span><br>
          <span class="suggest__price">${money(p.price)}</span></span>
        </a>`).join('')
      : `<div class="suggest__empty">Ничего не нашли. Попробуй «вибратор», «маска» или «набор».</div>`;
    box.classList.add('is-open');
  };

  field.addEventListener('input', run);
  field.addEventListener('focus', run);
  field.addEventListener('keydown', e => {
    if (e.key === 'Enter') location.href = 'catalog.html?q=' + encodeURIComponent(field.value.trim());
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search')) box.classList.remove('is-open');
  });
}

/* ---------- Модалка 18+ ---------- */

function initAgeGate() {
  const gate = $('#age-gate');
  if (!gate) return;
  if (Store.read('age-ok', false)) { gate.hidden = true; return; }

  gate.hidden = false;
  document.body.classList.add('is-locked');

  $('#age-yes')?.addEventListener('click', () => {
    Store.write('age-ok', true);
    gate.hidden = true;
    document.body.classList.remove('is-locked');
  });
  $('#age-no')?.addEventListener('click', () => {
    location.href = 'https://ya.ru';
  });
}

/* ---------- Появление блоков при скролле ---------- */

function initReveal() {
  const items = $$('.reveal');
  if (!items.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -60px 0px' });
  items.forEach(el => io.observe(el));
}

/* ---------- Таймер акции ---------- */

function initTimer() {
  const box = $('#timer');
  if (!box) return;
  // Акция «сгорает» каждый день в полночь
  const tick = () => {
    const now = new Date();
    const end = new Date(now); end.setHours(24, 0, 0, 0);
    let left = Math.floor((end - now) / 1000);
    const h = String(Math.floor(left / 3600)).padStart(2, '0');
    const m = String(Math.floor(left % 3600 / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    box.innerHTML = [['Часы', h], ['Минуты', m], ['Секунды', s]]
      .map(([label, v]) => `<div class="timer__cell"><b>${v}</b><span>${label}</span></div>`).join('');
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- Главная ---------- */

function initHome() {
  const catsBox = $('#cats');
  if (catsBox) {
    catsBox.innerHTML = CATEGORIES.map(c => {
      const n = PRODUCTS.filter(p => p.cat === c.key).length;
      return `<a class="cat" href="catalog.html?cat=${c.key}">
        <div class="cat__circle"><img src="${c.icon}" alt="" loading="lazy"></div>
        <div class="cat__name">${c.name}</div>
        <span class="cat__count">${n} ${plural(n, 'товар', 'товара', 'товаров')}</span>
      </a>`;
    }).join('');
  }

  renderGrid($('#hits'), PRODUCTS.filter(p => p.badges.includes('hit')).slice(0, 4));
  renderGrid($('#news'), PRODUCTS.filter(p => p.badges.includes('new')).slice(0, 4));

  const rev = $('#reviews');
  if (rev) {
    rev.innerHTML = REVIEWS.map(r => `<div class="review">
      <div class="rating">${stars(r.rate)}</div>
      <p>«${r.text}»</p>
      <div class="review__who">
        <div class="review__ava">${r.name[0]}</div>
        <div><div class="review__name">${r.name}</div><div class="review__date">${r.date}</div></div>
      </div>
    </div>`).join('');
  }
}

/* ---------- Каталог ---------- */

const state = {
  cats: params.get('cat') ? [params.get('cat')] : [],
  brands: [],
  q: params.get('q') || '',
  min: null, max: null,
  onlyStock: false,
  onlySale: params.get('sale') === '1',
  onlyNew: params.get('new') === '1',
  sort: params.get('sort') || 'pop',
};

function initCatalog() {
  const grid = $('#catalog-grid');
  if (!grid) return;

  /* Фильтр по категориям */
  $('#f-cats').innerHTML = CATEGORIES.map(c => {
    const n = PRODUCTS.filter(p => p.cat === c.key).length;
    return `<label class="check">
      <input type="checkbox" value="${c.key}" data-f="cat" ${state.cats.includes(c.key) ? 'checked' : ''}>
      <span class="check__box">${icon('check')}</span>
      <span>${c.name}</span><span class="check__count">${n}</span>
    </label>`;
  }).join('');

  /* Фильтр по брендам */
  $('#f-brands').innerHTML = BRANDS.map(b => {
    const n = PRODUCTS.filter(p => p.brand === b).length;
    return `<label class="check">
      <input type="checkbox" value="${b}" data-f="brand">
      <span class="check__box">${icon('check')}</span>
      <span>${b}</span><span class="check__count">${n}</span>
    </label>`;
  }).join('');

  const searchInput = $('#f-q');
  if (searchInput) searchInput.value = state.q;

  /* Состояние из адреса страницы: ?cat= ?q= ?sale=1 ?new=1 ?sort= */
  $('#f-sale').checked = state.onlySale;
  $('#f-new').checked = state.onlyNew;
  $('#f-sort').value = state.sort;

  /* На узких экранах фильтры свёрнуты и открываются кнопкой */
  const filters = $('.filters');
  const isNarrow = () => window.matchMedia('(max-width: 980px)').matches;
  if (isNarrow()) filters.classList.add('is-collapsed');
  $('#filters-toggle')?.addEventListener('click', () => {
    filters.classList.toggle('is-collapsed');
    if (!filters.classList.contains('is-collapsed')) {
      filters.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  window.addEventListener('resize', () => {
    if (!isNarrow()) filters.classList.remove('is-collapsed');
  });

  const apply = () => {
    state.cats   = $$('[data-f="cat"]:checked').map(i => i.value);
    state.brands = $$('[data-f="brand"]:checked').map(i => i.value);
    state.min = $('#f-min').value ? +$('#f-min').value : null;
    state.max = $('#f-max').value ? +$('#f-max').value : null;
    state.onlyStock = $('#f-stock').checked;
    state.onlySale  = $('#f-sale').checked;
    state.onlyNew   = $('#f-new').checked;
    state.sort = $('#f-sort').value;
    state.q = searchInput ? searchInput.value.trim() : state.q;
    draw();
  };

  $('.filters').addEventListener('change', apply);
  $('.filters').addEventListener('input', e => { if (e.target.type === 'number') apply(); });
  $('#f-sort').addEventListener('change', apply);
  searchInput?.addEventListener('input', apply);

  $('#f-reset').addEventListener('click', () => {
    $$('.filters input[type=checkbox]').forEach(i => i.checked = false);
    $('#f-min').value = ''; $('#f-max').value = '';
    if (searchInput) searchInput.value = '';
    state.q = '';
    history.replaceState(null, '', 'catalog.html');
    apply();
  });

  function filtered() {
    let list = PRODUCTS.slice();
    const q = state.q.toLowerCase();

    if (q) list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      catName(p.cat).toLowerCase().includes(q));

    if (state.cats.length)   list = list.filter(p => state.cats.includes(p.cat));
    if (state.brands.length) list = list.filter(p => state.brands.includes(p.brand));
    if (state.min != null)   list = list.filter(p => p.price >= state.min);
    if (state.max != null)   list = list.filter(p => p.price <= state.max);
    if (state.onlyStock)     list = list.filter(p => p.stock);
    if (state.onlySale)      list = list.filter(p => p.old);
    if (state.onlyNew)       list = list.filter(p => p.badges.includes('new'));

    const sorters = {
      pop:    (a, b) => b.reviews - a.reviews,
      cheap:  (a, b) => a.price - b.price,
      pricey: (a, b) => b.price - a.price,
      rate:   (a, b) => b.rating - a.rating,
    };
    return list.sort(sorters[state.sort] || sorters.pop);
  }

  function drawChips() {
    const box = $('#chips');
    const chips = [];
    state.cats.forEach(c => chips.push(['cat', c, catName(c)]));
    state.brands.forEach(b => chips.push(['brand', b, b]));
    if (state.q) chips.push(['q', state.q, '«' + state.q + '»']);
    if (state.onlySale)  chips.push(['flag', 'f-sale', 'Со скидкой']);
    if (state.onlyNew)   chips.push(['flag', 'f-new', 'Только новинки']);
    if (state.onlyStock) chips.push(['flag', 'f-stock', 'Только в наличии']);
    box.innerHTML = chips.map(([type, val, label]) =>
      `<button class="chip" data-chip="${type}" data-val="${val}">${label}${icon('close')}</button>`).join('');
  }

  $('#chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const { chip: type, val } = chip.dataset;
    if (type === 'q') { if (searchInput) searchInput.value = ''; state.q = ''; }
    else if (type === 'flag') $('#' + val).checked = false;
    else $$(`[data-f="${type}"]`).forEach(i => { if (i.value === val) i.checked = false; });
    apply();
  });

  function draw() {
    const list = filtered();
    $('#catalog-count').textContent = list.length + ' ' + plural(list.length, 'товар', 'товара', 'товаров');
    drawChips();

    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        ${icon('search')}
        <h3>Ничего не нашлось</h3>
        <p>Попробуй убрать часть фильтров или поискать по другому слову.</p>
        <button class="btn btn--red" id="empty-reset">Сбросить фильтры</button>
      </div>`;
      $('#empty-reset').addEventListener('click', () => $('#f-reset').click());
      return;
    }
    renderGrid(grid, list);
  }

  draw();
}

/* ---------- Страница товара ---------- */

function initProduct() {
  const root = $('#product');
  if (!root) return;

  const p = byId(params.get('id')) || PRODUCTS[0];
  document.title = p.name + ' — Куколка';

  $('#crumb-cat').textContent = catName(p.cat);
  $('#crumb-cat').href = 'catalog.html?cat=' + p.cat;
  $('#crumb-name').textContent = p.name;

  $('#p-cat').textContent = catName(p.cat) + ' · ' + p.brand;
  $('#p-name').textContent = p.name;
  $('#p-rating').innerHTML = stars(p.rating) +
    `<span>${p.rating} · ${p.reviews} ${plural(p.reviews, 'отзыв', 'отзыва', 'отзывов')}</span>`;
  $('#p-stock').textContent = p.stock ? 'В наличии' : 'Нет в наличии';
  $('#p-stock').classList.toggle('stock--out', !p.stock);
  $('#p-desc').textContent = p.desc;

  $('#p-price').innerHTML = `<span class="price">${money(p.price)}</span>` +
    (p.old ? `<span class="price__old">${money(p.old)}</span>` : '');
  $('#p-save').textContent = p.old ? `Выгода ${money(p.old - p.price)} — акция до конца недели` : '';

  /* Пока у товара один снимок. Когда появятся ракурсы — добавь массив
     p.gallery в data.js и отрисуй ленту миниатюр под главным фото. */
  $('#p-main').innerHTML = `<img src="${p.img}" alt="${p.name}">`;

  /* Цвета */
  const colorBox = $('#p-colors');
  let color = p.colors[0] || null;
  if (p.colors.length) {
    colorBox.innerHTML = '<h4>Цвет</h4><div class="opt-row">' +
      p.colors.map((c, i) => `<button class="opt ${i === 0 ? 'is-active' : ''}" data-color="${c}">${c}</button>`).join('') +
      '</div>';
    colorBox.addEventListener('click', e => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      $$('[data-color]', colorBox).forEach(x => x.classList.remove('is-active'));
      b.classList.add('is-active');
      color = b.dataset.color;
    });
  } else colorBox.remove();

  /* Количество */
  let qty = 1;
  const qtyField = $('#p-qty');
  $('#qty-minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyField.value = qty; });
  $('#qty-plus').addEventListener('click',  () => { qty = Math.min(99, qty + 1); qtyField.value = qty; });
  qtyField.addEventListener('change', () => { qty = Math.max(1, Math.min(99, +qtyField.value || 1)); qtyField.value = qty; });

  const buy = $('#p-buy');
  buy.disabled = !p.stock;
  if (!p.stock) buy.textContent = 'Нет в наличии';
  buy.addEventListener('click', () => addToCart(p.id, qty, color));

  const favBtn = $('#p-fav');
  favBtn.dataset.fav = p.id;
  favBtn.classList.toggle('is-on', favs.includes(p.id));

  /* Описание: текст товара + уход, подходящий именно его категории */
  const CARE = {
    vibrators: 'Перед первым использованием промойте изделие тёплой водой с нейтральным мылом или обработайте специальным очистителем. Для силикона подходят только лубриканты на водной основе — масляные и силиконовые составы разрушают поверхность.',
    anal: 'Используйте с лубрикантом на водной основе и не спешите. После использования промойте тёплой водой с мылом или обработайте очистителем.',
    bdsm: 'Кожу протирайте влажной тканью и давайте высохнуть при комнатной температуре — рядом с батареей материал грубеет и трескается. Металлические части держите сухими.',
    roleplay: 'Эко-кожу протирайте влажной салфеткой без спирта, текстиль стирайте вручную при 30 °C и сушите в расправленном виде.',
    lube: 'Храните при комнатной температуре, вдали от прямого солнца. После вскрытия используйте в течение шести месяцев.',
    couple: 'Комплект храните в мешочке из коробки, силиконовые элементы мойте тёплой водой с мылом после каждого использования.',
  };

  $('#tab-desc').innerHTML =
    `<p>${p.desc}</p>` +
    `<p>${CARE[p.cat] || ''}</p>` +
    `<p>Мы проверяем каждую партию: материалы имеют сертификаты, а характеристики
     в карточке сняты с реального образца, а не переписаны у поставщика.</p>`;

  /* Характеристики */
  $('#p-specs').innerHTML = Object.entries(p.specs)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  /* Отзывы */
  $('#p-reviews').innerHTML = PRODUCT_REVIEWS.map(r => `<div class="review" style="margin-bottom:14px">
    <div class="rating">${stars(r.rate)}</div>
    <p>«${r.text}»</p>
    <div class="review__who">
      <div class="review__ava">${r.name[0]}</div>
      <div><div class="review__name">${r.name}</div><div class="review__date">${r.date}</div></div>
    </div></div>`).join('');

  /* Табы */
  $('.tabs__nav').addEventListener('click', e => {
    const b = e.target.closest('.tabs__btn');
    if (!b) return;
    $$('.tabs__btn').forEach(x => x.classList.remove('is-active'));
    $$('.tabs__panel').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    $('#tab-' + b.dataset.tab).classList.add('is-active');
  });

  /* Похожие */
  renderGrid($('#similar'), PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4));
}

/* ---------- Страница корзины ---------- */

let discount = 0;

function renderCartPage() {
  const list = $('#cart-list');
  if (!list) return;

  if (!cart.length) {
    $('#cart-wrap').innerHTML = `<div class="empty">
      ${icon('cart')}
      <h3>В корзине пусто</h3>
      <p>Самое время это исправить — в каталоге больше двадцати позиций.</p>
      <a class="btn btn--red" href="catalog.html">Перейти в каталог</a></div>`;
    return;
  }

  list.innerHTML = cart.map(line => {
    const p = byId(line.id);
    return `<div class="cart-item">
      <div class="cart-item__img"><img src="${p.img}" alt="${p.name}"></div>
      <div>
        <div class="cart-item__cat">${catName(p.cat)}${line.color ? ' · ' + line.color : ''}</div>
        <a href="product.html?id=${p.id}"><div class="cart-item__name">${p.name}</div></a>
        <div class="small muted">${money(p.price)} за штуку</div>
      </div>
      <div class="cart-item__side cart-item__ctrl">
        <div class="qty">
          <button data-q="-1" data-id="${p.id}" data-color="${line.color || ''}">${icon('minus')}</button>
          <input value="${line.qty}" readonly>
          <button data-q="1" data-id="${p.id}" data-color="${line.color || ''}">${icon('plus')}</button>
        </div>
        <div class="cart-item__price">${money(p.price * line.qty)}</div>
        <button class="cart-item__del" data-drop="${p.id}" data-color="${line.color || ''}">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('');

  const sum = cartSum();
  const delivery = sum >= 5000 ? 0 : 390;
  const disc = Math.round(sum * discount / 100);

  $('#sum-items').textContent = cartCount() + ' ' + plural(cartCount(), 'товар', 'товара', 'товаров');
  $('#sum-goods').textContent = money(sum);
  $('#sum-delivery').textContent = delivery ? money(delivery) : 'Бесплатно';
  $('#sum-discount').textContent = disc ? '− ' + money(disc) : '—';
  $('#sum-total').textContent = money(sum - disc + delivery);
  Store.write('order-total', sum - disc + delivery);
}

function initCartPage() {
  if (!$('#cart-list')) return;
  renderCartPage();

  $('#cart-wrap').addEventListener('click', e => {
    const q = e.target.closest('[data-q]');
    if (q) {
      const line = cart.find(i => i.id === q.dataset.id && (i.color || '') === q.dataset.color);
      if (line) { setQty(line.id, line.color, line.qty + +q.dataset.q); renderCartPage(); }
    }
  });

  $('#promo-apply')?.addEventListener('click', () => {
    const code = $('#promo-input').value.trim().toUpperCase();
    const msg = $('#promo-msg');
    if (PROMOCODES[code]) {
      discount = PROMOCODES[code];
      msg.textContent = `Промокод принят: −${discount}%`;
      msg.className = 'promo-msg ok';
      toast('Промокод применён');
    } else {
      discount = 0;
      msg.textContent = 'Такого промокода нет. Попробуй КУКОЛКА';
      msg.className = 'promo-msg err';
    }
    renderCartPage();
  });
}

/* ---------- Оформление ---------- */

function initCheckout() {
  const form = $('#checkout-form');
  if (!form) return;

  $('#co-total').textContent = money(Store.read('order-total', cartSum()));
  $('#co-count').textContent = cartCount() + ' ' + plural(cartCount(), 'товар', 'товара', 'товаров');

  const list = $('#co-list');
  list.innerHTML = cart.map(line => {
    const p = byId(line.id);
    return `<div class="summary__row"><span>${p.name} × ${line.qty}</span><b>${money(p.price * line.qty)}</b></div>`;
  }).join('') || '<div class="summary__row">Корзина пуста</div>';

  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    $$('input[required]', form).forEach(i => {
      const bad = !i.value.trim();
      i.classList.toggle('is-error', bad);
      if (bad) ok = false;
    });
    if (!ok) { toast('Заполни отмеченные поля', 'close'); return; }

    const num = 'K-' + String(Math.floor(Math.random() * 90000) + 10000);
    cart = []; saveCart();
    $('#checkout-wrap').innerHTML = `<div class="empty" style="padding:60px 20px">
      <div style="width:88px;height:88px;border-radius:50%;background:var(--red);color:#fff;display:grid;place-items:center;margin:0 auto 24px">
        <svg style="width:44px;height:44px"><use href="#i-check"></use></svg>
      </div>
      <h2 class="h-sub" style="margin-bottom:12px">Заказ ${num} принят</h2>
      <p>Мы напишем в течение 15 минут, чтобы подтвердить детали.<br>
      Упаковка — нейтральная, без логотипов и надписей.</p>
      <a class="btn btn--red" href="index.html">На главную</a>
    </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ---------- Избранное на отдельной странице ---------- */

function initFavs() {
  const grid = $('#favs-grid');
  if (!grid) return;
  const list = PRODUCTS.filter(p => favs.includes(p.id));
  $('#favs-count').textContent = list.length + ' ' + plural(list.length, 'товар', 'товара', 'товаров');
  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      ${icon('heart')}<h3>Здесь пока пусто</h3>
      <p>Жми на сердечко в карточке — товар сохранится сюда.</p>
      <a class="btn btn--red" href="catalog.html">В каталог</a></div>`;
    return;
  }
  renderGrid(grid, list);
}

/* ---------- Старт ---------- */

document.addEventListener('DOMContentLoaded', () => {
  syncBadges();
  initAgeGate();
  initSearch();
  initReveal();
  initTimer();
  initHome();
  initCatalog();
  initProduct();
  initCartPage();
  initCheckout();
  initFavs();
  renderDrawer();

  /* Подсветка активного пункта меню */
  const page = location.pathname.split('/').pop() || 'index.html';
  $$('.nav a, .mobile-nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('is-active');
  });
});
