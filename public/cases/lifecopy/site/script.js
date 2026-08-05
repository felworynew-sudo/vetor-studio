/* ============ ЛАЙФ КОПИ — landing interactions ============ */
(function () {
  'use strict';

  /* ---- sticky header shadow ---- */
  const header = document.getElementById('header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- mobile burger menu ---- */
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.classList.toggle('active', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('.nav__link').forEach(l =>
    l.addEventListener('click', () => {
      nav.classList.remove('open');
      burger.classList.remove('active');
      burger.setAttribute('aria-expanded', 'false');
    })
  );

  /* ---- scroll reveal ---- */
  const io = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    }),
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---- gallery expand / collapse ---- */
  const catalog = document.getElementById('catalog');
  const toggleGallery = document.getElementById('toggleGallery');
  toggleGallery.addEventListener('click', () => {
    const expanded = catalog.classList.toggle('expanded');
    toggleGallery.firstChild.textContent = expanded ? 'Свернуть ' : 'Смотреть все работы ';
    if (expanded) {
      catalog.querySelectorAll('.cat-card--extra').forEach(c => io.observe(c));
    }
  });

  /* ---- инерционный наклон плашки «Стоимость» ---- */
  const pricing = document.querySelector('.pricing');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (pricing && !reduceMotion) {
    const MAX_TILT = 9;   // максимальный угол по краям, °
    const PUSH = 14;      // «продавливание» вглубь, px
    let releaseTimer = null;

    const tiltTo = e => {
      const r = pricing.getBoundingClientRect();
      // -1..1 от центра плашки: 0 в середине, ±1 у краёв
      const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
      // клик слева -> уходит влево, сверху -> клонится назад-вверх
      const rotY = dx * MAX_TILT;
      const rotX = -dy * MAX_TILT;
      // ближе к центру — меньше поворот, но заметнее «нажатие» вглубь
      const dist = Math.min(1, Math.hypot(dx, dy));
      const push = PUSH * (1 - dist * 0.55);

      clearTimeout(releaseTimer);
      pricing.classList.remove('is-releasing');
      pricing.style.transform =
        `perspective(1100px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(-${push.toFixed(1)}px)`;
    };

    const release = () => {
      // пружинный возврат: класс даёт easing с лёгким перелётом
      pricing.classList.add('is-releasing');
      pricing.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) translateZ(0)';
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        pricing.classList.remove('is-releasing');
        pricing.style.transform = '';
      }, 900);
    };

    pricing.addEventListener('pointerdown', tiltTo);
    pricing.addEventListener('pointerup', release);
    pricing.addEventListener('pointerleave', release);
    pricing.addEventListener('pointercancel', release);
  }

  /* ============ BOOKING MODAL ============ */
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  const form = document.getElementById('bookingForm');
  const savedBody = modalBody.innerHTML;
  let lastFocus = null;

  const openModal = () => {
    lastFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const first = modal.querySelector('input');
    if (first) setTimeout(() => first.focus(), 60);
  };
  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // restore fresh form so it can be reused after a success screen
    modalBody.innerHTML = savedBody;
    bindForm();
    if (lastFocus) lastFocus.focus();
  };

  document.querySelectorAll('[data-open-modal]').forEach(b => b.addEventListener('click', openModal));
  modal.addEventListener('click', e => { if (e.target.matches('[data-close-modal]')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  /* ---- phone auto-format (RU) ---- */
  function formatPhone(v) {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    let out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ') ' + d.slice(4, 7);
    if (d.length >= 7) out += '-' + d.slice(7, 9);
    if (d.length >= 9) out += '-' + d.slice(9, 11);
    return out;
  }

  function setError(field, msg) {
    const wrap = field.closest('.field');
    wrap.classList.toggle('invalid', !!msg);
    const err = wrap.querySelector('.field__err');
    if (err) err.textContent = msg || '';
  }

  function bindForm() {
    const f = document.getElementById('bookingForm');
    if (!f) return;

    // set date min = today
    const dateInput = f.querySelector('input[name="date"]');
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];

    const phone = f.querySelector('input[name="phone"]');
    phone.addEventListener('input', () => {
      phone.value = formatPhone(phone.value);
      if (phone.closest('.field').classList.contains('invalid')) setError(phone, '');
    });

    const name = f.querySelector('input[name="name"]');
    name.addEventListener('input', () => {
      if (name.closest('.field').classList.contains('invalid')) setError(name, '');
    });

    f.addEventListener('submit', e => {
      e.preventDefault();
      let ok = true;

      if (name.value.trim().length < 2) { setError(name, 'Введите имя'); ok = false; }
      const digits = phone.value.replace(/\D/g, '');
      if (digits.length < 11) { setError(phone, 'Введите телефон полностью'); ok = false; }

      if (!ok) { f.querySelector('.field.invalid input').focus(); return; }

      // "Send" — in production POST to a backend / CRM / Telegram bot here.
      const data = Object.fromEntries(new FormData(f).entries());
      console.log('Заявка ЛАЙФ КОПИ:', data);

      modalBody.innerHTML =
        '<div class="form__success">' +
        '<div class="ok">✓</div>' +
        '<h3>Заявка отправлена!</h3>' +
        '<p>Спасибо, ' + escapeHtml(data.name.trim()) + '. Мы свяжемся с вами в ближайшее время, чтобы подтвердить запись.</p>' +
        '<button class="btn btn--primary btn--lg" data-close-modal style="margin-top:24px">Готово</button>' +
        '</div>';
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  bindForm();
})();
