/* =============================================================================
   site.js — подстановка данных из site-config.js в вёрстку
   -----------------------------------------------------------------------------
   Отвечает за: ссылки мессенджеров, вариант заголовка первого экрана,
   цифры доверия, отзывы, имя оффера, промо-полосу над шапкой.
   Никакой бизнес-логики и никаких расчётов курса здесь нет.
   Подключается ПОСЛЕ site-config.js, до/после main.js — неважно.
   ============================================================================= */
(function () {
  'use strict';

  var CFG = window.LOKO;
  if (!CFG) return;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  /* ======================= 1. Ссылки на мессенджеры =========================
     В HTML лежит БЕЗОПАСНЫЙ фолбэк — ссылка «Позвонить». Если в конфиге задан
     telegram/whatsapp, ссылка повышается до мессенджера. Битой она не бывает
     ни при каком состоянии конфига — в этом весь смысл.

     Явный вид ('telegram' / 'whatsapp') резолвится СТРОГО: если этот мессенджер
     в конфиге пуст, ссылка не подменяется на другой — иначе строка «WhatsApp»
     увела бы в Telegram. Подмена по приоритету осталась только у 'auto'. */
  function messengerLink(kind, textOverride) {
    var c = CFG.contacts || {};
    var tg = (c.telegram || '').replace(/^@/, '').trim();
    var wa = (c.whatsapp || '').replace(/\D/g, '');

    if (kind === 'telegram') {
      return tg ? { href: 'https://t.me/' + tg, label: 'Написать в Telegram', icon: 'i-telegram' } : null;
    }
    if (kind === 'whatsapp') {
      var text = textOverride || c.whatsappText;
      var waText = text ? '?text=' + encodeURIComponent(text) : '';
      return wa ? { href: 'https://wa.me/' + wa + waText, label: 'Написать в WhatsApp', icon: 'i-whatsapp' } : null;
    }
    /* 'auto' и всё неизвестное — по приоритету: сначала Telegram, потом WhatsApp. */
    return messengerLink('telegram') || messengerLink('whatsapp');
  }

  /* root — чтобы повысить ссылки и в форме, которой ещё нет в документе
     (окно заявки собирает её само, см. addFormMessengers ниже). */
  function applyMessengers(root) {
    /* Каждая строка контактов прячется по СВОЕМУ мессенджеру: у строки
       data-messenger-row="whatsapp" смотрим только whatsapp. Пустое значение
       атрибута = 'auto' (строка «Мессенджер» из старой вёрстки). */
    $$('[data-messenger-row]', root).forEach(function (el) {
      var kind = el.getAttribute('data-messenger-row') || 'auto';
      el.hidden = !messengerLink(kind);
    });

    $$('a[data-messenger]', root).forEach(function (el) {
      var res = messengerLink(el.getAttribute('data-messenger'), el.getAttribute('data-wa-text'));
      if (!res) return;                       /* оставляем фолбэк из HTML */
      el.setAttribute('href', res.href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'nofollow noopener');
      var label = $('[data-messenger-label]', el);
      if (label) label.textContent = el.getAttribute('data-messenger-text') || res.label;
      var use = $('svg use', el);
      if (use) use.setAttribute('href', '/assets/sprite.svg#' + res.icon);
    });
  }

  /* ============ 1а. «Удобнее написать?» под формой на /payments/* ============
     Ставится в конец #lead-form (под кнопку и строку о согласии), поэтому едет
     вместе с формой в окно заявки. Ссылки — те же data-messenger, что в
     контактах; WhatsApp — с текстом по странице (formMessengers.waText).
     Повторный вызов на той же форме ничего не добавляет. */
  function addFormMessengers(form) {
    var fm = CFG.formMessengers || {};
    var path = location.pathname.replace(/\/+$/, '/');
    if (!form || fm.show === false || path.indexOf('/payments/') !== 0) return;
    if (form.querySelector('.form-msgr')) return;
    if (!messengerLink('telegram') && !messengerLink('whatsapp')) return;

    var waText = (fm.waText || {})[path] || '';
    var row = function (kind, name) {
      return '<a class="form-msgr__btn" data-messenger="' + kind + '"' +
        (kind === 'whatsapp' && waText ? ' data-wa-text="' + esc(waText) + '"' : '') +
        ' data-messenger-text="' + name + '" aria-label="Написать в ' + name + '" href="tel:' + esc((CFG.contacts || {}).phone || '+74951080100') + '" rel="nofollow">' +
        '<span class="contacts__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/sprite.svg#i-' + kind + '"></use></svg></span>' +
        '<span data-messenger-label>' + name + '</span></a>';
    };
    var box = document.createElement('div');
    box.className = 'form-msgr';
    box.innerHTML =
      '<p class="form-msgr__title">' + esc(fm.title || 'Удобнее написать?') + '</p>' +
      '<div class="form-msgr__list">' +
        (messengerLink('telegram') ? row('telegram', 'Telegram') : '') +
        (messengerLink('whatsapp') ? row('whatsapp', 'WhatsApp') : '') +
      '</div>';
    form.appendChild(box);
    applyMessengers(box);

    /* Круглая кнопка помощника в правом нижнем углу ложится на поля формы и на
       эти кнопки (особенно на телефоне) — пока форма на экране, она убрана. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        document.documentElement.classList.toggle('lead-form-in-view', entries[0].isIntersecting);
      }).observe(form);
    }
  }
  /* Окно заявки (lead-modal.js) на страницах без своей формы собирает её само
     и вызывает это после сборки. */
  CFG.addFormMessengers = addFormMessengers;

  /* ================== 2. Вариант заголовка первого экрана ===================
     'control' ничего не трогает — в HTML лежит текущий заголовок. */
  function applyHeroVariant() {
    var hero = CFG.hero || {};
    var el = $('[data-hero-title]');
    if (!el || !hero.variant || hero.variant === 'control') return;
    var text = (hero.variants || {})[hero.variant];
    if (text) el.innerHTML = text;
  }

  /* ========================= 3. Цифры доверия ==============================
     Один источник (CFG.proof) на все места, где цифры показываются. */
  function applyProof() {
    var p = CFG.proof || {};
    if (!p.show) {
      $$('[data-loko-proof]').forEach(function (el) { el.hidden = true; });
      return;
    }
    var map = {
      payments: p.payments,
      volume: p.volumeMln,
      blocked: p.blocked,
      avg: p.avgHours,
      period: p.period
    };
    $$('[data-loko-stat]').forEach(function (el) {
      var key = el.getAttribute('data-loko-stat');
      if (map[key] != null) el.textContent = String(map[key]);
    });
    $$('[data-loko-proof]').forEach(function (el) { el.hidden = false; });
  }

  /* ============================ 5. Отзывы =================================== */
  function applyReviews() {
    var host = $('[data-loko-reviews]');
    if (!host) return;
    var r = CFG.reviews || {};
    var items = r.items || [];
    var wrap = $('[data-loko-reviews-section]');
    /* Пока настоящих отзывов нет (show:false) — блок не выводим вовсе. */
    if (!r.show || !items.length) {
      if (wrap) wrap.hidden = true;
      host.hidden = true;
      return;
    }
    if (wrap) wrap.hidden = false;
    host.hidden = false;
    host.innerHTML = items.map(function (it) {
      return '' +
        '<li class="review">' +
          '<p class="review__text">«' + esc(it.text) + '»</p>' +
          '<p class="review__author">' + esc(it.author) + '</p>' +
        '</li>';
    }).join('');
  }

  /* ========================= 6. Имя оффера ================================== */
  function applyOfferName() {
    var name = (CFG.offer || {}).name;
    if (!name) return;
    $$('[data-loko-offer]').forEach(function (el) { el.textContent = name; });
  }

  /* ====================== 7. Промо-полоса над шапкой ======================== */
  /* Разметка полосы лежит в index.html и видна без JS. Здесь только три
     причины её убрать: выключена в конфиге, срок вышел, посетитель закрыл.
     Тексты подставляются из конфига, чтобы правка акции не требовала HTML. */
  function applyPromo() {
    var bar = $('#promo');
    if (!bar) return;                       // страница без полосы — ничего не делаем
    var p = CFG.promo || {};

    /* Дата сравнивается по местному времени и включает последний день целиком:
       акция «до 30 ноября» действует весь день 30-го. Кривую дату в конфиге
       (until разобрался в NaN) считаем «без срока», а не «истекла». */
    var expired = false;
    if (p.until) {
      var end = new Date(p.until + 'T23:59:59');
      expired = !isNaN(end) && end < new Date();
    }

    /* localStorage может быть недоступен (приватный режим, запрет хранилища) —
       тогда полоса просто не запоминает закрытие, но не ломается. */
    var key = 'loko:promo:' + (p.id || 'default');
    var closed = false;
    try { closed = localStorage.getItem(key) === '1'; } catch (e) {}

    if (p.show === false || expired || closed) { bar.hidden = true; return; }

    $$('[data-loko-promo]', bar).forEach(function (el) {
      var val = p[el.getAttribute('data-loko-promo')];
      if (val) el.textContent = val;
    });
    bar.hidden = false;

    var close = $('#promo-close', bar);
    if (close) {
      close.addEventListener('click', function () {
        bar.hidden = true;
        try { localStorage.setItem(key, '1'); } catch (e) {}
      });
    }
  }

  applyMessengers();
  addFormMessengers(document.getElementById('lead-form'));
  applyHeroVariant();
  applyProof();
  applyReviews();
  applyOfferName();
  applyPromo();
})();
