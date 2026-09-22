/* Сводная таблица затрат на рекламу (Тати 2026-09-18).
   Одна таблица на все статьи — Директ, Telegram, экраны, буклеты, визитки и всё, что
   добавят потом, — с итогом внизу. Строку можно дописать свою: у офлайновых статей
   канала нет, переходов не бывает, но расход считать надо.

   Как считается «потрачено»: между двумя замерами остатка — точно (прошлый остаток
   плюс пополнения минус новый); из записи «расход за период» берётся доля по дням.
   Поэтому чем чаще вносится остаток, тем точнее цифры. */
(function (w, d) {
  'use strict';
  var CHANNELS = [
    ['', 'Без сайта (буклеты, визитки, офлайн)'],
    ['yandex_ads', 'Яндекс.Директ'],
    ['telegram_ads', 'Реклама в Telegram'],
    ['vk_ads', 'Реклама ВКонтакте'],
    ['offline_led', 'Экраны / наружная'],
    ['google_ads', 'Google Ads'],
    ['social', 'Соцсети'],
    ['other', 'Другая реклама'],
  ];
  var SIGNS = { RUB: ' ₽', EUR: ' €', USD: ' $' };
  var nf = new Intl.NumberFormat('ru-RU');

  function money(v) {
    if (v == null) return '—';
    return nf.format(Math.round(Number(v))) + ' ₽';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dmy(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  /* Коэффициент эффективности: 100% — переход стоит ровно столько же, сколько в
     среднем по всей рекламе; больше — дешевле среднего, меньше — дороже. Очень
     большие значения показываем разами: «6234 %» читается хуже, чем «в 62 раза
     дешевле среднего». Цветом помечаем только явные отклонения, чтобы таблица не
     превращалась в светофор. */
  function eff(v) {
    if (v == null) return '—';
    var text = v >= 1000 ? '×' + nf.format(Math.round(v / 100)) : nf.format(v) + ' %';
    var color = v >= 120 ? 'var(--good)' : (v <= 80 ? 'var(--bad)' : '');
    var hint = v >= 100 ? 'переход дешевле среднего' : 'переход дороже среднего';
    return '<span' + (color ? ' style="color:' + color + '"' : '') + ' title="' + hint + '">'
      + text + '</span>';
  }

  w.renderAdsBox = function (host, opts) {
    var api = opts.api;
    var head = { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' };
    var sum = opts.summary;

    /* Точка отсчёта: с какого дня ведётся учёт и какие остатки были зафиксированы. */
    function origin() {
      var since = sum.dataSince ? new Date(sum.dataSince) : null;
      var starts = (sum.budgetTable || []).filter(function (r) { return r.startBalance != null; });
      if (!since) return '';
      var list = starts.map(function (r) {
        var sign = SIGNS[r.currency] || ' ₽';
        var orig = r.startBalanceOriginal != null && r.currency !== 'RUB'
          ? nf.format(Math.round(r.startBalanceOriginal)) + sign
          : money(r.startBalance);
        return esc(r.title) + ' — <b>' + orig + '</b> на ' + dmy(r.startBalanceDate);
      }).join(' · ');
      return '<p class="adstotal">Учёт ведётся с <b>' + since.toLocaleDateString('ru-RU') + '</b>. '
        + (list ? 'Остатки на момент запуска: ' + list + '.' : 'Остатки на счетах пока не внесены.')
        + '<br><span class="t-sub">Дальше достаточно вносить остаток на день отчёта — '
        + 'расход посчитается сам: прошлый остаток плюс пополнения минус новый.</span></p>';
    }

    function rowsHtml() {
      var rows = sum.budgetTable || [];
      if (!rows.length) {
        return '<tr><td colspan="10" class="empty">Затраты пока не внесены. '
          + 'Добавьте первую статью — например, остаток на счёте Директа.</td></tr>';
      }
      return rows.map(function (r) {
        var sign = SIGNS[r.currency] || ' ₽';
        var remain = r.currency !== 'RUB' && r.startBalanceOriginal != null
          ? money(r.remaining)
          : money(r.remaining);
        return '<tr><td>' + esc(r.title)
          + '<div class="t-sub">' + dmy(r.periodStart) + ' — ' + dmy(r.periodEnd)
          + (r.currency !== 'RUB' ? ' · в ' + sign.trim() : '') + '</div></td>'
          + '<td>' + money(r.total) + '</td>'
          + '<td>' + money(r.spentToDate) + '</td>'
          + '<td><b>' + remain + '</b>'
          + '<div class="t-sub">' + (r.remainingMeasured ? 'по замеру' : 'расчётный') + '</div></td>'
          + '<td>' + money(r.spentInPeriod) + '</td>'
          + '<td>' + (r.visits == null ? '—' : nf.format(r.visits)) + '</td>'
          + '<td>' + money(r.costPerVisit) + '</td>'
          + '<td>' + eff(r.efficiency) + '</td>'
          + '<td>' + (r.leads == null ? '—' : nf.format(r.leads)) + '</td>'
          + '<td>' + money(r.costPerLead) + '</td></tr>';
      }).join('');
    }

    function totalRow() {
      var t = sum.budgetTotal || {};
      var m = sum.money || {};
      return '<tr class="totalrow"><td>Итого по всей рекламе</td>'
        + '<td>' + money(t.total) + '</td>'
        + '<td>' + money(t.spentToDate) + '</td>'
        + '<td>' + money(t.remaining) + '</td>'
        + '<td>' + money(t.spentInPeriod) + '</td>'
        + '<td>' + nf.format(sum.totals ? sum.totals.visits : 0) + '</td>'
        + '<td>' + money(t.costPerVisit) + '</td>'
        // Итог и есть база сравнения: по нему считается коэффициент каждой статьи.
        + '<td>100 %<div class="t-sub">среднее</div></td>'
        + '<td>' + nf.format(sum.totals ? sum.totals.contacts : 0) + '</td>'
        + '<td>' + money(m.costPerContact) + '</td></tr>';
    }

    /* Скликивание: сколько оплаченных кликов пришло с одного браузера (Тати 2026-09-20).
       Каждый клик по объявлению несёт свою метку, поэтому несколько разных меток у
       одного посетителя — это несколько оплаченных кликов из одного места. */
    function abuse() {
      var a = sum.adClicks;
      if (!a || !a.total) return '';
      var lines = (a.top || []).map(function (r) {
        var when = dmy(r.firstAt) === dmy(r.lastAt)
          ? dmy(r.firstAt)
          : dmy(r.firstAt) + ' — ' + dmy(r.lastAt);
        return '<tr><td>' + esc([r.device, r.os, r.browser].filter(Boolean).join(' · ')) + '</td>'
          + '<td>' + esc(r.channelLabel || '') + '</td>'
          + '<td><b>' + nf.format(r.clicks) + '</b></td>'
          + '<td>' + when + '</td></tr>';
      }).join('');

      var warn = a.suspiciousShare >= 20;
      return '<h3 class="adsh3">Клики по рекламе — откуда приходят</h3>'
        + '<p class="adstotal">Оплаченных кликов долетело: <b>' + nf.format(a.total) + '</b> '
        + 'с <b>' + nf.format(a.visitors) + '</b> браузеров. '
        + (a.suspiciousVisitors
          ? '<span style="color:' + (warn ? 'var(--bad)' : 'var(--ink-2)') + '">'
            + 'По <b>' + nf.format(a.suspiciousVisitors) + '</b> из них пришло '
            + '<b>' + nf.format(a.suspiciousClicks) + '</b> кликов — это '
            + '<b>' + a.suspiciousShare + '%</b> всех оплаченных переходов.</span>'
          : 'Повторных кликов с одного браузера нет.')
        + '<br><span class="t-sub">Считаем по меткам объявлений: возврат по закладке новой '
        + 'метки не создаёт и сюда не попадает. Три и больше кликов с одного браузера — повод '
        + 'посмотреть отчёт по недействительным кликам в рекламном кабинете.</span></p>'
        + (lines
          ? '<table class="budget"><thead><tr><th>Браузер</th><th>Канал</th>'
            + '<th>Кликов</th><th>Когда</th></tr></thead><tbody>' + lines + '</tbody></table>'
          : '');
    }

    function table() {
      return '<table class="budget"><thead><tr>'
        + '<th>Статья расходов</th><th>Бюджет</th><th>Потрачено всего</th><th>Остаток</th>'
        + '<th>За период отчёта</th><th>Переходов</th><th>Цена перехода</th>'
        + '<th>Эффективность</th><th>Обращений</th><th>Цена обращения</th>'
        + '</tr></thead><tbody>' + rowsHtml() + totalRow() + '</tbody></table>'
        + '<p class="t-sub" style="margin:10px 0 0">«Цена перехода» — расход за период '
        + 'отчёта, делённый на переходы этой статьи. «Эффективность» сравнивает её со '
        + 'средней ценой перехода по всей рекламе: 100 % — ровно среднее, больше — '
        + 'переходы дешевле среднего, меньше — дороже; «×5» значит впятеро дешевле '
        + 'среднего. У статей без сайта переходов нет, поэтому и коэффициента нет.</p>'
        + '<p class="t-sub" style="margin:10px 0 0">В строках «Обращений» — заявки с сайта по '
        + 'этой рекламе; в итоге — все обращения вместе со звонками (звонки по статьям не '
        + 'разносятся: номер метку не несёт). Прочерк у переходов означает, что у статьи '
        + 'нет сайта — буклеты, визитки. «Потрачено» между замерами остатка считается точно, '
        + 'из записи за длинный период берётся доля по дням.</p>';
    }

    function form() {
      var today = new Date().toISOString().slice(0, 10);
      return '<div class="adsform">'
        + '<div class="adsform__row">'
        + '<label>Что вносим<select id="ad-kind">'
        + '<option value="balance">Остаток на счёте</option>'
        + '<option value="topup">Пополнение счёта</option>'
        + '<option value="spend">Расход за период</option>'
        + '</select></label>'
        + '<label>Статья<input type="text" id="ad-title" list="ad-titles" placeholder="Яндекс.Директ"></label>'
        + '<datalist id="ad-titles">'
        + (sum.budgetTable || []).map(function (r) { return '<option value="' + esc(r.title) + '">'; }).join('')
        + '<option value="Буклеты"><option value="Визитки">'
        + '</datalist>'
        + '<label>Связать с<select id="ad-ch">' + CHANNELS.map(function (c) {
          return '<option value="' + c[0] + '">' + c[1] + '</option>';
        }).join('') + '</select></label>'
        + '<label><span id="ad-from-lbl">На дату</span><input type="date" id="ad-from" value="' + today + '"></label>'
        + '<label id="ad-to-wrap" hidden>по<input type="date" id="ad-to" value="' + today + '"></label>'
        + '<label>Сумма<input type="text" id="ad-sum" inputmode="decimal" placeholder="11815"></label>'
        + '<label>Валюта<select id="ad-cur">'
        + '<option value="RUB">₽</option><option value="EUR">€</option><option value="USD">$</option>'
        + '</select></label>'
        + '<button type="button" class="bar__btn" id="ad-add">Внести</button>'
        + '</div><p class="adsform__err" id="ad-err"></p></div>';
    }

    /* Журнал внесённого. Раньше это был один список «Что внесено», где вперемешку
       лежали три разные по смыслу вещи, и остаток на счёте читался как «столько денег
       мы внесли» (Тати 2026-09-20). Теперь они разведены по группам, и у каждой сказано,
       как она влияет на расчёт:
         · замер остатка — показание кабинета, САМ ПО СЕБЕ не расход;
         · пополнение — сколько денег положили на счёт;
         · расход за период — заявленная трата, раскладывается по дням.
       Расход между двумя замерами система считает сама: прошлый остаток + пополнения
       − новый остаток. */
    var KIND_GROUPS = [
      ['balance', 'Замеры остатка на счёте',
        'Сколько денег было на счёте в этот день. Это показание кабинета, а не трата: расход считается между двумя замерами.'],
      ['topup', 'Пополнения счёта',
        'Сколько денег положили на рекламный счёт.'],
      ['spend', 'Заявленные расходы за период',
        'Готовая сумма расхода из кабинета: в отчёте за часть периода берётся доля по дням.'],
    ];

    function list(rows) {
      if (!rows.length) return '';
      var html = '<h3 class="adsh3">Внесённые данные</h3>';
      KIND_GROUPS.forEach(function (g) {
        var kind = g[0];
        var part = rows.filter(function (r) { return (r.kind || 'spend') === kind; });
        if (!part.length) return;
        html += '<p class="t-sub" style="margin:14px 0 4px"><b style="color:var(--ink-2)">' + g[1]
          + '</b> — ' + g[2] + '</p><table><tbody>'
          + part.map(function (r) {
            var sign = SIGNS[r.currency || 'RUB'] || ' ₽';
            var shown = nf.format(Math.round(Number(r.amount))) + sign
              + (r.currency && r.currency !== 'RUB'
                ? '<div class="t-sub">' + money(r.amount_rub) + ' по курсу</div>' : '');
            return '<tr><td>' + esc(r.title || '—')
              + (r.note ? '<div class="t-sub">' + esc(r.note) + '</div>' : '') + '</td>'
              + '<td>' + (kind === 'spend'
                ? dmy(r.period_start) + ' — ' + dmy(r.period_end)
                : 'на ' + dmy(r.period_start)) + '</td>'
              + '<td>' + shown + '</td>'
              + '<td><button type="button" class="bar__btn" data-del="' + r.id + '">Убрать</button></td></tr>';
          }).join('') + '</tbody></table>';
      });
      return html;
    }

    function draw(spendRows) {
      host.innerHTML = '<div class="card"><div class="card__head"><h2>Затраты на рекламу</h2>'
        + '<span class="card__note">все статьи в одной таблице; суммы вносятся вручную — '
        + 'ни eLama, ни Telegram Ads не отдают их автоматически</span></div>'
        + origin() + table() + abuse() + form() + list(spendRows) + '</div>';

      var kindSel = d.getElementById('ad-kind');
      function syncKind() {
        var isRange = kindSel.value === 'spend';
        d.getElementById('ad-to-wrap').hidden = !isRange;
        d.getElementById('ad-from-lbl').textContent = isRange ? 'Период с' : 'На дату';
      }
      kindSel.addEventListener('change', syncKind);
      syncKind();

      /* Канал подставляем по названию статьи (Тати 2026-09-20): в форме легко оставить
         «Без сайта», и тогда запись не свяжется с каналом — переходы и цена перехода
         по ней не посчитаются, а ошибку видно только потом, в таблице. Сначала смотрим
         на уже внесённые статьи с тем же названием, затем на ключевые слова.
         Выбор оператора не перетираем: подставляем, только пока стоит «Без сайта». */
      var titleInput = d.getElementById('ad-title');
      var chSel = d.getElementById('ad-ch');
      var BY_WORD = [
        [/директ|direct|яндекс/i, 'yandex_ads'],
        [/telegram|телеграм/i, 'telegram_ads'],
        [/вконтакте|vk\b|вк\b/i, 'vk_ads'],
        [/google|гугл/i, 'google_ads'],
        [/экран|led|наружн|сити/i, 'offline_led'],
      ];
      titleInput.addEventListener('input', function () {
        if (chSel.value) return;               // оператор уже выбрал — не мешаем
        var t = titleInput.value.trim().toLowerCase();
        if (!t) return;
        var known = (sum.budgetTable || []).find(function (r) {
          return String(r.title || '').trim().toLowerCase() === t && r.channel;
        });
        if (known) { chSel.value = known.channel; return; }
        for (var i = 0; i < BY_WORD.length; i++) {
          if (BY_WORD[i][0].test(t)) { chSel.value = BY_WORD[i][1]; return; }
        }
      });

      d.getElementById('ad-add').addEventListener('click', function () {
        var btn = d.getElementById('ad-add');
        var err = d.getElementById('ad-err');
        var amount = d.getElementById('ad-sum').value.replace(',', '.').trim();
        var title = d.getElementById('ad-title').value.trim();
        var kind = kindSel.value;
        var from = d.getElementById('ad-from').value;
        var to = kind === 'spend' ? d.getElementById('ad-to').value : from;
        err.textContent = '';
        if (!title) { err.textContent = 'Укажите статью — например, «Буклеты»'; return; }
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount)) { err.textContent = 'Введите сумму, например 11815 или 493.50'; return; }
        if (!from || !to) { err.textContent = kind === 'spend' ? 'Укажите период' : 'Укажите дату'; return; }
        if (to < from) { err.textContent = 'Дата «по» раньше даты «с»'; return; }
        btn.disabled = true; btn.textContent = 'Сохраняем…';
        w.fetch(api + '/site-analytics/spend', {
          method: 'POST', headers: head,
          body: JSON.stringify({
            title: title,
            channel: d.getElementById('ad-ch').value || null,
            kind: kind,
            currency: d.getElementById('ad-cur').value,
            period_start: from, period_end: to, amount: amount,
          }),
        }).then(function (r) {
          btn.disabled = false; btn.textContent = 'Внести';
          if (!r.ok) {
            err.textContent = r.status === 503
              ? 'Не удалось получить курс валюты — попробуйте позже'
              : 'Не удалось сохранить, проверьте поля';
            return;
          }
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
