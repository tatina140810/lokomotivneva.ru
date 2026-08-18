/* =============================================================================
   site.js — подстановка данных из site-config.js в вёрстку
   -----------------------------------------------------------------------------
   Отвечает за: ссылки мессенджеров, вариант заголовка первого экрана,
   цифры доверия, кейсы, отзывы, имя оффера.
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
     ни при каком состоянии конфига — в этом весь смысл. */
  function resolveMessenger(prefer) {
    var c = CFG.contacts || {};
    var tg = (c.telegram || '').replace(/^@/, '').trim();
    var wa = (c.whatsapp || '').replace(/\D/g, '');

    if (prefer !== 'whatsapp' && tg) {
      return { href: 'https://t.me/' + tg, label: 'Написать в Telegram', icon: 'i-telegram' };
    }
    if (prefer !== 'telegram' && wa) {
      return { href: 'https://wa.me/' + wa, label: 'Написать в WhatsApp', icon: 'i-whatsapp' };
    }
    if (prefer === 'telegram' && wa) {
      return { href: 'https://wa.me/' + wa, label: 'Написать в WhatsApp', icon: 'i-whatsapp' };
    }
    return null;
  }

  function applyMessengers() {
    /* Строки контактов «Telegram / WhatsApp» прячем целиком, пока мессенджер
       не настроен — иначе получается подпись «Telegram», ведущая на телефон. */
    var hasMessenger = !!resolveMessenger('auto');
    $$('[data-messenger-row]').forEach(function (el) { el.hidden = !hasMessenger; });

    $$('a[data-messenger]').forEach(function (el) {
      var res = resolveMessenger(el.getAttribute('data-messenger'));
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

  /* ============================ 4. Кейсы ==================================== */
  function caseCard(item) {
    var quote = item.quote
      ? '<blockquote class="case__quote">«' + esc(item.quote) + '»' +
        (item.author ? '<cite>' + esc(item.author) + '</cite>' : '') + '</blockquote>'
      : '';
    return '' +
      '<li class="case">' +
        '<span class="case__tag">' + esc(item.tag) + '</span>' +
        '<h3 class="case__title">' + esc(item.title) + '</h3>' +
        '<div class="case__facts">' +
          '<span>Сумма сделки: <b>' + esc(item.amount) + '</b></span>' +
          '<span>Срок исполнения: <b>' + esc(item.term) + '</b></span>' +
        '</div>' +
        quote +
      '</li>';
  }

  function applyCases() {
    var host = $('[data-loko-cases]');
    if (!host) return;
    var c = CFG.cases || {};
    var items = c.items || [];
    if (!items.length) { host.hidden = true; return; }
    host.innerHTML = items.map(caseCard).join('');
    /* Честная пометка, пока кейсы демонстрационные */
    var note = $('[data-loko-cases-note]');
    if (note) note.hidden = !c.demo;
  }

  /* ============================ 5. Отзывы =================================== */
  function applyReviews() {
    var host = $('[data-loko-reviews]');
    if (!host) return;
    var r = CFG.reviews || {};
    var items = r.items || [];
    if (!items.length) { host.hidden = true; return; }
    host.innerHTML = items.map(function (it) {
      return '' +
        '<li class="review">' +
          '<p class="review__text">«' + esc(it.text) + '»</p>' +
          '<p class="review__author">' + esc(it.author) + '</p>' +
        '</li>';
    }).join('');
    var note = $('[data-loko-reviews-note]');
    if (note) note.hidden = !r.demo;
  }

  /* ========================= 6. Имя оффера ================================== */
  function applyOfferName() {
    var name = (CFG.offer || {}).name;
    if (!name) return;
    $$('[data-loko-offer]').forEach(function (el) { el.textContent = name; });
  }

  applyMessengers();
  applyHeroVariant();
  applyProof();
  applyCases();
  applyReviews();
  applyOfferName();
})();
