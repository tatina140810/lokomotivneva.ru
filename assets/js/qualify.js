/* =============================================================================
   qualify.js — квалификационная форма (2 шага) + форма чек-листа
   -----------------------------------------------------------------------------
   ВАЖНО: здесь НЕТ и не должно быть расчёта курса валют и итоговой суммы.
   Показываем только статичные ориентиры из site-config.js (срок и вилка
   комиссии по направлению) + обязательную оговорку. Курса у компании нет —
   он определяется на момент фактического исполнения платежа.

   Заявки уходят на тот же эндпоинт, что и основная форма сайта:
   POST https://app.lokomotivneva.ru/api/site-leads/public
   (вкладка «Заявки с сайта» в рабочей панели).

   КОНТРАКТ БЭКЕНДА (проверен 19.08.2026): обязательны и непусты ВСЕ четыре поля —
   name, phone, email (с проверкой формата), message. Пустой email даёт
   400 {"error":"email_required"} и заявка не доходит до панели. Именно поэтому
   в обеих формах есть поле почты, и оно обязательное. При добавлении новой формы
   на сайте — слать все четыре поля.
   ============================================================================= */
(function () {
  'use strict';

  var CFG = window.LOKO;
  if (!CFG) return;

  var LEAD_ENDPOINT = 'https://app.lokomotivneva.ru/api/site-leads/public';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function toast(text) {
    var el = $('#toast');
    if (!el) { alert(text); return; }
    var t = el.querySelector('.toast__text');
    if (t) t.textContent = text;
    el.hidden = false;
    /* Кадр на снятие hidden, чтобы сработал CSS-переход (как в main.js) */
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 400);
    }, 6000);
  }

  /* Отправка заявки. Резолвится в { ok: Boolean, error: String }.
     error — код от бэкенда (email_required, phone_required, rate_limited и т.п.),
     нужен, чтобы человек увидел, что именно поправить, а не глухое «не удалось». */
  function sendLead(payload) {
    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.ok) return { ok: true, error: '' };
      return r.json()
        .then(function (d) { return { ok: false, error: (d && d.error) || '' }; })
        .catch(function () { return { ok: false, error: '' }; });
    }).catch(function () { return { ok: false, error: '' }; });
  }

  /* Понятный текст на коды бэкенда. Неизвестный код → общий фолбэк с телефоном. */
  var ERRORS = {
    name_required: 'Укажите, как к вам обращаться.',
    phone_required: 'Укажите телефон — без него заявка не принимается.',
    phone_invalid: 'Проверьте номер телефона.',
    email_required: 'Укажите эл. почту — без неё заявка не принимается.',
    email_invalid: 'Проверьте адрес почты — напр. you@example.com.',
    message_required: 'Заполните шаг 1 — без данных по сделке заявка не принимается.',
    rate_limited: 'Слишком много заявок с этого адреса. Попробуйте позже или позвоните нам.'
  };

  function errorMessage(code) {
    return ERRORS[code] || fallbackMessage();
  }

  /* Формат почты — тот же, что в основной форме сайта (main.js). */
  function emailOk(v) {
    var t = String(v || '').trim();
    return t.length > 0 && t.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  }

  function fallbackMessage() {
    var c = CFG.contacts || {};
    return 'Не удалось отправить заявку. Позвоните нам: ' + (c.phoneHuman || '') +
           ' или напишите на ' + (c.email || '');
  }

  /* Телефон считаем валидным, если в нём 8–15 цифр (как в основной форме). */
  function phoneOk(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15;
  }

  function groupDigits(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 15);
    return d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function fmtFee(from, to) {
    var f = function (n) { return String(n).replace('.', ','); };
    return f(from) + '–' + f(to) + ' %';
  }

  /* ======================= КВАЛИФИКАЦИОННАЯ ФОРМА ========================= */
  function initQualify() {
    var root = $('#qualify-widget');
    if (!root) return;

    var q = CFG.qualify || {};
    var routes = q.routes || [];
    var routeSel = $('#q-route', root);
    var catSel = $('#q-category', root);
    var amount = $('#q-amount', root);
    var currency = $('#q-currency', root);
    var showBtn = $('[data-qualify-show]', root);
    var result = $('[data-qualify-result]', root);
    var placeholder = $('[data-qualify-placeholder]', root);
    var step2 = $('[data-qualify-step2]', root);
    var errBox = $('[data-qualify-error]', root);
    /* Отдельный блок ошибок внутри шага 2: он в правой колонке, и ошибка,
       выведенная под кнопкой шага 1, оказывается вне поля зрения. */
    var errBox2 = $('[data-qualify-error2]', root);

    /* Заполняем списки из конфига */
    routeSel.innerHTML = '<option value="" disabled selected>Выберите направление</option>' +
      routes.map(function (r) { return '<option value="' + r.id + '">' + r.label + '</option>'; }).join('');
    catSel.innerHTML = '<option value="">Не указывать</option>' +
      (q.categories || []).map(function (c) { return '<option>' + c + '</option>'; }).join('');
    if (currency) {
      currency.innerHTML = (q.currencies || ['₽', '$', '¥', '€', '₺', 'AED'])
        .map(function (c) { return '<option>' + c + '</option>'; }).join('');
    }

    amount.addEventListener('input', function () {
      var pos = amount.value.length - amount.selectionStart;
      amount.value = groupDigits(amount.value);
      amount.selectionStart = amount.selectionEnd = Math.max(0, amount.value.length - pos);
    });

    /* step: 1 — ошибка под шагом 1, 2 — ошибка внутри формы шага 2. */
    function showError(msg, step) {
      var box = (step === 2 && errBox2) ? errBox2 : errBox;
      var other = (box === errBox2) ? errBox : errBox2;
      if (other) { other.textContent = ''; other.hidden = true; }
      if (!box) return;
      box.textContent = msg || '';
      box.hidden = !msg;
    }
    function showError2(msg) { showError(msg, 2); }

    showBtn.addEventListener('click', function () {
      var route = routes.filter(function (r) { return r.id === routeSel.value; })[0];
      if (!route) { showError('Выберите направление платежа.'); routeSel.focus(); return; }
      if (!amount.value.replace(/\D/g, '')) { showError('Укажите примерную сумму сделки.'); amount.focus(); return; }
      showError('');

      $('[data-qualify-term]', root).textContent = route.term;
      $('[data-qualify-fee]', root).textContent = fmtFee(route.feeFrom, route.feeTo);
      $('[data-qualify-disclaimer]', root).textContent = q.disclaimer || '';

      if (placeholder) placeholder.hidden = true;
      result.hidden = false;
      step2.hidden = false;
      root.classList.add('is-answered');
      var nameField = $('#q-name', root);
      if (nameField) nameField.focus({ preventScroll: true });
    });

    /* --- Шаг 2: контакты --- */
    var form = $('#qualify-form', root);
    var sending = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      var name = $('#q-name', root).value.trim();
      var phone = $('#q-phone', root).value.trim();
      var email = $('#q-email', root) ? $('#q-email', root).value.trim() : '';
      var tg = $('#q-tg', root).value.trim();
      var consent = $('#q-consent', root);

      if (name.length < 2) { showError2('Как к вам обращаться?'); $('#q-name', root).focus(); return; }
      if (!phoneOk(phone)) { showError2('Укажите телефон — по нему менеджер вернётся с точным расчётом.'); $('#q-phone', root).focus(); return; }
      /* Почта обязательна: без неё бэкенд отклоняет заявку (см. контракт в шапке файла). */
      if (!emailOk(email)) { showError2('Укажите эл. почту — напр. you@example.com.'); $('#q-email', root).focus(); return; }
      if (consent && !consent.checked) { showError2('Нужно согласие на обработку персональных данных.'); consent.focus(); return; }
      showError('');

      var route = routes.filter(function (r) { return r.id === routeSel.value; })[0] || {};
      var msg = 'Квалификация: ' + (route.label || '—') +
                ', сумма ≈ ' + amount.value + ' ' + (currency ? currency.value : '') +
                (catSel.value ? ', категория: ' + catSel.value : '') +
                '. Показанный ориентир: срок ' + (route.term || '—') +
                ', комиссия ' + fmtFee(route.feeFrom, route.feeTo) +
                (tg ? '. Мессенджер: ' + tg : '');

      var honeypot = form.querySelector('[name="company"]');
      var btn = form.querySelector('button[type="submit"]');
      sending = true;
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Отправляем…'; }

      sendLead({
        name: name, phone: phone, email: email, message: msg,
        page: window.location.pathname, source: 'lokomotivneva.ru/qualify',
        company: honeypot ? honeypot.value : ''
      }).then(function (res) {
        sending = false;
        if (btn) { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
        if (res.ok) {
          showError2('');
          toast(name + ', заявка принята! Вернёмся с точным расчётом по вашей сделке.');
          form.reset();
        } else {
          showError2(errorMessage(res.error));
          toast(errorMessage(res.error));
        }
      });
    });
  }

  /* ===================== ФОРМА ЧЕК-ЛИСТА (lead magnet) ==================== */
  function initLeadMagnet() {
    var form = $('#magnet-form');
    if (!form) return;
    var sending = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      var name = $('#m-name').value.trim();
      var phone = $('#m-phone').value.trim();
      var email = $('#m-email').value.trim();
      var consent = $('#m-consent');
      var err = $('[data-magnet-error]');
      var setErr = function (msg) { if (err) { err.textContent = msg || ''; err.hidden = !msg; } };

      if (name.length < 2) { setErr('Как к вам обращаться?'); $('#m-name').focus(); return; }
      if (!phoneOk(phone)) { setErr('Укажите телефон — на него менеджер пришлёт чек-лист.'); $('#m-phone').focus(); return; }
      /* Почта обязательна: без неё бэкенд отклоняет заявку (см. контракт в шапке файла). */
      if (!emailOk(email)) { setErr('Укажите эл. почту — на неё пришлём чек-лист.'); $('#m-email').focus(); return; }
      if (consent && !consent.checked) { setErr('Нужно согласие на обработку персональных данных.'); consent.focus(); return; }
      setErr('');

      var honeypot = form.querySelector('[name="company"]');
      var btn = form.querySelector('button[type="submit"]');
      sending = true;
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Отправляем…'; }

      sendLead({
        name: name, phone: phone, email: email,
        message: 'Запрос лид-магнита: ' + ((CFG.leadMagnet || {}).title || 'чек-лист'),
        page: window.location.pathname, source: 'lokomotivneva.ru/checklist',
        company: honeypot ? honeypot.value : ''
      }).then(function (res) {
        sending = false;
        if (btn) { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
        if (!res.ok) { setErr(errorMessage(res.error)); toast(errorMessage(res.error)); return; }
        form.reset();
        var file = (CFG.leadMagnet || {}).file;
        if (file) {
          toast('Готово! Открываем чек-лист.');
          window.open(file, '_blank', 'noopener');
        } else {
          /* TODO(заказчик): пока PDF не выложен — менеджер отправляет чек-лист вручную. */
          toast(name + ', заявка принята! Чек-лист пришлём в ближайший рабочий день.');
        }
      });
    });
  }

  initQualify();
  initLeadMagnet();
})();
