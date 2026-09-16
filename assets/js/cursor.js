/* =============================================================================
   cursor.js — золотая стрелка вместо системного указателя и золотая пыльца.
   Подключается на ВСЕХ страницах сайта: курсор должен быть одинаковым везде,
   иначе при переходе с главной указатель менялся на системный.
   Самодостаточен: ничего из v2.js не требует.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var reducedMotion = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------- Фирменный курсор -----------------------------
     Золотая стрелка вместо системного указателя и золотая пыльца следом.
     Стрелка — один DOM-элемент на transform, пыльца — canvas: частиц много,
     а перерисовка одна на кадр, без создания и удаления узлов DOM.
     Включается только там, где есть мышь и не выключены анимации.        */
  (function () {
    var fine = w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine || reducedMotion) return;

    var root = d.documentElement;

    /* --- стрелка --- */
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

    /* --- холст для пыльцы --- */
    var canvas = d.createElement('canvas');
    canvas.className = 'cursor-dust';
    canvas.setAttribute('aria-hidden', 'true');
    d.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(w.devicePixelRatio || 1, 2);

    function size() {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener('resize', size);

    root.classList.add('has-cursor');

    var mx = -100, my = -100, px = mx, py = my;
    var dust = [];
    var GOLD = ['#F6E7B4', '#E3C46A', '#D4AF37', '#C9A227'];
    var MAX = 220;                       // потолок частиц: выше — не красивее, только дороже

    function spawn(x, y, speed) {
      /* Чем быстрее движется мышь, тем гуще шлейф — как настоящая пыльца. */
      var count = Math.min(5, 2 + Math.floor(speed / 10));
      for (var i = 0; i < count && dust.length < MAX; i++) {
        dust.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.5,
          vy: Math.random() * 0.35 + 0.08,     // слегка оседает вниз
          r: Math.random() * 2 + 0.7,
          life: 1,
          fade: Math.random() * 0.01 + 0.009,
          color: GOLD[(Math.random() * GOLD.length) | 0]
        });
      }
    }

    addEventListener('mousemove', function (e) {
      var speed = Math.hypot(e.clientX - mx, e.clientY - my);
      mx = e.clientX; my = e.clientY;
      root.classList.add('cursor-visible');
      if (speed > 1) spawn(mx, my, speed);

      var el = e.target;
      root.classList.toggle('cursor-active', !!(el && el.closest && el.closest('a, button, select, input, textarea, summary, label, [role="button"]')));
    }, { passive: true });

    addEventListener('mouseleave', function () { root.classList.remove('cursor-visible'); });
    addEventListener('mousedown', function () {
      root.classList.add('cursor-press');
      for (var i = 0; i < 10; i++) spawn(mx, my, 24);   // всплеск пыльцы по клику
    });
    addEventListener('mouseup', function () { root.classList.remove('cursor-press'); });

    (function frame() {
      /* стрелка идёт за мышью почти вплотную — небольшое сглаживание убирает
         дрожание, но не создаёт ощущения задержки */
      px += (mx - px) * 0.55;
      py += (my - py) * 0.55;
      arrow.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';

      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (var i = dust.length - 1; i >= 0; i--) {
        var p = dust[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.008;                 // лёгкая тяжесть: пыльца оседает
        p.life -= p.fade;
        if (p.life <= 0) { dust.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(p.life, 0) * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    })();
  })();

  /* Возврат «назад» отдаёт страницу из кэша браузера без перезапуска скриптов.
     Класс, прячущий системный курсор, при этом остаётся — а стрелка может
     не восстановиться. Поэтому на выходе класс снимаем, на входе ставим. */
  addEventListener('pagehide', function () { d.documentElement.classList.remove('has-cursor'); });
  addEventListener('pageshow', function () {
    if (d.querySelector('.cursor-arrow')) d.documentElement.classList.add('has-cursor');
  });
})(window, document);
