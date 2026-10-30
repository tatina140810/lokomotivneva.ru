/* Сводная строка над карточкой кабинета (Тати 2026-10-30): остаток, расход за сегодня,
   последнее пополнение или замер, статус сверки — чтобы главное было видно без прокрутки.
   Только показ: всё берётся из того же отчёта /site-analytics/summary. Расход за сегодня,
   если выбран другой период, — тот же отчёт за сегодняшние сутки по Москве, один запрос
   на перерисовку; расчёты и API не меняются. */
(function (w, d) {
  'use strict';
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var MSK = '+03:00';
  function rub2(v) { return v == null ? '—' : nf2.format(Number(v)) + ' ₽'; }
  function sign(v) { return (Number(v) > 0 ? '+' : '') + nf2.format(Number(v)) + ' ₽'; }
  function dmy(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('.') : ''; }
  function at(iso) {
    if (!iso) return '';
    var t = new Date(iso);
    return t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' }) + ' '
      + t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  }
  function localDay(t) { return t.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' }); }
  function sub(text) { return '<span class="t-sub">' + text + '</span>'; }
  function item(k, v, cls) {
    return '<div class="apisum__it"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>';
  }
  function latest(list) {
    return list.filter(Boolean).sort(function (a, b) { return b.t - a.t; })[0];
  }

  function isToday(summary) {
    var p = summary && summary.period && summary.period.days;
    var t = localDay(new Date());
    return Boolean(p && p.from === t && p.to === t);
  }
  // Директ — весь расход счёта (кампании + «Мастер»), с НДС; VK — с НДС и как в кабинете.
  function spendText(s) {
    if (s.source === 'vk_ads') return rub2(s.cost) + ' с НДС' + sub('в кабинете без НДС: ' + rub2(s.costNet));
    return rub2(s.totalCost != null ? s.totalCost : s.cost) + ' с НДС';
  }

  function direct(s, summary) {
    var bw = s.balanceWatch || { snapshots: [], manual: [] };
    var snap = bw.snapshots[0];
    var row = (summary.budgetTable || []).filter(function (r) { return r.channel === s.channel; })[0];
    var bal = snap
      ? rub2(snap.net) + ' без НДС' + sub(rub2(snap.withVat) + ' с НДС, на ' + at(snap.at))
      : row && row.balanceDate ? rub2(row.remaining) + ' с НДС' + sub('по замеру ' + dmy(row.balanceDate)) : '—';
    var top = bw.snapshots.filter(function (b) { return b.status === 'topup'; })[0];
    var man = bw.manual[0];
    var last = latest([
      top && { t: Date.parse(top.at), text: 'пополнение +' + rub2(top.deltaNet) + sub('без НДС, ' + at(top.at)) },
      man && { t: man.at ? Date.parse(man.at) : Date.parse(man.day + 'T12:00:00' + MSK),
        text: 'замер ' + rub2(man.withVat) + sub('с НДС, ' + (man.at ? at(man.at) : dmy(man.day))) },
    ]);
    var due = w.adApiReconcile && w.adApiReconcile.dueMonths ? w.adApiReconcile.dueMonths(s.reconcile) : [];
    var rc = s.reconcile || {};
    var status = bw.paused ? ['замеры остановлены' + sub('разобрать в таблице ниже'), 'apisum__bad']
      : due.length ? ['сверить со счетами' + sub(due.join(', ')), 'apisum__warn']
        : rc.reconciledMonth ? ['сверено' + sub('последний сверенный месяц — ' + w.adApiReconcile.monthName(rc.reconciledMonth)), '']
          : ['сверять пока нечего', ''];
    return [bal, last ? last.text : '—', status];
  }

  function vk(s) {
    var v = s.vkFunds || {};
    var api = v.apiBalance;
    var bal = api
      ? rub2(api.total) + ' без НДС' + sub('≈ ' + rub2(Math.round(api.total * 122) / 100) + ' с НДС; свои + бонус, на ' + at(api.at))
      : '—';
    var e = v.estimate || {};
    var top = (v.autoTopups || [])[0];
    var last = latest([
      top && { t: Date.parse(top.at), text: 'пополнение ' + rub2(top.credited) + sub((top.funds === 'bonus' ? 'бонус' : 'свои') + ', ' + at(top.at)) },
      e.lastManualAt && { t: Date.parse(e.lastManualAt), text: 'ручной замер' + sub(at(e.lastManualAt)) },
    ]);
    var c = e.lastCheck;
    var wait = (v.autoTopups || []).filter(function (t) { return t.funds === 'own' && !t.answered; }).length;
    var status = v.paused ? ['замеры на паузе' + sub('разобрать ниже'), 'apisum__bad']
      : e.remind ? ['нужен замер' + sub('ручного замера не было больше месяца'), 'apisum__warn']
        : c && c.warn ? ['расхождение больше 50 ₽' + sub('свои ' + sign(c.ownDiff) + ', бонус ' + sign(c.bonusDiff)), 'apisum__warn']
          : c ? ['совпало' + sub('свои ' + sign(c.ownDiff) + ', бонус ' + sign(c.bonusDiff)), '']
            : e.lastManualAt ? ['по замеру ' + at(e.lastManualAt), ''] : ['замеров ещё нет', 'apisum__warn'];
    if (wait) status = [status[0] + sub('ждут ответа «свои или бонус»: ' + wait), status[1] || 'apisum__warn'];
    return [bal, last ? last.text : '—', status];
  }

  w.adApiSum = {
    html: function (s, summary) {
      var p = s.source === 'yandex_direct' ? direct(s, summary) : s.source === 'vk_ads' ? vk(s) : null;
      if (!p) return '';
      var today = isToday(summary) ? spendText(s) : '<span data-today="' + s.source + '">загружаем…</span>';
      return '<div class="apisum">' + item('Остаток', p[0]) + item('Расход за сегодня', today)
        + item('Последнее пополнение или замер', p[1]) + item('Сверка', p[2][0], p[2][1]) + '</div>';
    },

    fill: function (host, opts) {
      var slots = host.querySelectorAll('[data-today]');
      if (!slots.length) return;
      var day = localDay(new Date());
      w.fetch(opts.api + '/site-analytics/summary?from=' + encodeURIComponent(new Date(day + 'T00:00:00' + MSK).toISOString())
        + '&to=' + encodeURIComponent(new Date().toISOString()) + '&days_from=' + day + '&days_to=' + day, {
        headers: { Authorization: 'Bearer ' + opts.token },
      }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); })
        .then(function (x) {
          var list = (x.adApi && x.adApi.sources) || [];
          [].forEach.call(slots, function (el) {
            var s = list.filter(function (it) { return it.source === el.getAttribute('data-today'); })[0];
            el.innerHTML = s ? spendText(s) : '—';
          });
        })
        .catch(function () {
          [].forEach.call(slots, function (el) { el.innerHTML = '—' + sub('не загрузилось, обновите страницу'); });
        });
    },
  };
})(window, document);
