/* ========================================================================
   КИСЛОТА — main.js
   ======================================================================== */
(function () {
  'use strict';

  /* ---- Header shadow on scroll ---- */
  var header = document.getElementById('header');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');
  var mmClose = document.getElementById('mmClose');
  function openMenu() { if (menu) { menu.classList.add('open'); burger && burger.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  function closeMenu() { if (menu) { menu.classList.remove('open'); burger && burger.classList.remove('open'); document.body.style.overflow = ''; } }
  burger && burger.addEventListener('click', openMenu);
  mmClose && mmClose.addEventListener('click', closeMenu);
  if (menu) {
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
  }

  /* ---- Price tabs ---- */
  var tabs = document.querySelectorAll('.price-tab');
  if (tabs.length) {
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelectorAll('.price-panel').forEach(function (p) {
          p.classList.toggle('active', p.id === 'tab-' + target);
        });
      });
    });
  }

  /* ---- Reviews slider ---- */
  var slides = document.querySelectorAll('.rev-slide');
  var dotsWrap = document.getElementById('revDots');
  var prevBtn = document.getElementById('revPrev');
  var nextBtn = document.getElementById('revNext');
  if (slides.length && dotsWrap) {
    var cur = 0, timer = null;
    slides.forEach(function (_, i) {
      var d = document.createElement('button');
      d.className = 'rev-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', 'Отзыв ' + (i + 1));
      d.addEventListener('click', function () { go(i); });
      dotsWrap.appendChild(d);
    });
    var dots = dotsWrap.querySelectorAll('.rev-dot');
    function go(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) { s.classList.toggle('active', j === cur); });
      dots.forEach(function (d, j) { d.classList.toggle('active', j === cur); });
    }
    function next() { go(cur + 1); }
    function prev() { go(cur - 1); }
    nextBtn && nextBtn.addEventListener('click', function () { next(); restart(); });
    prevBtn && prevBtn.addEventListener('click', function () { prev(); restart(); });
    function restart() { clearInterval(timer); timer = setInterval(next, 6000); }
    restart();
  }

  /* ---- Auto-build works gallery from assets/gallery/ ----
     Файлы: assets/gallery/01.webp, 02.webp … До GALLERY_COUNT включительно.
     Ретушь: перезапиши файл тем же именем. Больше/меньше фото — поменяй число ниже. */
  var GALLERY_COUNT = 40;
  var GALLERY_DIR = 'assets/gallery/';
  var galGrid = document.getElementById('worksGrid');
  if (galGrid && galGrid.getAttribute('data-auto') === 'gallery') {
    var parts = [];
    for (var gi = 1; gi <= GALLERY_COUNT; gi++) {
      var nn = (gi < 10 ? '0' : '') + gi;
      parts.push(
        '<div class="work"><img loading="lazy" src="' + GALLERY_DIR + nn + '.webp" ' +
        'alt="Работа студии КИСЛОТА №' + gi + '"><span class="zoom">⤢</span></div>'
      );
    }
    galGrid.innerHTML = parts.join('');
    galGrid.setAttribute('data-count', GALLERY_COUNT);

    /* ---- Horizontal ribbon: slow auto-drift + manual drag/swipe ---- */
    (function () {
      var strip = galGrid;
      // duplicate the whole set so the scroll can loop seamlessly
      strip.insertAdjacentHTML('beforeend', strip.innerHTML);
      var half = 0;
      function measure() { half = strip.scrollWidth / 2; }
      function wrap() {
        if (half <= 0) return;
        if (strip.scrollLeft >= half) strip.scrollLeft -= half;
        else if (strip.scrollLeft < 0) strip.scrollLeft += half;
      }
      var SPEED = 0.5;                       // px per frame — slow drift
      var paused = false, dragging = false, moved = false, startX = 0, startScroll = 0;
      function tick() {
        if (!paused && !dragging) { strip.scrollLeft += SPEED; wrap(); }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      measure();
      window.addEventListener('resize', measure);
      strip.querySelectorAll('img').forEach(function (im) { if (!im.complete) im.addEventListener('load', measure); });

      // pause the drift while the pointer is over the strip (desktop)
      strip.addEventListener('mouseenter', function () { paused = true; });
      strip.addEventListener('mouseleave', function () { paused = false; });

      // mouse drag-to-scroll (touch/pen keep native momentum scrolling)
      strip.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse') return;
        dragging = true; moved = false; startX = e.clientX; startScroll = strip.scrollLeft;
        strip.classList.add('dragging');
        try { strip.setPointerCapture(e.pointerId); } catch (_) {}
      });
      strip.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 5) moved = true;
        strip.scrollLeft = startScroll - dx; wrap();
      });
      function endDrag() { if (dragging) { dragging = false; strip.classList.remove('dragging'); } }
      strip.addEventListener('pointerup', endDrag);
      strip.addEventListener('pointercancel', endDrag);
      // swallow the click that ends a drag, so the lightbox doesn't open
      strip.addEventListener('click', function (e) {
        if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
      }, true);
    })();
  }

  /* ---- Lightbox gallery ---- */
  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var grid = document.getElementById('worksGrid');
  if (lb && lbImg && grid) {
    var workEls = grid.querySelectorAll('.work');
    // the ribbon duplicates its tiles for looping — use only the unique originals
    var count = parseInt(grid.getAttribute('data-count'), 10) || workEls.length;
    var imgs = Array.prototype.slice.call(workEls, 0, count).map(function (w) {
      var im = w.querySelector('img');
      return { src: im.getAttribute('src'), alt: im.getAttribute('alt') || '' };
    });
    var idx = 0;
    function show(i) {
      idx = (i + imgs.length) % imgs.length;
      lbImg.setAttribute('src', imgs[idx].src);
      lbImg.setAttribute('alt', imgs[idx].alt);
    }
    function open(i) { show(i); lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
    workEls.forEach(function (w, i) {
      w.addEventListener('click', function () { open(i % count); });
    });
    document.getElementById('lbClose').addEventListener('click', close);
    document.getElementById('lbNext').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
    document.getElementById('lbPrev').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(idx + 1);
      if (e.key === 'ArrowLeft') show(idx - 1);
    });
  }

  /* ---- Reveal on scroll ---- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Floating bubbles in hero (decorative) ---- */
  var heroVisual = document.querySelector('.hero-visual');
  if (heroVisual) {
    var specs = [
      { s: 22, l: 2, t: 12, d: 0 },
      { s: 14, l: 24, t: 4, d: 1.2 },
      { s: 30, l: -2, t: 46, d: .5 },
      { s: 12, l: 16, t: 64, d: 1.8 }
    ];
    specs.forEach(function (b) {
      var el = document.createElement('span');
      el.className = 'bubble-dot';
      el.style.width = el.style.height = b.s + 'px';
      el.style.left = b.l + '%';
      el.style.top = b.t + '%';
      el.style.animationDelay = b.d + 's';
      heroVisual.appendChild(el);
    });
  }

  /* ---- Smooth-scroll for in-page anchors + active nav ---- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length > 1) {
        var el = document.querySelector(id);
        if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
      }
    });
  });
})();
