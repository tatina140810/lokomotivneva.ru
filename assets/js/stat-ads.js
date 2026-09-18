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

    /* План и освоение на сегодня. Бюджет вносится на весь срок кампании, а видеть
       нужно, сколько из него уже съедено к сегодняшнему дню и сколько осталось
       (Тати 2026-09-18). Освоение считается равномерно по дням: как именно тратит
       площадка, мы не знаем, и честнее показать ровную прикидку, чем выдумать кривую. */
    function plan() {
      var rows = (opts.summary.budgetPlan || []);
      if (!rows.length) return '';
      var body = rows.map(function (p) {
        var pct = p.total ? Math.round((p.spentToDate / p.total) * 100) : 0;
        return '<tr><td>' + esc(p.label)
          + '<div class="t-sub">' + dmy(p.periodStart) + ' — ' + dmy(p.periodEnd)
          + ' · день ' + p.daysPassed + ' из ' + p.daysTotal + '</div></td>'
          + '<td>' + money(p.total) + '</td>'
          + '<td>' + money(p.spentToDate) + '<div class="t-sub">' + pct + '% срока</div></td>'
          + '<td><b>' + money(p.remaining) + '</b>'
          + (p.remainingMeasured ? '<div class="t-sub">по замеру</div>' : '<div class="t-sub">расчётный</div>') + '</td>'
          + '<td>' + money(p.perDay) + '</td></tr>';
      }).join('');
      return '<h3 class="adsh3">Бюджеты: сколько освоено на сегодня</h3>'
        + '<table><thead><tr><th>Статья</th><th>Бюджет кампании</th>'
        + '<th>Освоено на сегодня</th><th>Остаток</th><th>В день</th></tr></thead>'
        + '<tbody>' + body + '</tbody></table>'
        + '<p class="t-sub" style="margin:8px 0 0">Освоение считается равномерно по дням '
        + 'срока кампании. Фактический расход площадки может идти неровно — для Директа '
        + 'сверяйтесь с кабинетом.</p>';
    }

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

    /* Вносить можно то, что реально видно в кабинете: остаток на счёте, пополнение
       или расход за период. Из остатков расход считается сам (положили минус
       осталось) — так Тати и смотрит цифры (2026-09-18). */
    function form() {
      var today = new Date().toISOString().slice(0, 10);
      return '<div class="adsform">'
        + '<div class="adsform__row">'
        + '<label>Что вносим<select id="ad-kind">'
        + '<option value="balance">Остаток на счёте</option>'
        + '<option value="topup">Пополнение счёта</option>'
        + '<option value="spend">Расход за период</option>'
        + '</select></label>'
        + '<label>Канал<select id="ad-ch">' + CHANNELS.map(function (c) {
          return '<option value="' + c[0] + '">' + c[1] + '</option>';
        }).join('') + '</select></label>'
        + '<label><span id="ad-from-lbl">На дату</span><input type="date" id="ad-from" value="' + today + '"></label>'
        + '<label id="ad-to-wrap" hidden>по<input type="date" id="ad-to" value="' + today + '"></label>'
        + '<label>Сумма<input type="text" id="ad-sum" inputmode="decimal" placeholder="11815"></label>'
        + '<label>Валюта<select id="ad-cur">'
        + '<option value="RUB">₽</option><option value="EUR">€</option><option value="USD">$</option>'
        + '</select></label>'
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
          var kindName = { balance: 'остаток', topup: 'пополнение', spend: 'расход' }[r.kind || 'spend'];
          var sign = { RUB: ' ₽', EUR: ' €', USD: ' $' }[r.currency || 'RUB'] || '';
          var shown = nf.format(Math.round(Number(r.amount))) + sign
            + (r.currency && r.currency !== 'RUB'
              ? '<div class="t-sub">' + money(r.amount_rub) + ' по курсу</div>' : '');
          return '<tr><td>' + esc(NAMES[r.channel] || r.channel)
            + '<div class="t-sub">' + kindName + (r.note ? ' · ' + esc(r.note) : '') + '</div></td>'
            + '<td>' + (r.kind === 'spend' ? dmy(r.period_start) + ' — ' + dmy(r.period_end) : dmy(r.period_start)) + '</td>'
            + '<td>' + shown + (r.clicks ? '<div class="t-sub">' + nf.format(r.clicks) + ' кликов</div>' : '') + '</td>'
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
        + plan()
        + '<h3 class="adsh3">За выбранный период</h3>'
        + budgets()
        + '<h3 class="adsh3">По каналам подробно</h3>'
        + table() + form() + list(spendRows) + '</div>';

      /* Остаток и пополнение — это одна дата, расход — период. Лишнее поле только
         путало бы. */
      var kindSel = d.getElementById('ad-kind');
      function syncKind() {
        var isRange = kindSel.value === 'spend';
        d.getElementById('ad-to-wrap').hidden = !isRange;
        d.getElementById('ad-from-lbl').textContent = isRange ? 'Период с' : 'На дату';
      }
      kindSel.addEventListener('change', syncKind);
      syncKind();

      d.getElementById('ad-add').addEventListener('click', function () {
        var btn = d.getElementById('ad-add');
        var err = d.getElementById('ad-err');
        var sum = d.getElementById('ad-sum').value.replace(',', '.').trim();
        var kind = kindSel.value;
        var from = d.getElementById('ad-from').value;
        var to = kind === 'spend' ? d.getElementById('ad-to').value : from;
        err.textContent = '';
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(sum)) { err.textContent = 'Введите сумму, например 11815 или 493.50'; return; }
        if (!from || !to) { err.textContent = kind === 'spend' ? 'Укажите период' : 'Укажите дату'; return; }
        if (to < from) { err.textContent = 'Дата «по» раньше даты «с»'; return; }
        btn.disabled = true; btn.textContent = 'Сохраняем…';
        w.fetch(api + '/site-analytics/spend', {
          method: 'POST', headers: head,
          body: JSON.stringify({
            channel: d.getElementById('ad-ch').value,
            kind: kind,
            currency: d.getElementById('ad-cur').value,
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
