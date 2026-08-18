/* =============================================================================
   Главная страница ООО «Локомотив» — интерактив редизайна.
   Скролл-ориентированный движок (без зависимости от надёжности
   IntersectionObserver): появление секций, счётчики, таймлайн, карта,
   заглушка расчёта, показ CTA в шапке. Уважает prefers-reduced-motion.
   ========================================================================== */
(function () {
  'use strict';
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Помечаем, что движок появления запущен — стили прячут .rise только под
     .home-ready, поэтому при сбое/отсутствии JS контент виден сразу. */
  document.documentElement.classList.add('home-ready');

  function inView(el, margin) {
    var r = el.getBoundingClientRect();
    margin = margin || 0;
    return r.top < (window.innerHeight - margin) && r.bottom > 0;
  }

  /* Стаггер детей внутри секции */
  var risers = $$('.rise');
  risers.forEach(function (el) {
    var sibs = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.classList.contains('rise'); });
    var i = sibs.indexOf(el);
    if (i > 0) el.style.transitionDelay = (i * 80) + 'ms';
  });

  /* Счётчики цифр — с гарантией финального значения при троттлинге rAF */
  var counted = [];
  function animateCount(el) {
    if (counted.indexOf(el) !== -1) return;
    counted.push(el);
    var target = parseInt(el.getAttribute('data-stat'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduce) { el.textContent = target + suffix; return; }
    var dur = 1200, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + (p >= 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    setTimeout(function () { el.textContent = target + suffix; }, dur + 250); /* подстраховка */
  }

  /* Таймлайн — прорисовка и загорание узлов */
  var tlDone = false;
  function drawTimeline() {
    var tl = $('.timeline');
    if (!tl || tlDone) return;
    tlDone = true;
    tl.classList.add('is-drawn');
    var nodes = $$('.tl-node', tl);
    if (reduce) { nodes.forEach(function (n) { n.classList.add('lit'); }); return; }
    nodes.forEach(function (n, i) { setTimeout(function () { n.classList.add('lit'); }, 300 + i * 260); });
  }

  var hero = $('.hero2');
  var headerCta = $('.header__cta');

  function sweep() {
    for (var i = risers.length - 1; i >= 0; i--) {
      if (inView(risers[i], 40)) { risers[i].classList.add('is-in'); }
    }
    $$('[data-stat]').forEach(function (el) { if (inView(el, 40)) animateCount(el); });
    var tl = $('.timeline');
    if (tl && inView(tl, 80)) drawTimeline();
    if (hero && headerCta) { headerCta.classList.toggle('is-shown', hero.getBoundingClientRect().bottom < 80); }
  }

  if (reduce) {
    risers.forEach(function (el) { el.classList.add('is-in'); });
    $$('[data-stat]').forEach(animateCount);
    drawTimeline();
  }
  sweep();
  window.addEventListener('scroll', sweep, { passive: true });
  window.addEventListener('resize', sweep, { passive: true });
  setTimeout(sweep, 300);
  setTimeout(sweep, 1000);

  /* Карта маршрутов — прорисовка дуг */
  $$('.rm-arc').forEach(function (arc, i) {
    var len = 400;
    try { len = arc.getTotalLength(); } catch (e) {}
    if (reduce) { arc.style.strokeDashoffset = 0; return; }
    arc.style.strokeDasharray = len;
    arc.style.strokeDashoffset = len;
    arc.style.transition = 'stroke-dashoffset 1.2s ease ' + (i * 0.2) + 's';
    requestAnimationFrame(function () { requestAnimationFrame(function () { arc.style.strokeDashoffset = 0; }); });
  });

  /* Заглушка калькулятора */
  var b = $('#calc2-btn'), r = $('#calc2-result');
  if (b && r) { b.addEventListener('click', function () { r.hidden = false; var el = $('#calc2-contact', r); if (el) el.focus(); }); }
})();
