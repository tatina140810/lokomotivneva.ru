/* Страница внутренней статистики /stat/ (Тати 2026-09-17).
   Главный вопрос, на который она отвечает: сколько людей пришло из Яндекса, а сколько
   из других каналов — и сколько из каждого канала дошло до заявки.

   Данные берём из нашей системы: app.lokomotivneva.ru/api/site-analytics/summary.
   Вход — по учётной записи сотрудника, отдельных паролей для сайта не заводим. */
(function (w, d) {
  'use strict';
  var API = 'https://app.lokomotivneva.ru/api';
  var TOKEN_KEY = 'loko_stat_token';
  var $ = function (sel) { return d.querySelector(sel); };
  var token = null;
  try { token = w.sessionStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }

  /* ---------------------------- Форматирование ---------------------------- */
  var nf = new Intl.NumberFormat('ru-RU');
  function num(v) { return nf.format(Math.round(Number(v) || 0)); }
  function pct(v) { return (Math.round(Number(v) * 10) / 10).toString().replace('.', ',') + '%'; }
  function dur(ms) {
    var s = Math.round((Number(ms) || 0) / 1000);
    if (s < 60) return s + ' сек';
    var m = Math.floor(s / 60), r = s % 60;
    return m + ' мин ' + (r < 10 ? '0' : '') + r + ' сек';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* Ячейка-полоса: доля читается взглядом, а точное число стоит рядом. */
  function barCell(value, max, kind) {
    var wd = max > 0 ? Math.round((value / max) * 100) : 0;
    return '<td class="barcell"><span class="barcell__fill barcell__fill--' + kind + '" style="width:' + wd + '%"></span>'
      + '<span class="barcell__num">' + num(value) + '</span></td>';
  }

  /* -------------------------------- Вход ---------------------------------- */
  function showLogin(msg) {
    $('#login').hidden = false;
    $('#app').hidden = true;
    $('#top').hidden = true;
    if (msg) $('#login-err').textContent = msg;
  }
  function showApp(who) {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#top').hidden = false;
    if (who) $('#who').textContent = who;
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#login-btn');
    var user = $('#login-user').value.trim();
    var pass = $('#login-pass').value;
    $('#login-err').textContent = '';
    btn.disabled = true; btn.textContent = 'Входим…';
    fetch(API + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: user, phone: user, password: pass }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = 'Войти';
        if (!res.ok) {
          $('#login-err').textContent = res.j && res.j.error === 'rate_limit_exceeded'
            ? 'Слишком много попыток. Подождите немного.'
            : 'Неверный логин или пароль.';
          return;
        }
        token = res.j.token;
        try { w.sessionStorage.setItem(TOKEN_KEY, token); } catch (e2) { /* приватный режим */ }
        showApp(res.j.employee ? res.j.employee.name : '');
        load();
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = 'Войти';
        $('#login-err').textContent = 'Нет связи с системой. Попробуйте ещё раз.';
      });
  });

  $('#exit').addEventListener('click', function () {
    token = null;
    try { w.sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ничего */ }
    showLogin('');
  });

  /* ------------------------------- Период --------------------------------- */
  /* Границы считаем здесь, по часовому поясу смотрящего: если бы их определял
     сервер, «сегодня» на экране и в базе расходились бы на несколько часов. */
  var period = { days: 30 };
  function bounds() {
    var to = new Date();
    var from;
    if (period.from && period.to) {
      from = new Date(period.from + 'T00:00:00');
      to = new Date(period.to + 'T23:59:59');
    } else if (period.days === 0) {
      from = new Date(); from.setHours(0, 0, 0, 0);
    } else {
      from = new Date(Date.now() - period.days * 86400000);
    }
    return { from: from.toISOString(), to: to.toISOString() };
  }

  $('#period').addEventListener('click', function (e) {
    var btn = e.target.closest('.bar__btn');
    if (!btn || !btn.hasAttribute('data-days')) return;
    period = { days: Number(btn.getAttribute('data-days')) };
    [].forEach.call(d.querySelectorAll('#period .bar__btn[data-days]'), function (b) {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    $('#d-from').value = ''; $('#d-to').value = '';
    load();
  });
  $('#d-apply').addEventListener('click', function () {
    var f = $('#d-from').value, t = $('#d-to').value;
    if (!f || !t) return;
    period = { from: f, to: t };
    [].forEach.call(d.querySelectorAll('#period .bar__btn[data-days]'), function (b) {
      b.setAttribute('aria-pressed', 'false');
    });
    load();
  });

  /* ------------------------------ Загрузка -------------------------------- */
  function load() {
    var b = bounds();
    $('#content').innerHTML = '<p class="loading">Загружаем данные…</p>';
    fetch(API + '/site-analytics/summary?from=' + encodeURIComponent(b.from) + '&to=' + encodeURIComponent(b.to), {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        if (r.status === 401) { showLogin('Сессия закончилась, войдите заново.'); return null; }
        if (r.status === 403) {
          $('#content').innerHTML = '<div class="card"><p class="empty">Раздел доступен директору. '
            + 'Если статистика только что включена — обновите страницу через минуту.</p></div>';
          return null;
        }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (data) { if (data) render(data); })
      .catch(function () {
        /* Показываем именно ошибку, а не пустой отчёт: ноль визитов и сломанная
           загрузка — разные вещи, и путать их нельзя. */
        $('#content').innerHTML = '<div class="card"><p class="empty">Не удалось получить данные. '
          + 'Проверьте связь и обновите страницу.</p></div>';
      });
  }

  /* -------------------------------- Вывод --------------------------------- */
  function render(x) {
    var t = x.totals, ya = x.yandexVsRest.yandex, ot = x.yandexVsRest.rest;
    var html = '';

    // 1. Главный ответ — крупно и первым делом, сразу с разбивкой внутри.
    // Без неё «из Яндекса 2» не отвечает на главный вопрос: это платная реклама или
    // бесплатный поиск. Ради этого различия всё и затевалось.
    html += '<div class="split">'
      + '<div class="split__card split__card--yandex">'
      + '<div class="split__label">Пришли из Яндекса</div>'
      + '<div class="split__value">' + num(ya.visits) + '<span class="split__unit">' + (ya.share) + '% визитов</span></div>'
      + breakdown(x.channels, true)
      + '<div class="split__meta">Заявок из Яндекса: <b>' + num(ya.leads) + '</b></div>'
      + '</div>'
      + '<div class="split__card split__card--other">'
      + '<div class="split__label">Пришли из других каналов</div>'
      + '<div class="split__value">' + num(ot.visits) + '<span class="split__unit">' + (ot.share) + '% визитов</span></div>'
      + breakdown(x.channels, false)
      + '<div class="split__meta">Заявок из других каналов: <b>' + num(ot.leads) + '</b></div>'
      + '</div></div>';

    // 2. Сводка.
    html += '<div class="tiles">'
      + tile('Визитов', num(t.visits), num(t.pageviews) + ' просмотров страниц')
      + tile('Человек', num(t.visitors), 'разных посетителей')
      + tile('Из них впервые', num(t.newVisitors), 'раньше не заходили')
      + tile('Среднее время', dur(t.avgVisitMs), String(t.avgDepth).replace('.', ',') + ' страницы за визит')
      + tile('Ушли сразу', t.bounceRate + '%', 'одна страница, меньше 15 сек')
      + tile('Заявок с сайта', num(t.leads), 'конверсия ' + pct(t.leadRate))
      + '</div>';

    // 3. Динамика.
    html += '<div class="card"><div class="card__head"><h2>Динамика по дням</h2>'
      + '<span class="card__note">визиты: Яндекс и остальные каналы</span></div>'
      + '<div id="chart"></div></div>';

    // 4. Каналы — основная таблица.
    var maxCh = x.channels.reduce(function (m, c) { return Math.max(m, c.visits); }, 0);
    html += '<div class="card"><div class="card__head"><h2>Откуда приходят</h2>'
      + '<span class="card__note">канал запоминается за визитом; новыми считаются люди, которых мы раньше не видели</span></div>';
    if (!x.channels.length) {
      html += '<p class="empty">За период визитов не было.</p>';
    } else {
      html += '<table><thead><tr><th>Канал</th><th>Визиты</th><th>Человек</th><th>Из них впервые</th>'
        + '<th>Ср. время</th><th>Глубина</th><th>Ушли сразу</th><th>Заявок</th><th>Конверсия</th></tr></thead><tbody>';
      x.channels.forEach(function (c) {
        var kind = c.isYandex ? 'yandex' : 'other';
        html += '<tr><td><i class="dot dot--' + kind + '"></i>' + esc(c.label) + '</td>'
          + barCell(c.visits, maxCh, kind)
          + '<td>' + num(c.visitors) + '</td>'
          + '<td>' + num(c.newVisitors) + '</td>'
          + '<td>' + dur(c.avgVisitMs) + '</td>'
          + '<td>' + String(c.avgDepth).replace('.', ',') + '</td>'
          + '<td>' + c.bounceRate + '%</td>'
          + '<td' + (c.leads ? '' : ' class="t-zero"') + '>' + num(c.leads) + '</td>'
          + '<td' + (c.leads ? '' : ' class="t-zero"') + '>' + pct(c.leadRate) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    // 5. Конкретные источники и страницы входа.
    html += '<div class="grid2">';
    html += '<div class="card"><div class="card__head"><h2>Конкретные источники</h2>'
      + '<span class="card__note">кампании и сайты внутри каналов</span></div>' + list(x.sources, function (s) {
        return '<tr><td>' + esc(s.detail) + '<div class="t-sub">' + esc(s.label) + '</div></td><td>' + num(s.visits) + '</td></tr>';
      }, '<th>Источник</th><th>Визиты</th>', 'Пока нет данных об источниках.') + '</div>';
    html += '<div class="card"><div class="card__head"><h2>Куда попадают</h2>'
      + '<span class="card__note">первая страница визита</span></div>' + list(x.landings, function (p) {
        return '<tr><td>' + esc(p.path) + '</td><td>' + num(p.visits) + '</td><td>' + num(p.fromYandex) + '</td></tr>';
      }, '<th>Страница</th><th>Визиты</th><th>из Яндекса</th>', 'Пока нет данных.') + '</div>';
    html += '</div>';

    // 6. Страницы.
    html += '<div class="card"><div class="card__head"><h2>Что смотрят</h2>'
      + '<span class="card__note">просмотры страниц и сколько на них задерживаются</span></div>'
      + list(x.pages, function (p) {
        return '<tr><td>' + esc(p.path) + '<div class="t-sub">' + esc(p.section) + '</div></td>'
          + '<td>' + num(p.views) + '</td><td>' + num(p.visits) + '</td><td>' + dur(p.avgMs) + '</td></tr>';
      }, '<th>Страница</th><th>Просмотры</th><th>Визиты</th><th>Ср. время</th>', 'Пока нет просмотров.') + '</div>';

    // 7. Действия, возвраты, устройства.
    html += '<div class="grid2">';
    // Подпись уточнена (Тати 2026-09-18): «Telegram» здесь легко принять за переход
    // ИЗ Telegram, хотя это наоборот — посетитель нажал нашу кнопку и ушёл в мессенджер.
    html += '<div class="card"><div class="card__head"><h2>Что делают на сайте</h2>'
      + '<span class="card__note">нажатия на наши кнопки и ссылки — это действия посетителей, '
      + 'а не источники перехода</span></div>'
      + list(x.actions, function (a) {
        return '<tr><td>' + esc(a.target) + '</td><td>' + num(a.count) + '</td><td>' + num(a.visits) + '</td></tr>';
      }, '<th>Действие</th><th>Раз</th><th>В скольких визитах</th>', 'Целевых действий пока не было.') + '</div>';

    var r = x.returning;
    html += '<div class="card"><div class="card__head"><h2>Возвращаются ли</h2>'
      + '<span class="card__note">сколько раз один человек заходил за период</span></div>'
      + '<table><tbody>'
      + '<tr><td>Были один раз</td><td>' + num(r.once) + '</td></tr>'
      + '<tr><td>Возвращались дважды</td><td>' + num(r.twice) + '</td></tr>'
      + '<tr><td>От трёх до пяти раз</td><td>' + num(r.few) + '</td></tr>'
      + '<tr><td>Больше пяти раз</td><td>' + num(r.many) + '</td></tr>'
      + '<tr><td>В среднем визитов на человека</td><td>' + String(r.avgVisits).replace('.', ',') + '</td></tr>'
      + '</tbody></table>'
      + '<div class="card__head" style="margin-top:18px"><h2>С чего смотрят</h2></div>'
      + '<table><tbody>'
      + x.devices.map(function (dv) {
        var name = { desktop: 'Компьютер', mobile: 'Телефон', tablet: 'Планшет' }[dv.device] || dv.device;
        return '<tr><td>' + esc(name) + '</td><td>' + num(dv.visits) + '</td></tr>';
      }).join('')
      + x.browsers.slice(0, 4).map(function (br) {
        return '<tr><td class="t-sub">' + esc(br.browser) + '</td><td class="t-sub">' + num(br.visits) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
    html += '</div>';

    // 8. Подсказка: без меток часть переходов неизбежно теряется в «прямых заходах».
    html += '<div class="hintbox"><h2>Чтобы Telegram и рассылки не попадали в «прямые заходы»</h2>'
      + '<p>Переход по ссылке из приложения Telegram, WhatsApp или из письма часто не сообщает, '
      + 'откуда человек пришёл. Такие визиты попадают в прямые заходы. Лечится меткой в ссылке — '
      + 'публикуйте такие адреса:</p><ul>'
      + '<li>Telegram: <code>lokomotivneva.ru/?utm_source=telegram</code></li>'
      + '<li>WhatsApp: <code>lokomotivneva.ru/?utm_source=whatsapp</code></li>'
      + '<li>Рассылка: <code>lokomotivneva.ru/?utm_source=rassylka&amp;utm_medium=email</code></li>'
      + '<li>Визитка или QR-код: <code>lokomotivneva.ru/?utm_source=vizitka</code></li>'
      + '</ul><p style="margin-top:10px;margin-bottom:0">Для Яндекс.Директа метки не нужны — '
      + 'реклама размечается автоматически.</p></div>';

    html += '<div id="mine"></div>';

    $('#content').innerHTML = html;
    if (w.renderStatChart) w.renderStatChart($('#chart'), x.daily);
    /* Блок «Мои визиты»: исключение своих заходов. Перерисовывает отчёт после
       изменения — цифры пересчитываются сразу и задним числом. */
    if (w.renderExcludeBox) w.renderExcludeBox($('#mine'), { api: API, token: token, onChange: load });
  }

  /* Разбивка внутри карточки. У Яндекса показываем все три канала всегда, даже с
     нулями: «реклама 0, поиск 5» и «реклама 5, поиск 0» — это разные новости, и
     отсутствие строки читалось бы как «данных нет», а не как «оттуда не приходили». */
  var SHORT = {
    yandex_ads: 'Реклама (Директ)', yandex_search: 'Поиск Яндекса', yandex_maps: 'Карты и Бизнес',
    google_ads: 'Реклама Google', google_search: 'Поиск Google', search_other: 'Другие поисковики',
    social: 'Соцсети', messenger: 'Мессенджеры', email: 'Рассылки',
    referral: 'Ссылки с сайтов', direct: 'Прямые заходы', other: 'Прочее',
  };
  var YANDEX_KEYS = ['yandex_ads', 'yandex_search', 'yandex_maps'];

  function breakdown(channels, isYandex) {
    var by = {};
    channels.forEach(function (c) { by[c.channel] = c; });
    var keys = isYandex ? YANDEX_KEYS
      : channels.filter(function (c) { return !c.isYandex && c.visits > 0; })
                .sort(function (a, b) { return b.visits - a.visits; })
                .map(function (c) { return c.channel; });
    if (!keys.length) return '<div class="split__rows"><div class="split__row t-zero">Переходов не было</div></div>';
    return '<div class="split__rows">' + keys.map(function (k) {
      var c = by[k];
      var visits = c ? c.visits : 0;
      var leads = c ? c.leads : 0;
      return '<div class="split__row' + (visits ? '' : ' t-zero') + '">'
        + '<span>' + (SHORT[k] || k) + '</span>'
        + '<b>' + num(visits) + (leads ? ' <span class="split__lead">· заявок ' + num(leads) + '</span>' : '') + '</b>'
        + '</div>';
    }).join('') + '</div>';
  }

  function tile(label, value, hint) {
    return '<div class="tile"><div class="tile__label">' + label + '</div>'
      + '<div class="tile__value">' + value + '</div>'
      + '<div class="tile__hint">' + hint + '</div></div>';
  }
  function list(rows, rowFn, head, empty) {
    if (!rows || !rows.length) return '<p class="empty">' + empty + '</p>';
    return '<table><thead><tr>' + head + '</tr></thead><tbody>' + rows.map(rowFn).join('') + '</tbody></table>';
  }

  /* ------------------------------- Старт ---------------------------------- */
  if (token) {
    showApp('');
    fetch(API + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (!me) { showLogin(''); return; }
        $('#who').textContent = me.employee ? me.employee.name : '';
        load();
      })
      .catch(function () { showLogin(''); });
  } else {
    showLogin('');
  }
})(window, document);
