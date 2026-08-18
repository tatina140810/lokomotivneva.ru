/* =============================================================================
   ООО «Локомотив» — интерактив лендинга (ванильный JS, без зависимостей)

   Блоки:
     1. Утилиты
     2. Шапка: фон при прокрутке, мобильное меню, подсветка активного пункта
     3. Появление блоков при прокрутке (IntersectionObserver)
     4. Счётчики в hero
     5. Точечная карта мира и анимированные маршруты
     6. Форма заявки: маска телефона, валидация, уведомление
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* Помечаем, что JS активен: стили прячут .reveal только под .is-js,
     поэтому при отключённом JS контент виден сразу (no-JS фолбэк). */
  document.documentElement.classList.add('is-js');

  /* Пользователь мог попросить систему отключить анимации — уважаем это */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ========================= 2. Шапка и навигация ========================= */
  var header = $('#header');
  var burger = $('#burger');
  var nav = $('#nav');

  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 20);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function closeMenu() {
    nav.classList.remove('is-open');
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  }

  burger.addEventListener('click', function () {
    var willOpen = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', willOpen);
    burger.classList.toggle('is-open', willOpen);
    burger.setAttribute('aria-expanded', String(willOpen));
    burger.setAttribute('aria-label', willOpen ? 'Закрыть меню' : 'Открыть меню');
  });

  /* Закрываем меню после перехода по якорю и по Escape */
  $$('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  /* Подсветка пункта меню для секции, которая сейчас на экране */
  var navLinks = $$('.nav__link');
  var sections = navLinks
    .map(function (l) {
      /* Только внутренние якоря (#id). Реальные пути вроде «/payments/» —
         невалидные CSS-селекторы и роняют querySelector, поэтому их пропускаем. */
      var h = l.getAttribute('href') || '';
      return (h.charAt(0) === '#' && h.length > 1) ? $(h) : null;
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (s) { navObserver.observe(s); });
  }

  /* ==================== 3. Появление блоков при скролле =================== */
  /* Скролл-ориентированный reveal БЕЗ зависимости от IntersectionObserver:
     то, что на экране — показываем сразу, остальное — по мере прокрутки.
     Так контент никогда не «застревает» невидимым (фоновая вкладка, вебвью
     без отрисовки, отсутствие событий IO и т.п.). */
  var revealables = $$('.reveal');

  if (reduceMotion) {
    revealables.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var inView = function (el) {
      var r = el.getBoundingClientRect();
      return r.top < (window.innerHeight - 60) && r.bottom > 0;
    };
    var revealInView = function () {
      revealables = revealables.filter(function (el) {
        if (inView(el)) { el.classList.add('is-visible'); return false; }
        return true;
      });
    };
    revealInView();                                   // сразу показать видимое
    window.addEventListener('scroll', revealInView, { passive: true });
    window.addEventListener('resize', revealInView, { passive: true });
    /* Подстраховка на случай, если layout ещё не готов в момент старта. */
    setTimeout(revealInView, 300);
    setTimeout(revealInView, 1000);
  }

  /* =========================== 4. Счётчики =============================== */
  function animateCounter(el) {
    var target = parseInt(el.dataset.count, 10) || 0;
    if (reduceMotion) { el.textContent = String(target); return; }

    var duration = 1400;
    var start = null;

    function step(ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      /* easeOutCubic — быстрый старт, мягкое торможение */
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counters = $$('[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    var counterObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { counterObserver.observe(c); });
  } else {
    counters.forEach(animateCounter);
  }

  /* ======================= 5. Карта мира и маршруты ======================= */

  /* Схематичная маска материков: 60 колонок × 23 строки.
     Колонка c → долгота −177 + 6·c, строка r → широта 78 − 6·r.
     «#» — суша (ставим точку), «.» — вода. */
  var LAND_MASK = [
    '............#######....#####......#####.....#######.........',
    '........############...####....############################.',
    '...##################..####...##############################',
    '..####################..##....##############################',
    '...##################........###############################',
    '........#############........###############################',
    '.........###########........##########################......',
    '..........#########.........##########################......',
    '...........#######..........##########################......',
    '............#####..........##############.###########.......',
    '..............####.........############...#########.........',
    '................####......#############....#######..........',
    '.................######...#############.......####..........',
    '.................#######...############.......######........',
    '.................########...###########........#########....',
    '..................########..##########..........#####.###...',
    '..................########..#########.##..........#######...',
    '...................#######...#######..##.........########...',
    '...................######.....#####..............########...',
    '....................####.......###.................#####..##',
    '....................###...................................##',
    '....................##......................................',
    '....................##......................................'
  ];

  var MASK_COLS = 60;
  var MASK_ROWS = LAND_MASK.length;
  var MAP_W = 600;                       /* ширина системы координат SVG */
  var MAP_H = MAP_W * MASK_ROWS / MASK_COLS;

  /* Пересчёт географических координат в координаты SVG */
  function project(lon, lat) {
    return {
      x: (lon + 180) / 360 * MAP_W,
      y: (81 - lat) / 138 * MAP_H
    };
  }

  /* Опорные точки маршрутной сети: Москва — хаб, остальные — направления */
  var HUB = { name: 'Москва', lon: 37.6, lat: 55.8 };
  var NODES = [
    { name: 'Санкт-Петербург', lon: 30.3, lat: 59.9 },
    { name: 'Гамбург',         lon: 10.0, lat: 53.6 },
    { name: 'Стамбул',         lon: 29.0, lat: 41.0 },
    { name: 'Дубай',           lon: 55.3, lat: 25.3 },
    { name: 'Алматы',          lon: 76.9, lat: 43.2 },
    { name: 'Мумбаи',          lon: 72.9, lat: 19.1 },
    { name: 'Шанхай',          lon: 121.5, lat: 31.2 },
    { name: 'Владивосток',     lon: 131.9, lat: 43.1 },
    { name: 'Сингапур',        lon: 103.8, lat: 1.4 },
    { name: 'Нью-Йорк',        lon: -74.0, lat: 40.7 }
  ];

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  /* Дуга между двумя точками: контрольная точка смещена по нормали к хорде,
     поэтому маршруты выглядят как авиалинии на инфографике */
  function arcPath(a, b) {
    var mx = (a.x + b.x) / 2;
    var my = (a.y + b.y) / 2;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var bend = Math.min(len * 0.22, 60);
    /* нормаль к отрезку, направленная «вверх» по экрану */
    var cx = mx + (dy / len) * bend * (dx >= 0 ? -1 : 1);
    var cy = my - (dx / len) * bend * (dx >= 0 ? -1 : 1);
    return { d: 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
                ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) +
                ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) };
  }

  function buildMap(container) {
    var withRoutes = container.dataset.routes === 'true';

    /* Всегда вписываем карту целиком: при «slice» в высоком hero
       масштаб вырастал в несколько раз и точки превращались в круги */
    var svg = el('svg', {
      viewBox: '0 0 ' + MAP_W + ' ' + MAP_H.toFixed(1),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'presentation',
      focusable: 'false'
    });

    /* --- Слой точек суши --- */
    var dots = el('g', { class: 'map-dots' });
    var stepX = MAP_W / MASK_COLS;
    var stepY = MAP_H / MASK_ROWS;

    for (var r = 0; r < MASK_ROWS; r++) {
      var row = LAND_MASK[r];
      for (var c = 0; c < MASK_COLS; c++) {
        if (row.charAt(c) !== '#') continue;
        dots.appendChild(el('circle', {
          class: 'map-dot',
          cx: ((c + 0.5) * stepX).toFixed(1),
          cy: ((r + 0.5) * stepY).toFixed(1),
          r: 1.15
        }));
      }
    }
    svg.appendChild(dots);

    if (!withRoutes) {
      container.appendChild(svg);
      return;
    }

    /* --- Слой маршрутов --- */
    var hub = project(HUB.lon, HUB.lat);
    var routes = el('g', { class: 'map-routes' });
    var paths = [];

    NODES.forEach(function (node) {
      var point = project(node.lon, node.lat);
      var path = el('path', { class: 'map-route', d: arcPath(hub, point).d });
      routes.appendChild(path);
      paths.push(path);
    });
    svg.appendChild(routes);

    /* --- Слой узлов: пульсирующие точки городов --- */
    var nodesLayer = el('g', { class: 'map-nodes' });

    NODES.forEach(function (node) {
      var p = project(node.lon, node.lat);
      nodesLayer.appendChild(el('circle', { class: 'map-node', cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3 }));
      var title = el('title', {});
      title.textContent = node.name;
      nodesLayer.lastChild.appendChild(title);
    });

    /* Москва — крупнее и с пульсацией */
    var pulse = el('circle', { class: 'map-pulse', cx: hub.x.toFixed(1), cy: hub.y.toFixed(1), r: 3 });
    if (!reduceMotion) pulse.style.animation = 'map-pulse 2.6s ease-out infinite';
    nodesLayer.appendChild(pulse);

    var hubDot = el('circle', { class: 'map-node map-node--hub', cx: hub.x.toFixed(1), cy: hub.y.toFixed(1), r: 5 });
    var hubTitle = el('title', {});
    hubTitle.textContent = HUB.name;
    hubDot.appendChild(hubTitle);
    nodesLayer.appendChild(hubDot);

    svg.appendChild(nodesLayer);
    container.appendChild(svg);

    /* Прорисовка линий, когда карта попала в зону видимости */
    if (reduceMotion) return;

    paths.forEach(function (path) {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
    });

    function drawRoutes() {
      paths.forEach(function (path, i) {
        path.style.transition = 'stroke-dashoffset 1.8s ' + (i * 0.12).toFixed(2) + 's ease-out';
        path.style.strokeDashoffset = '0';
      });
    }

    if ('IntersectionObserver' in window) {
      var mapObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          drawRoutes();
          obs.disconnect();
        });
      }, { threshold: 0.25 });
      mapObserver.observe(container);
    } else {
      drawRoutes();
    }
  }

  $$('[data-worldmap]').forEach(buildMap);

  /* ========================= 6. Форма заявки ============================= */
  var form = $('#lead-form');
  var phoneInput = $('#phone');
  var toast = $('#toast');

  /* --- Красивая маска для номеров России/Казахстана (+7) --- */
  function prettyRu(digits) {
    var rest = digits.slice(1);
    var out = '+7';
    if (rest.length) out += ' (' + rest.slice(0, 3);
    if (rest.length >= 3) out += ') ' + rest.slice(3, 6);
    if (rest.length >= 6) out += '-' + rest.slice(6, 8);
    if (rest.length >= 8) out += '-' + rest.slice(8, 10);
    return out;
  }

  /* --- Маска телефона: международные + локальные российские номера ---
     Правило: ввод с «+» — международный E.164 (любая страна, до 15 цифр),
     ввод без «+» трактуем как локальный российский (8…/9… → +7 …). */
  function formatPhone(value) {
    var startsPlus = /^\s*\+/.test(value);
    var digits = value.replace(/\D/g, '');

    if (startsPlus) {
      if (!digits) return '+';
      /* Россия/Казахстан (+7, до 11 цифр) — красивая группировка */
      if (digits.charAt(0) === '7' && digits.length <= 11) return prettyRu(digits.slice(0, 11));
      /* Прочие страны — E.164 без группировки (макс. 15 цифр) */
      return '+' + digits.slice(0, 15);
    }

    /* Без «+» — локальный российский ввод */
    if (!digits) return '';
    if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    if (digits.charAt(0) !== '7') digits = '7' + digits;
    return prettyRu(digits.slice(0, 11));
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      var digitsOnly = phoneInput.value.replace(/\D/g, '');
      var hasPlus = /^\s*\+/.test(phoneInput.value);
      phoneInput.value = (digitsOnly.length || hasPlus) ? formatPhone(phoneInput.value) : '';
    });
    phoneInput.addEventListener('blur', function () {
      if (phoneInput.value.replace(/\D/g, '').length < 1) phoneInput.value = '';
    });
  }

  /* --- Правила валидации полей --- */
  var RULES = {
    name: function (v) {
      if (!v.trim()) return 'Укажите, как к вам обращаться';
      if (v.trim().length < 2) return 'Имя слишком короткое';
      return '';
    },
    phone: function (v) {
      var digits = v.replace(/\D/g, '');
      if (!digits || digits.length <= 1) return 'Укажите номер телефона для связи';
      if (digits.length < 8) return 'Номер неполный — укажите код страны и номер';
      if (digits.length > 15) return 'Номер слишком длинный';
      return '';
    },
    email: function (v) {
      var t = v.trim();
      if (!t) return 'Укажите эл. почту для связи';
      if (t.length > 254) return 'Адрес слишком длинный';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'Проверьте адрес — напр. you@example.com';
      return '';
    },
    message: function (v) {
      var t = v.trim();
      if (!t) return 'Укажите направление и сумму платежа';
      if (t.length > 1500) return 'Слишком длинное сообщение — не более 1500 символов';
      return '';
    },
    consent: function (_, field) {
      return field.checked ? '' : 'Без согласия мы не сможем обработать заявку';
    }
  };

  function setFieldError(field, message) {
    var errorBox = document.getElementById(field.id + '-error');
    var isInvalid = Boolean(message);

    field.classList.toggle('is-invalid', isInvalid);
    field.setAttribute('aria-invalid', String(isInvalid));

    if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = !isInvalid;
    }
    return !isInvalid;
  }

  function validateField(field) {
    var rule = RULES[field.name];
    if (!rule) return true;
    return setFieldError(field, rule(field.value, field));
  }

  var toastTimer;
  function showToast(text) {
    toast.querySelector('.toast__text').textContent = text;
    toast.hidden = false;
    /* Даём браузеру кадр на снятие hidden, чтобы сработал переход */
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.hidden = true; }, 500);
    }, 5000);
  }

  if (form) {
    var fields = $$('input, textarea', form).filter(function (f) { return RULES[f.name]; });

    /* Проверяем поле при потере фокуса, ошибку снимаем сразу при исправлении */
    fields.forEach(function (field) {
      field.addEventListener('blur', function () { validateField(field); });
      field.addEventListener('input', function () {
        if (field.classList.contains('is-invalid')) validateField(field);
      });
      field.addEventListener('change', function () {
        if (field.type === 'checkbox') validateField(field);
      });
    });

    /* Приём заявок ведёт рабочая панель app.lokomotivneva.ru (вкладка «Заявки с сайта»).
       Публичный эндпоинт без авторизации, IP-rate-limit + honeypot на стороне сервера. */
    var LEAD_ENDPOINT = 'https://app.lokomotivneva.ru/api/site-leads/public';
    var submitBtn = form.querySelector('button[type="submit"]');
    var sending = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      var firstInvalid = null;
      fields.forEach(function (field) {
        if (!validateField(field) && !firstInvalid) firstInvalid = field;
      });

      if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        return;
      }

      var name = $('#name').value.trim();
      var honeypot = form.querySelector('[name="company"]');
      var payload = {
        name: name,
        phone: $('#phone').value.trim(),
        email: ($('#email') ? $('#email').value.trim() : ''),
        message: ($('#message') ? $('#message').value.trim() : ''),
        page: window.location.pathname,
        source: 'lokomotivneva.ru',
        company: honeypot ? honeypot.value : ''
      };

      sending = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.label = submitBtn.textContent; submitBtn.textContent = 'Отправляем…'; }

      function done(ok) {
        sending = false;
        if (submitBtn) { submitBtn.disabled = false; if (submitBtn.dataset.label) submitBtn.textContent = submitBtn.dataset.label; }
        if (ok) {
          showToast(name + ', заявка принята! Свяжемся с вами по указанному телефону.');
          form.reset();
          fields.forEach(function (field) { setFieldError(field, ''); });
        } else {
          /* Фолбэк: заявку не удалось отправить — не теряем клиента, зовём позвонить/написать. */
          showToast('Не удалось отправить заявку. Позвоните нам: +7 (495) 240-90-65 или напишите на lokomotiv.neva@mail.ru');
        }
      }

      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { done(r.ok); })
        .catch(function () { done(false); });
    });
  }

  /* Год в подвале — чтобы копирайт не устаревал */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
