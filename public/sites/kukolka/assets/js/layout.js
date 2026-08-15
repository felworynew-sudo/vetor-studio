/* ============================================================
   КУКОЛКА — общие блоки: шапка, меню, мини-корзина, подвал, 18+
   Правится в одном месте и применяется ко всем страницам.
   На странице достаточно поставить <div data-layout="header"></div>
   ============================================================ */

const LAYOUT = {

  header: `
  <div class="topbar">
    <div class="container topbar__row">
      <span class="topbar__mark"><svg style="width:15px;height:15px"><use href="#i-heart-devil"></use></svg> Анонимная доставка по всей России</span>
      <ul class="topbar__list">
        <li><a href="delivery.html">Доставка и оплата</a></li>
        <li><a href="delivery.html#faq">Вопросы</a></li>
        <li><a href="tel:+78005553535">8 800 555-35-35</a></li>
      </ul>
    </div>
  </div>

  <header class="header">
    <div class="container header__row">
      <button class="icon-btn burger" id="open-menu" aria-label="Меню"><svg><use href="#i-menu"></use></svg></button>

      <a class="logo" href="index.html" aria-label="Куколка — на главную">
        <img src="assets/img/brand/logo-full.svg" alt="Куколка">
      </a>

      <nav class="nav">
        <a href="catalog.html">Каталог</a>
        <a href="catalog.html?new=1">Новинки</a>
        <a href="catalog.html?sale=1">Акции</a>
        <a href="about.html">О нас</a>
        <a href="delivery.html">Доставка</a>
      </nav>

      <div class="search">
        <input class="search__field" id="search-field" type="search" placeholder="Что ищем?" autocomplete="off">
        <button class="search__btn" aria-label="Найти"><svg><use href="#i-search"></use></svg></button>
        <div class="suggest" id="suggest"></div>
      </div>

      <div class="header__actions">
        <a class="icon-btn" href="favorites.html" aria-label="Избранное">
          <svg><use href="#i-heart"></use></svg>
          <span class="icon-btn__badge" data-badge="favs">0</span>
        </a>
        <button class="icon-btn" id="open-cart" aria-label="Корзина">
          <svg><use href="#i-cart"></use></svg>
          <span class="icon-btn__badge" data-badge="cart">0</span>
        </button>
      </div>
    </div>
  </header>

  <nav class="mobile-nav">
    <button class="mobile-nav__close" data-close aria-label="Закрыть"><svg style="width:24px;height:24px"><use href="#i-close"></use></svg></button>
    <img class="mobile-nav__logo" src="assets/img/brand/logo-full.svg" alt="Куколка">
    <a href="index.html">Главная</a>
    <a href="catalog.html">Каталог</a>
    <a href="catalog.html?new=1">Новинки</a>
    <a href="catalog.html?sale=1">Акции</a>
    <a href="favorites.html">Избранное</a>
    <a href="about.html">О нас</a>
    <a href="delivery.html">Доставка</a>
    <a href="cart.html">Корзина</a>
  </nav>`,

  drawer: `
  <aside class="drawer" id="drawer">
    <div class="drawer__head">
      <h3>Корзина</h3>
      <button class="icon-btn" data-close aria-label="Закрыть"><svg><use href="#i-close"></use></svg></button>
    </div>
    <div class="drawer__body" id="drawer-body"></div>
    <div class="drawer__foot">
      <div class="drawer__total"><span>Итого</span><b id="drawer-total">0 ₽</b></div>
      <a class="btn btn--red btn--block" href="cart.html">Оформить заказ</a>
      <p class="form-note" style="text-align:center">Упаковка нейтральная, без логотипов</p>
    </div>
  </aside>`,

  footer: `
  <footer class="footer">
    <div class="container">
      <div class="footer__grid">
        <div>
          <a class="logo logo--footer" href="index.html" aria-label="Куколка — на главную">
            <img src="assets/img/brand/logo-full.svg" alt="Куколка">
          </a>
          <p class="footer__about">Магазин для взрослых, где не задают лишних вопросов.
          Проверенные бренды, честные описания и доставка, о которой знаешь только ты.</p>
          <div class="socials">
            <a href="#" aria-label="ВКонтакте"><svg><use href="#i-vk"></use></svg></a>
            <a href="#" aria-label="Telegram"><svg><use href="#i-telegram"></use></svg></a>
            <a href="#" aria-label="Instagram"><svg><use href="#i-instagram"></use></svg></a>
          </div>
        </div>
        <div>
          <h4>Покупателям</h4>
          <ul>
            <li><a href="catalog.html">Каталог</a></li>
            <li><a href="delivery.html">Доставка и оплата</a></li>
            <li><a href="delivery.html#return">Возврат и обмен</a></li>
            <li><a href="delivery.html#faq">Частые вопросы</a></li>
          </ul>
        </div>
        <div>
          <h4>Информация</h4>
          <ul>
            <li><a href="about.html">О бренде</a></li>
            <li><a href="catalog.html?sale=1">Акции</a></li>
            <li><a href="#">Политика конфиденциальности</a></li>
            <li><a href="#">Пользовательское соглашение</a></li>
          </ul>
        </div>
        <div>
          <h4>Связаться</h4>
          <ul>
            <li><a href="tel:+78005553535">8 800 555-35-35</a></li>
            <li><a href="mailto:hi@kukolka.ru">hi@kukolka.ru</a></li>
            <li>Ежедневно, 9:00–21:00</li>
            <li><a href="#">Написать в Telegram</a></li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <span>© 2026 Куколка. Все права защищены.</span>
        <span>Товары для взрослых. Не является публичной офертой.</span>
        <span class="age-mark">18+</span>
      </div>
    </div>
  </footer>`,

  ageGate: `
  <div class="age-gate" id="age-gate" hidden>
    <div class="age-gate__card">
      <img class="age-gate__logo" src="assets/img/brand/logo-full.svg" alt="Куколка">
      <h2 class="h-sub">Тебе есть 18 лет?</h2>
      <p>На сайте есть материалы для взрослых. Заходя дальше, ты подтверждаешь свой возраст.</p>
      <div class="age-gate__btns">
        <button class="btn btn--red" id="age-yes">Да, мне есть 18</button>
        <button class="btn btn--ghost-light" id="age-no">Нет, я уйду</button>
      </div>
      <p class="age-gate__note">Мы не храним персональные данные без твоего согласия</p>
    </div>
  </div>`,

};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-layout]').forEach(slot => {
    const html = LAYOUT[slot.dataset.layout];
    if (html) slot.outerHTML = html;
  });
  document.body.insertAdjacentHTML('beforeend', LAYOUT.drawer + LAYOUT.ageGate);
}, { once: true });
