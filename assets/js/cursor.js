/* =============================================================================
   cursor.js — золотая стрелка вместо системного указателя.
   -----------------------------------------------------------------------------
   Без анимации (Тати, 17.09.2026): ни пыльцы, ни сглаживания, ни эффектов при
   наведении — стрелка просто идёт за мышью один в один. Позиция обновляется
   в обработчике движения, отдельного цикла отрисовки нет.
   Подключается на всех страницах сайта, чтобы курсор был везде одинаковым.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var fine = w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return;                    // телефоны и планшеты — системный курсор

  var root = d.documentElement;
  var arrow = d.createElement('div');
  arrow.className = 'cursor-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML =
    '<svg viewBox="0 0 24 24" width="26" height="26">' +
      '<defs><linearGradient id="curGold" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#F6E7B4"/><stop offset="45%" stop-color="#D4AF37"/>' +
        '<stop offset="100%" stop-color="#A5811A"/></linearGradient></defs>' +
      '<path d="M4 2.2 L4 18.6 L8.3 14.6 L10.9 20.8 L13.7 19.6 L11.1 13.6 L17.2 13.4 Z" ' +
        'fill="url(#curGold)" stroke="rgba(9,20,42,.55)" stroke-width="1" stroke-linejoin="round"/>' +
    '</svg>';
  d.body.appendChild(arrow);
  root.classList.add('has-cursor');

  addEventListener('mousemove', function (e) {
    arrow.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
    root.classList.add('cursor-visible');
  }, { passive: true });

  addEventListener('mouseleave', function () { root.classList.remove('cursor-visible'); });

  /* Возврат «назад» отдаёт страницу из кэша браузера без перезапуска скриптов.
     Класс, прячущий системный курсор, при этом остаётся — а стрелка может
     не восстановиться. Поэтому на выходе класс снимаем, на входе ставим. */
  addEventListener('pagehide', function () { root.classList.remove('has-cursor'); });
  addEventListener('pageshow', function () {
    if (d.querySelector('.cursor-arrow')) root.classList.add('has-cursor');
  });
})(window, document);
