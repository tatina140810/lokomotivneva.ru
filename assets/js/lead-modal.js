/* Окно заявки (Тати 2026-10-07): каждая кнопка «Оставить заявку» / «Рассчитать платёж»
   на всём сайте открывает форму в модальном окне, а не прокручивает страницу к концу.

   Отправку НЕ дублируем: форма в окне — это та же #lead-form, которую обслуживает
   main.js (проверка полей, отметка согласия, канал визита, цели Метрики и VK, POST в
   app.lokomotivneva.ru/api/site-leads/public). Поэтому скрипт подключается ДО main.js:
   - на странице без своей формы он вставляет её (те же id полей), и main.js к ней
     привязывается как к обычной;
   - на странице, где форма уже есть (главная, контакты, направления), окно на время
     показа переносит её к себе и возвращает на место при закрытии.
   main.js после удачной отправки шлёт событие loko:lead-sent — окно закрывается. */
(function () {
  'use strict';
  var d = document;

  /* Короткая форма (Тати 2026-10-30): кто вы и направление — выбором, сумма необязательна.
     main.js кладёт их первыми строками в текст заявки (сервер хранит только текст), цель
     Метрики та же — lead_form. Эту же разметку вставляет в себя форма на главной. */
  var DIRECTIONS = [['china', 'Китай'], ['turkey', 'Турция'], ['uae', 'ОАЭ'], ['europe', 'Европа'], ['uk', 'Великобритания'],
    ['hongkong', 'Гонконг'], ['export', 'Получение платежа из-за рубежа (экспорт)'], ['services', 'Оплата услуг и ПО'],
    ['individuals', 'Обучение, лечение, поездки (физлица)'], ['other', 'Другая страна']];
  var SHORT_FIELDS =
    '<fieldset class="field field--choice"><legend class="field__label">Кто вы <span aria-hidden="true">*</span></legend>' +
      '<div class="choice">' +
        '<label class="choice__item"><input type="radio" id="client-kind" name="client_kind" value="Компания / ИП" aria-describedby="client-kind-error"><span>Компания / ИП</span></label>' +
        '<label class="choice__item"><input type="radio" id="client-kind-person" name="client_kind" value="Частное лицо"><span>Частное лицо</span></label>' +
      '</div><p class="field__error" id="client-kind-error" role="alert" hidden></p></fieldset>' +
    '<div class="field"><label class="field__label" for="direction">Направление <span aria-hidden="true">*</span></label>' +
      '<select class="field__input field__input--select" id="direction" name="direction" aria-describedby="direction-error">' +
        '<option value="">Выберите направление</option>' +
        DIRECTIONS.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join('') +
      '</select><p class="field__error" id="direction-error" role="alert" hidden></p></div>' +
    '<div class="field"><label class="field__label" for="amount">Сумма <span class="field__opt">— необязательно</span></label>' +
      '<input class="field__input" type="text" id="amount" name="amount" maxlength="100" autocomplete="off" placeholder="Напр. 50 000 $ или 2 млн ₽" aria-describedby="amount-error">' +
      '<p class="field__error" id="amount-error" role="alert" hidden></p></div>';

  var FORM_HTML =
    '<form class="form" id="lead-form" novalidate>' +
      '<input type="hidden" name="ref" value="">' +
      '<div aria-hidden="true" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden"><label>Не заполняйте это поле<input type="text" name="lk_trap" tabindex="-1" autocomplete="off" data-lpignore="true" data-form-type="other"></label></div>' +
      '<div class="field"><label class="field__label" for="name">Имя <span aria-hidden="true">*</span></label><input class="field__input" type="text" id="name" name="name" autocomplete="name" placeholder="Как к вам обращаться" required minlength="2" aria-describedby="name-error"><p class="field__error" id="name-error" role="alert" hidden></p></div>' +
      '<div class="field"><label class="field__label" for="phone">Телефон <span aria-hidden="true">*</span></label><input class="field__input" type="tel" id="phone" name="phone" autocomplete="tel" placeholder="+7 (___) ___-__-__ или +код страны" required inputmode="tel" aria-describedby="phone-error"><p class="field__error" id="phone-error" role="alert" hidden></p></div>' +
      SHORT_FIELDS +
      '<label class="checkbox"><input type="checkbox" id="consent" name="consent" required aria-describedby="consent-error"><span>Я согласен с <a href="/privacy/" target="_blank" rel="noopener">политикой обработки персональных данных</a></span></label>' +
      '<p class="field__error" id="consent-error" role="alert" hidden></p>' +
      '<button class="btn btn--gold btn--block btn--lg" type="submit">Отправить заявку</button>' +
      '<p class="form__note">Нажимая кнопку, вы соглашаетесь с <a href="/privacy/" target="_blank" rel="noopener">политикой обработки персональных данных</a>.</p>' +
    '</form>';

  var TOAST_HTML =
    '<span class="toast__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/sprite.svg#i-check"></use></svg></span>' +
    '<span class="toast__text"></span>';

  /* Куда вели кнопки раньше: якорь формы на странице или страница контактов. */
  var FORM_HASHES = ['#zayavka', '#lead', '#lead-form'];
  function isLeadLink(a) {
    if (a.hasAttribute('data-lead-modal')) return true;
    if (a.hasAttribute('data-no-lead-modal') || a.target === '_blank') return false;
    var url;
    try { url = new URL(a.getAttribute('href') || '', location.href); } catch (e) { return false; }
    if (url.origin !== location.origin) return false;
    if (FORM_HASHES.indexOf(url.hash) !== -1) return true;
    /* Кнопка (не пункт меню «Контакты») на страницу контактов — это тоже «оставить заявку». */
    var path = url.pathname.replace(/\/+$/, '/');
    return a.classList.contains('btn') && path === '/contacts/' && (!url.hash || url.hash === '#lead-form');
  }

  var form = d.getElementById('lead-form');
  var ownForm = Boolean(form);
  var slot = form && form.querySelector('[data-short-fields]');
  if (slot) slot.outerHTML = SHORT_FIELDS;   // своя форма страницы — вернём её на место при закрытии
  if (!form) {
    var holder = d.createElement('div');
    holder.innerHTML = FORM_HTML;
    form = holder.firstChild;
    holder.removeChild(form);
    /* «Удобнее написать?» на /payments/* — блок добавляет site.js (подключён раньше). */
    if (window.LOKO && typeof window.LOKO.addFormMessengers === 'function') window.LOKO.addFormMessengers(form);
  }
  if (!d.getElementById('toast')) {
    var toast = d.createElement('div');
    toast.className = 'toast'; toast.id = 'toast';
    toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
    toast.hidden = true; toast.innerHTML = TOAST_HTML;
    d.body.appendChild(toast);
  }

  var modal = d.createElement('div');
  modal.className = 'lead-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="lead-modal__backdrop" data-lead-close></div>' +
    '<div class="lead-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">' +
      '<button type="button" class="lead-modal__close" data-lead-close aria-label="Закрыть">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button>' +
      '<h2 class="lead-modal__title" id="lead-modal-title">Заявка на расчёт платежа</h2>' +
      '<p class="lead-modal__sub">Направление, сумма и валюта — вернёмся с расчётом в течение рабочего дня</p>' +
      '<div class="lead-modal__body"></div>' +
    '</div>';
  d.body.appendChild(modal);
  var body = modal.querySelector('.lead-modal__body');

  /* Страница уже говорит, о чём заявка: направление и «кто вы» выбраны заранее, их можно поменять. */
  var pathDir = /^\/individuals\//.test(location.pathname) ? 'individuals'
    : (location.pathname.match(/^\/payments\/([a-z]+)\//) || [])[1];
  var dirSelect = form.querySelector('select[name="direction"]');
  if (dirSelect && pathDir && dirSelect.querySelector('option[value="' + pathDir + '"]')) dirSelect.value = pathDir;
  var person = form.querySelector('#client-kind-person');
  if (person && /^\/individuals\//.test(location.pathname)) person.checked = true;

  /* Своя форма страницы остаётся на месте; в окно она переезжает только на время показа. */
  var home = ownForm ? d.createComment('lead-form') : null;
  if (home) form.parentNode.insertBefore(home, form);
  else body.appendChild(form);

  /* Шаги к заявке (Тати 2026-10-30) — в Метрику и в нашу статистику (stat.js). Существующие
     цели (lead_modal_open, lead_form) не трогаем. */
  var STEP_LABEL = {
    lead_button_click: 'Нажали «Оставить заявку» / «Рассчитать»',
    lead_form_open: 'Открыли форму заявки',
    lead_form_start: 'Начали заполнять форму заявки',
  };
  function step(name) {
    if (typeof window.ymGoal === 'function') window.ymGoal(name);
    if (window.LOKO_STAT && typeof window.LOKO_STAT.event === 'function') window.LOKO_STAT.event(STEP_LABEL[name]);
  }
  var LEAD_TEXT = /^\s*(оставить заявку|рассчитать)/i;
  var started = false;
  function onFirstInput(e) {
    if (started || !e.target || !e.target.name || e.target.name === 'lk_trap' || e.target.type === 'hidden') return;
    started = true;
    step('lead_form_start');
  }
  form.addEventListener('input', onFirstInput);
  form.addEventListener('change', onFirstInput);

  var lastFocus = null;
  function open() {
    if (!modal.hidden) return;
    lastFocus = d.activeElement;
    if (home) body.appendChild(form);
    /* Мобильное меню могло быть открыто — закрываем, чтобы не висело под окном. */
    var nav = d.getElementById('nav'), burger = d.getElementById('burger');
    if (nav) nav.classList.remove('is-open');
    if (burger) { burger.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
    modal.hidden = false;
    d.documentElement.classList.add('is-lead-modal');
    requestAnimationFrame(function () { modal.classList.add('is-visible'); });
    var first = form.querySelector('#name');
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
    if (typeof window.ymGoal === 'function') window.ymGoal('lead_modal_open');
    step('lead_form_open');
  }
  function close() {
    if (modal.hidden) return;
    modal.classList.remove('is-visible');
    modal.hidden = true;
    d.documentElement.classList.remove('is-lead-modal');
    if (home) home.parentNode.insertBefore(form, home.nextSibling);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  window.LOKO_LEAD_MODAL = { open: open, close: close };

  /* Перехватываем раньше всех (фаза захвата): иначе браузер успевает начать прокрутку. */
  d.addEventListener('click', function (e) {
    if (e.target.closest('[data-lead-close]')) { close(); return; }
    var btn = e.target.closest('a, button');
    if (btn && !modal.contains(btn) && LEAD_TEXT.test(btn.textContent || '')) step('lead_button_click');
    var a = e.target.closest('a[href], [data-lead-modal]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (modal.contains(a)) return;
    if (a.tagName === 'A' ? isLeadLink(a) : true) { e.preventDefault(); open(); }
  }, true);
  d.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    /* Фокус не уходит из окна под затемнение. */
    var items = modal.querySelectorAll('button, input:not([tabindex="-1"]), textarea, a[href]');
    var list = Array.prototype.filter.call(items, function (x) { return x.offsetParent !== null; });
    if (!list.length) return;
    var firstEl = list[0], lastEl = list[list.length - 1];
    if (e.shiftKey && d.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && d.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  });
  d.addEventListener('loko:lead-sent', close);

  /* Ссылка вида /#zayavka с другой страницы: открываем окно сразу после загрузки. */
  if (FORM_HASHES.indexOf(location.hash) !== -1) {
    history.replaceState(null, '', location.pathname + location.search);
    window.addEventListener('load', open);
  }
})();
