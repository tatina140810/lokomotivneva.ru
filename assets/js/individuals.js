/* =============================================================================
   individuals.js — раздел «Для физлиц» (/individuals/)
   -----------------------------------------------------------------------------
   Самодостаточный файл: подключён ТОЛЬКО на этой странице и ничего не меняет
   в остальном сайте. Здесь и переключатель направлений, и отправка заявки —
   намеренно не через #lead-form из main.js, чтобы не трогать B2B-формы.

   КОНТРАКТ БЭКЕНДА (проверен 19.08.2026): POST на LEAD_ENDPOINT требует
   непустыми ВСЕ четыре поля — name, phone, email (с проверкой формата) и
   message. Поэтому почта в форме обязательна, а комментарий может быть пустым:
   message всё равно непуст, в него уходит выбранное направление.
   ============================================================================= */
(function () {
  'use strict';

  var LEAD_ENDPOINT = 'https://app.lokomotivneva.ru/api/site-leads/public';
  var PHONE = '+7 (495) 240-90-65';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); };

  /* ============================ 1. Направления ============================ */
  var tabsRoot = $('[data-tabs]');
  if (tabsRoot) {
    var buttons = $$('[role="tab"]', tabsRoot);
    var panels = $$('[role="tabpanel"]', tabsRoot);
    var directionSelect = $('#ind-direction');

    var activate = function (id, focusTab) {
      buttons.forEach(function (btn) {
        var on = btn.getAttribute('aria-controls') === id;
        btn.setAttribute('aria-selected', String(on));
        btn.tabIndex = on ? 0 : -1;          /* по табам ходим стрелками, Tab уводит дальше */
        if (on && focusTab) btn.focus();
      });
      panels.forEach(function (panel) { panel.hidden = panel.id !== id; });

      /* Подставляем направление в форму, чтобы не выбирать его второй раз. */
      var btn = buttons.filter(function (b) { return b.getAttribute('aria-controls') === id; })[0];
      var value = btn && btn.getAttribute('data-direction');
      if (directionSelect && value) {
        var exists = $$('option', directionSelect).some(function (o) { return o.value === value; });
        if (exists) directionSelect.value = value;
      }
    };

    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () { activate(btn.getAttribute('aria-controls'), false); });
      btn.addEventListener('keydown', function (e) {
        var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        activate(buttons[(i + step + buttons.length) % buttons.length].getAttribute('aria-controls'), true);
      });
    });

    $$('[data-direction-cta]').forEach(function (link) {
      link.addEventListener('click', function () {
        var value = link.getAttribute('data-direction-cta');
        if (directionSelect && value) directionSelect.value = value;
      });
    });

    var fromHash = window.location.hash.replace('#', '');
    var initial = panels.filter(function (p) { return p.id === fromHash; })[0];
    if (panels.length) activate(initial ? initial.id : panels[0].id, false);
  }

  /* ============================== 2. Заявка =============================== */
  var form = $('#ind-form-el');
  if (!form) return;

  var errBox = $('[data-ind-error]', form);
  var okBox = $('[data-ind-ok]', form);

  function say(box, msg) {
    [errBox, okBox].forEach(function (b) { if (b) { b.textContent = ''; b.hidden = true; } });
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  function phoneOk(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15;
  }
  function emailOk(v) {
    var t = String(v || '').trim();
    return t.length > 0 && t.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  }

  /* Понятный текст на коды бэкенда — вместо глухого «не удалось отправить». */
  var ERRORS = {
    name_required: 'Укажите, как к вам обращаться.',
    phone_required: 'Укажите телефон — без него заявка не принимается.',
    phone_invalid: 'Проверьте номер телефона.',
    email_required: 'Укажите эл. почту — без неё заявка не принимается.',
    email_invalid: 'Проверьте адрес почты — напр. you@example.com.',
    message_required: 'Выберите направление перевода.',
    rate_limited: 'Слишком много заявок с этого адреса. Попробуйте позже или позвоните нам: ' + PHONE + '.'
  };
  function errorMessage(code) {
    return ERRORS[code] || ('Не удалось отправить заявку. Позвоните нам: ' + PHONE + '.');
  }

  var sending = false;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    var name = $('#ind-name').value.trim();
    var phone = $('#ind-phone').value.trim();
    var email = $('#ind-email').value.trim();
    var messenger = $('#ind-messenger').value.trim();
    var directionEl = $('#ind-direction');
    var direction = directionEl.options[directionEl.selectedIndex];
    var comment = $('#ind-comment').value.trim();
    var consent = $('#ind-consent');

    if (name.length < 2) { say(errBox, 'Как к вам обращаться?'); $('#ind-name').focus(); return; }
    if (!phoneOk(phone)) { say(errBox, 'Укажите телефон — по нему менеджер свяжется с вами.'); $('#ind-phone').focus(); return; }
    if (!emailOk(email)) { say(errBox, 'Укажите эл. почту — напр. you@example.com.'); $('#ind-email').focus(); return; }
    if (!consent.checked) { say(errBox, 'Нужно согласие на обработку персональных данных.'); consent.focus(); return; }
    say(null, '');

    var parts = ['Направление: ' + (direction ? direction.text : '—')];
    if (messenger) parts.push('Telegram/WhatsApp: ' + messenger);
    if (comment) parts.push(comment);

    var honeypot = form.querySelector('[name="company"]');
    var btn = form.querySelector('button[type="submit"]');
    sending = true;
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Отправляем…'; }

    fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name, phone: phone, email: email,
        message: parts.join('. '),
        page: window.location.pathname,
        /* Отдельный источник: воронка физлиц не должна смешиваться с B2B. */
        source: 'lokomotivneva.ru/individuals',
        company: honeypot ? honeypot.value : ''
      })
    }).then(function (r) {
      if (r.ok) return { ok: true, error: '' };
      return r.json()
        .then(function (d) { return { ok: false, error: (d && d.error) || '' }; })
        .catch(function () { return { ok: false, error: '' }; });
    }).catch(function () {
      return { ok: false, error: '' };
    }).then(function (res) {
      sending = false;
      if (btn) { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
      if (res.ok) {
        form.reset();
        say(okBox, name + ', заявка принята. Свяжемся с вами в рабочее время.');
      } else {
        say(errBox, errorMessage(res.error));
      }
    });
  });
}());
