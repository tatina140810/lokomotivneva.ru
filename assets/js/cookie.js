/* =============================================================================
   cookie.js — уведомление об использовании cookie и управление согласием.
   -----------------------------------------------------------------------------
   Зачем: в российском праве нет отдельного требования к формату баннера, но
   Роскомнадзор в разъяснениях считает cookie персональными данными, если они
   позволяют косвенно определить человека или строят поведенческий профиль.
   Наш собственный счётчик (stat.js) как раз ставит постоянный идентификатор и
   пишет поведение, Метрика с Вебвизором — тем более. Значит посетителя нужно
   информировать и дать способ отказаться.

   Как устроено:
   • Выбор хранится в localStorage под ключом loko_analytics: allow или deny.
     Cookie для этого не заводим — хранить согласие на аналитику в ещё одной
     cookie было бы странно.
   • «Только необходимые» дополнительно ставит loko_stat_off=1 — этот ключ
     stat.js проверял и раньше, отдельной правки там не потребовалось.
   • Счётчики Метрики и VK живут инлайном в <head> каждой страницы, поэтому
     отказ на СЛЕДУЮЩИХ страницах отрабатывает гейт (тот же ключ читается до
     счётчиков). На текущей странице счётчик уже отработал один хит — его мы
     не отменяем, но стираем оставленные им cookie, чтобы посетитель не
     оставался помеченным.
   • Пока выбор не сделан, аналитика работает. Это осознанное решение: в РФ
     предварительная блокировка (как в GDPR) не требуется, а статистика по
     рекламе на сайте — рабочий инструмент. Если юрист попросит строгий
     вариант, достаточно в гейте считать «нет ответа» отказом.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var KEY = 'loko_analytics';
  var STAT_OFF = 'loko_stat_off';

  function read(key) {
    try { return w.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, val) {
    try { w.localStorage.setItem(key, val); } catch (e) { /* приватный режим */ }
  }

  /* Выбор уже сделан — баннер не показываем. */
  var choice = read(KEY);
  if (choice === 'allow' || choice === 'deny') return;

  /* Счётчики Метрики и Top.Mail.Ru ставят свои cookie на домен сайта. После
     отказа они становятся следом, которого человек не хотел, — убираем.
     Имена известны и стабильны: префикс _ym_ у Метрики, tmr_ у VK. */
  function dropAnalyticsCookies() {
    var host = w.location.hostname;
    var domains = ['', host, '.' + host, '.' + host.replace(/^www\./, '')];
    d.cookie.split(';').forEach(function (pair) {
      var name = pair.split('=')[0].trim();
      if (!/^(_ym_|tmr_|tmr[A-Za-z])/.test(name)) return;
      domains.forEach(function (dom) {
        d.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/' +
                   (dom ? '; domain=' + dom : '');
      });
    });
  }

  var box = d.createElement('aside');
  box.className = 'cookie';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Использование cookie');
  box.innerHTML =
    '<p class="cookie__text">Сайт использует файлы cookie и сервисы веб-аналитики, ' +
    'чтобы запоминать настройки и понимать, какие страницы и объявления приводят ' +
    'клиентов. Подробнее — в <a href="/privacy/">политике обработки персональных данных</a>.</p>' +
    '<div class="cookie__actions">' +
      '<button type="button" class="btn btn--gold cookie__btn" data-cookie="allow">Принять</button>' +
      '<button type="button" class="btn btn--ghost cookie__btn" data-cookie="deny">Только необходимые</button>' +
    '</div>';

  function decide(value) {
    write(KEY, value);
    if (value === 'deny') {
      write(STAT_OFF, '1');
      dropAnalyticsCookies();
      /* Метрика умеет выключаться на лету по этому флагу — на текущей странице
         дальше не соберёт ни клики, ни Вебвизор. */
      w['disableYaCounter112180979'] = true;
      /* Идентификатор нашего собственного счётчика — такой же след, как cookie
         Метрики, и после отказа ему в браузере делать нечего. */
      try {
        w.localStorage.removeItem('loko_vid');
        w.localStorage.removeItem('loko_sid');
      } catch (e) { /* приватный режим */ }
    }
    box.classList.add('cookie--out');
    setTimeout(function () { box.remove(); }, 260);
  }

  box.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cookie]');
    if (btn) decide(btn.getAttribute('data-cookie'));
  });

  function show() {
    d.body.appendChild(box);
    /* Кадр на вставку в DOM, иначе переход не проигрывается. */
    requestAnimationFrame(function () { box.classList.add('cookie--in'); });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', show);
  else show();
})(window, document);
