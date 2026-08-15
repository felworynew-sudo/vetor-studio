/* ============================================================
   КУКОЛКА — набор иконок (нарисованы вручную, единая сетка 24×24)
   Спрайт вставляется в начало <body>, иконки берутся через
   <svg class="..."><use href="#i-cart"></use></svg>
   ============================================================ */
(function () {
  var S = [];

  function ico(id, body, opt) {
    opt = opt || {};
    S.push(
      '<symbol id="i-' + id + '" viewBox="0 0 24 24" fill="' + (opt.fill || 'none') + '" ' +
      'stroke="' + (opt.stroke || 'currentColor') + '" stroke-width="' + (opt.w || 1.8) + '" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + body + '</symbol>'
    );
  }

  /* ---------- Интерфейс ---------- */

  ico('search', '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>');

  ico('user', '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.6-4 3.8-6.2 7.5-6.2s6.9 2.2 7.5 6.2"/>');

  ico('cart', '<path d="M3 4h2.2l2.3 10.5a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/>' +
              '<circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>');

  ico('heart', '<path d="M12 20.3s-7.6-4.6-7.6-9.7A4.3 4.3 0 0 1 12 8.2a4.3 4.3 0 0 1 7.6 2.4c0 5.1-7.6 9.7-7.6 9.7z"/>');

  ico('heart-fill', '<path d="M12 20.3s-7.6-4.6-7.6-9.7A4.3 4.3 0 0 1 12 8.2a4.3 4.3 0 0 1 7.6 2.4c0 5.1-7.6 9.7-7.6 9.7z"/>',
    { fill: 'currentColor', stroke: 'none' });

  /* Фирменный знак: сердце с рожками и хвостиком */
  ico('heart-devil',
    '<path d="M12 21s-7.8-4.8-7.8-10A4.4 4.4 0 0 1 12 8.4a4.4 4.4 0 0 1 7.8 2.6c0 5.2-7.8 10-7.8 10z" fill="currentColor" stroke="none"/>' +
    '<path d="M6.4 8.3C5.1 6.9 4.3 5.3 4.1 3.4c1.7.6 3.1 1.7 4.2 3.2" fill="currentColor" stroke="none"/>' +
    '<path d="M17.6 8.3c1.3-1.4 2.1-3 2.3-4.9-1.7.6-3.1 1.7-4.2 3.2" fill="currentColor" stroke="none"/>',
    { fill: 'currentColor', stroke: 'none' });

  ico('close', '<path d="M6 6l12 12M18 6L6 18"/>');
  ico('plus', '<path d="M12 5v14M5 12h14"/>');
  ico('minus', '<path d="M5 12h14"/>');
  ico('check', '<path d="M5 12.5l4.5 4.5L19 7.5"/>', { w: 2.6 });
  ico('arrow-right', '<path d="M4 12h15"/><path d="M13.5 6.5L20 12l-6.5 5.5"/>');
  ico('arrow-left', '<path d="M20 12H5"/><path d="M10.5 6.5L4 12l6.5 5.5"/>');
  ico('chevron-down', '<path d="M6 9.5l6 6 6-6"/>');
  ico('trash', '<path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/>' +
               '<path d="M6.5 6.5l.9 12.4a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.4"/>' +
               '<path d="M10.3 10.5v6M13.7 10.5v6"/>');
  ico('menu', '<path d="M4 7h16M4 12h16M4 17h11"/>', { w: 2.2 });
  ico('send', '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8 21 3z"/>');
  ico('filter', '<path d="M4 6h16M7 12h10M10 18h4"/>', { w: 2.2 });

  ico('star', '<path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.6z"/>',
    { fill: 'currentColor', stroke: 'none' });

  ico('star-half',
    '<defs><linearGradient id="halfg"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs>' +
    '<path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.6z" fill="url(#halfg)" stroke="currentColor" stroke-width="1.3"/>',
    { stroke: 'none' });

  ico('sparkle', '<path d="M12 2.5c.7 5.4 3.4 8.1 8.8 8.8-5.4.7-8.1 3.4-8.8 8.8-.7-5.4-3.4-8.1-8.8-8.8 5.4-.7 8.1-3.4 8.8-8.8z"/>',
    { fill: 'currentColor', stroke: 'none' });

  /* ---------- Преимущества ---------- */

  ico('lock', '<rect x="4.5" y="10" width="15" height="10.5" rx="2.4"/>' +
              '<path d="M8 10V7.6a4 4 0 0 1 8 0V10"/><path d="M12 14v2.6"/>');

  ico('box', '<path d="M3.5 7.8L12 3.5l8.5 4.3v8.4L12 20.5l-8.5-4.3V7.8z"/>' +
             '<path d="M3.5 7.8L12 12.1l8.5-4.3M12 12.1v8.4"/>');

  ico('truck', '<path d="M2.5 7.5h10.8v9.2H2.5z"/><path d="M13.3 10.8h3.6l3.1 3v2.9h-6.7z"/>' +
               '<circle cx="7" cy="18.4" r="1.7"/><circle cx="17.2" cy="18.4" r="1.7"/>');

  ico('percent', '<path d="M6.5 17.5l11-11"/><circle cx="7.6" cy="7.6" r="2.6"/><circle cx="16.4" cy="16.4" r="2.6"/>');

  ico('shield', '<path d="M12 3.2l7.2 2.7v5.6c0 4.3-2.9 7.5-7.2 9.3-4.3-1.8-7.2-5-7.2-9.3V5.9L12 3.2z"/>' +
                '<path d="M9 12.2l2.2 2.2 4-4.2"/>');

  ico('support', '<path d="M4.6 14.5v-2.6a7.4 7.4 0 0 1 14.8 0v2.6"/>' +
                 '<rect x="2.8" y="12.8" width="3.6" height="5.6" rx="1.8"/>' +
                 '<rect x="17.6" y="12.8" width="3.6" height="5.6" rx="1.8"/>' +
                 '<path d="M19.4 18.4v.6a2.5 2.5 0 0 1-2.5 2.5H13"/>');

  ico('gift', '<rect x="3.5" y="9.2" width="17" height="4.2" rx="1"/><path d="M5.2 13.4v6.1a1.4 1.4 0 0 0 1.4 1.4h10.8a1.4 1.4 0 0 0 1.4-1.4v-6.1"/>' +
              '<path d="M12 9.2v11.7"/>' +
              '<path d="M12 9.2H7.9a2.35 2.35 0 1 1 0-4.7c2.6 0 4.1 4.7 4.1 4.7z"/>' +
              '<path d="M12 9.2h4.1a2.35 2.35 0 1 0 0-4.7C13.5 4.5 12 9.2 12 9.2z"/>');

  /* ---------- Соцсети ---------- */

  ico('vk', '<path d="M3.2 7.2h3c.3 3.6 1.9 5.9 3 5.9.4 0 .6-.2.6-1V8.3c-.1-1.4-.9-1.5-.9-1.5.3-.4 1.1-.6 2.2-.6 1.4 0 1.9.6 1.9 1.9v3.4c0 .6.3.8.5.8.4 0 1.6-1.2 2.7-4h2.9c-.6 2.4-2 4.2-2.9 5.2 0 0 1.9 1.7 2.6 3.7h-3.2c-.6-1.5-2-2.6-2.6-2.6v2.6H9.8c-3 0-6.6-4.4-6.6-9.9z"/>',
    { fill: 'currentColor', stroke: 'none' });

  ico('telegram', '<path d="M21.3 4.2L2.9 11.3c-.9.3-.9 1.5 0 1.8l4.5 1.5 1.7 5.2c.2.7 1.1.8 1.6.3l2.5-2.4 4.5 3.3c.6.4 1.5.1 1.7-.7l3-14.6c.2-.9-.7-1.6-1.1-1.5z"/>' +
    '<path d="M7.4 14.6L18 7.5l-7.6 8.2-.3 3.5" stroke="#fff" stroke-width="1" fill="none"/>',
    { fill: 'currentColor', stroke: 'none' });

  ico('instagram', '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.1" cy="6.9" r="1.1" fill="currentColor"/>');

  ico('whatsapp', '<path d="M3.5 20.5l1.3-4.2a8 8 0 1 1 3 3l-4.3 1.2z"/><path d="M9 9.2c.3 2.6 3 5.3 5.6 5.6.6.1 1.4-.7 1.4-1.4l-1.7-.9-1.1 1a6.6 6.6 0 0 1-2.4-2.4l1-1.1-.9-1.7c-.7 0-1.5.8-1.4 1.4z"/>');

  /* ---------- Витрина ---------- */

  ico('bolt', '<path d="M13.2 2.5L4.5 13.4h6.1l-.9 8.1 9-11H12.4l.8-8z"/>');
  ico('eye', '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.1"/>');
  ico('refresh', '<path d="M20.4 12a8.4 8.4 0 1 1-2.5-6"/><path d="M20.6 4.2v4.4h-4.4"/>');
  ico('card', '<rect x="2.6" y="5.4" width="18.8" height="13.2" rx="2.6"/><path d="M2.6 10h18.8"/><path d="M6.4 14.6h3.4"/>');
  ico('cash', '<rect x="2.6" y="6" width="18.8" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.4v5.2M18 9.4v5.2"/>');
  ico('pin', '<path d="M12 21.4s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10.2" r="2.7"/>');
  ico('phone', '<path d="M6.4 3.4h3l1.6 4-2 1.5a11 11 0 0 0 6.1 6.1l1.5-2 4 1.6v3a2 2 0 0 1-2.2 2C11.2 22.2 1.8 12.8 1.4 5.6a2 2 0 0 1 2-2.2z"/>');
  ico('mail', '<rect x="2.6" y="5" width="18.8" height="14" rx="2.4"/><path d="M3.4 6.8L12 13l8.6-6.2"/>');
  ico('clock', '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>');

  document.write('<svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">' + S.join('') + '</svg>');
})();
