/* Раздел «Реклама» на странице статистики (Тати 2026-09-18): во сколько обходится
   переход и, главное, заявка.

   Расход вносится руками: eLama не отдаёт статистику наружу, у Telegram Ads открытого
   API для рекламодателей нет. Зато переходы и заявки — наши собственные данные, и цена
   заявки считается честно, по ним. */
(function (w, d) {
  'use strict';
  var CHANNELS = [
    ['yandex_ads', 'Яндекс.Директ'],
    ['telegram_ads', 'Реклама в Telegram'],
    ['offline_led', 'Экраны в Москва-Сити'],
    ['google_ads', 'Google Ads'],
    ['social', 'Соцсети'],
    ['other', 'Другая реклама'],
  ];
  var NAMES = {};
  CHANNELS.forEach(function (c) { NAMES[c[0]] = c[1]; });

  var nf = new Intl.NumberFormat('ru-RU');
  function money(v) {
    if (v == null) return '—';
    var n = Number(v);
    return nf.format(Math.round(n)) + ' ₽';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dmy(iso) {
    if (!iso) return '';
    var s = String(iso).slice(0, 10).split('-');
    return s[2] + '.' + s[1] + '.' + s[0];
  }

  /* host — куда рисуем; opts = { api, token, summary, onChange } */
  w.renderAdsBox = function (host, opts) {
    var api = opts.api;
    var head = { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' };
    var chans = (opts.summary.channels || []).filter(function (c) { return NAMES[c.channel]; });

    /* Три статьи бюджета: помеченный трафик — к своей рекламе, весь остальной — к
       экранам (решение Тати 2026-09-18). Для экранов это ОЦЕНКА: туда же попадают
       возвраты, сарафан, визитки и поиск по названию компании. Оговорка стоит рядом
       с цифрой, а не в примечании внизу, чтобы её нельзя было не заметить. */
    function budgets() {
      var groups = opts.summary.budgetGroups || [];
      if (!groups.length) return '';
      var rows = groups.map(function (g) {
        return '<tr><td>' + esc(g.label)
          + (g.measured ? '' : '<div class="t-sub">оценка: сюда попадает весь непомеченный трафик</div>')
          + '</td>'
          + '<td>' + money(g.spend) + '</td>'
          + '<td>' + nf.format(g.visits) + '</td>'
          + '<td>' + nf.format(g.newVisitors) + '</td>'
          + '<td>' + nf.format(g.leads) + '</td>'
          + '<td><b>' + money(g.costPerLead) + '</b></td></tr>';
      }).join('');
      return '<table><thead><tr><th>Статья бюджета</th><th>Потрачено</th><th>Переходов</th>'
        + '<th>Из них впервые</th><th>Заявок</th><th>Цена заявки</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>';
    }

    function table() {
      var spent = chans.some(function (c) { return c.spend > 0; });
      var rows = chans.map(function (c) {
        /* Доля кликов, дошедших до сайта. Меньше 100% — это норма: часть людей
           закрывает страницу до загрузки, часть с блокировщиками, один человек
           может кликнуть дважды. Резкое падение — повод проверить метку и страницу. */
        var reach = c.clicks
          ? '<div class="t-sub">' + nf.format(c.clicks) + ' в кабинете · дошло '
            + (c.reachRate != null ? c.reachRate + '%' : '—') + '</div>'
          : '';
        return '<tr><td>' + esc(NAMES[c.channel] || c.channel) + '</td>'
          + '<td>' + money(c.spend) + '</td>'
          + '<td>' + nf.format(c.visits) + reach + '</td>'
          + '<td>' + nf.format(c.leads) + '</td>'
          + '<td>' + money(c.costPerVisit) + '</td>'
          + '<td><b>' + money(c.costPerLead) + '</b></td></tr>';
      }).join('');
      if (!rows) {
        return '<p class="empty">Переходов с рекламы за период не было. '
          + 'Проверьте, что в объявлениях стоит метка — без неё реклама попадает в «прямые заходы».</p>';
      }
      return '<table><thead><tr><th>Канал</th><th>Потрачено</th><th>Переходов</th>'
        + '<th>Заявок</th><th>Цена перехода</th><th>Цена заявки</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>'
        + (spent ? '' : '<p class="t-sub" style="margin:10px 0 0">Расход пока не внесён — '
          + 'добавьте сумму из рекламного кабинета, и цена заявки посчитается сама.</p>');
    }

    function form() {
      var today = new Date().toISOString().slice(0, 10);
      return '<div class="adsform">'
        + '<div class="adsform__row">'
        + '<label>Канал<select id="ad-ch">' + CHANNELS.map(function (c) {
          return '<option value="' + c[0] + '">' + c[1] + '</option>';
        }).join('') + '</select></label>'
        + '<label>Период с<input type="date" id="ad-from" value="' + today + '"></label>'
        + '<label>по<input type="date" id="ad-to" value="' + today + '"></label>'
        + '<label>Потрачено, ₽<input type="text" id="ad-sum" inputmode="decimal" placeholder="54.35"></label>'
        + '<label>Кликов<input type="text" id="ad-clicks" inputmode="numeric" placeholder="10"></label>'
        + '<label>Пометка<input type="text" id="ad-note" placeholder="кампания"></label>'
        + '<button type="button" class="bar__btn" id="ad-add">Внести</button>'
        + '</div><p class="adsform__err" id="ad-err"></p></div>';
    }

    function list(rows) {
      if (!rows.length) return '';
      return '<table style="margin-top:14px"><thead><tr><th>Внесено</th><th>Период</th>'
        + '<th>Сумма</th><th></th></tr></thead><tbody>'
        + rows.map(function (r) {
          return '<tr><td>' + esc(NAMES[r.channel] || r.channel)
            + (r.note ? '<div class="t-sub">' + esc(r.note) + '</div>' : '') + '</td>'
            + '<td>' + dmy(r.period_start) + ' — ' + dmy(r.period_end) + '</td>'
            + '<td>' + money(r.amount) + (r.clicks ? '<div class="t-sub">' + nf.format(r.clicks) + ' кликов</div>' : '') + '</td>'
            + '<td><button type="button" class="bar__btn" data-del="' + r.id + '">Убрать</button></td></tr>';
        }).join('') + '</tbody></table>';
    }

    function draw(spendRows) {
      host.innerHTML = '<div class="card"><div class="card__head"><h2>Реклама: во сколько обходится</h2>'
        + '<span class="card__note">расход вносится из рекламного кабинета вручную — '
        + 'ни eLama, ни Telegram Ads не отдают его автоматически</span></div>'
        + '<p class="t-sub" style="margin:-4px 0 12px">Вносите <b>фактический расход</b> '
        + '(колонка «Расход» в кабинете), а не недельный бюджет и не сумму на балансе — '
        + 'иначе цена заявки будет завышена в разы. Клики из кабинета указывать необязательно: '
        + 'они нужны, чтобы видеть, какая доля кликов дошла до сайта.</p>'
        + budgets()
        + '<h3 class="adsh3">По каналам подробно</h3>'
        + table() + form() + list(spendRows) + '</div>';

      d.getElementById('ad-add').addEventListener('click', function () {
        var btn = d.getElementById('ad-add');
        var err = d.getElementById('ad-err');
        var sum = d.getElementById('ad-sum').value.replace(',', '.').trim();
        var from = d.getElementById('ad-from').value;
        var to = d.getElementById('ad-to').value;
        err.textContent = '';
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(sum)) { err.textContent = 'Введите сумму, например 12500 или 12500.50'; return; }
        if (!from || !to) { err.textContent = 'Укажите период'; return; }
        if (to < from) { err.textContent = 'Дата «по» раньше даты «с»'; return; }
        btn.disabled = true; btn.textContent = 'Сохраняем…';
        w.fetch(api + '/site-analytics/spend', {
          method: 'POST', headers: head,
          body: JSON.stringify({
            channel: d.getElementById('ad-ch').value,
            period_start: from, period_end: to, amount: sum,
            clicks: d.getElementById('ad-clicks').value.trim(),
            note: d.getElementById('ad-note').value,
          }),
        }).then(function (r) {
          btn.disabled = false; btn.textContent = 'Внести';
          if (!r.ok) { err.textContent = 'Не удалось сохранить, проверьте поля'; return; }
          if (opts.onChange) opts.onChange();
        }).catch(function () {
          btn.disabled = false; btn.textContent = 'Внести';
          err.textContent = 'Нет связи с системой';
        });
      });

      [].forEach.call(host.querySelectorAll('[data-del]'), function (b) {
        b.addEventListener('click', function () {
          b.disabled = true; b.textContent = 'Убираем…';
          w.fetch(api + '/site-analytics/spend/' + b.getAttribute('data-del'), {
            method: 'DELETE', headers: head,
          }).then(function () { if (opts.onChange) opts.onChange(); });
        });
      });
    }

    w.fetch(api + '/site-analytics/spend', { headers: head })
      .then(function (r) { return r.ok ? r.json() : { spend: [] }; })
      .then(function (res) { draw(res.spend || []); })
      .catch(function () { draw([]); });
  };
})(window, document);
