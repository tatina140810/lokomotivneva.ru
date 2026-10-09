/* Счёт Директа в карточке кабинета (Тати 2026-10-09): остаток и пополнения, из которых
   считается весь расход счёта. «Мастер кампаний» в API не попадает, поэтому его расход =
   изменение остатка + пополнения − расход кампаний из API.

   Общая база — суммы С НДС: API отдаёт расход с НДС, счета и остатки Директа у Тати
   тоже с НДС 22% (2026-10-09). Галочка «без НДС» — для редкой суммы без налога: сервер
   досчитает её до базы. Недельный бюджет — справка, в расчётах не участвует.
   Записи ложатся в общую таблицу расходов (/site-analytics/spend) статьёй «Яндекс.Директ». */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU');
  function rub(v) { return v == null ? '—' : nf.format(Math.round(Number(v))) + ' ₽'; }
  function dmy(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  function today() {
    // Дата по Москве: так ведёт сутки кабинет.
    return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  }

  w.adApiAccount = {
    // Только для канала, у которого расход счёта ведётся по остаткам (Директ).
    applies: function (s) { return s.source === 'yandex_direct'; },

    html: function (s, summary) {
      var row = (summary.budgetTable || []).filter(function (r) { return r.channel === s.channel; })[0];
      var last = row && row.balanceDate
        ? 'Последний замер: <b>' + rub(row.remaining) + '</b> на ' + dmy(row.balanceDate)
          + ' <span class="t-sub">(с НДС, с учётом пополнений после него)</span>'
        : 'Остаток на счёте ещё не вносили.';
      var budget = s.weeklyBudget != null
        ? 'Недельный бюджет: <b>' + rub(s.weeklyBudget) + '</b> <span class="t-sub">— справка, в расчётах не участвует</span>'
        : 'Недельный бюджет не задан';
      return '<div class="apiacc">'
        + '<p class="apiacc__line">' + last + '</p>'
        + '<p class="apiacc__line" id="acc-budget-view">' + budget
        + ' <button type="button" class="linkbtn" id="acc-budget-edit">изменить</button></p>'
        + '<div class="apiacc__row" id="acc-budget-form" hidden>'
        + '<input type="text" inputmode="decimal" id="acc-budget" value="' + (s.weeklyBudget != null ? s.weeklyBudget : '') + '" placeholder="11 325">'
        + '<button type="button" class="bar__btn" id="acc-budget-save">Сохранить</button></div>'
        + '<div class="apiacc__row">'
        + '<label>Что<select id="acc-kind"><option value="balance">Остаток на счёте</option>'
        + '<option value="topup">Пополнение</option></select></label>'
        + '<label>Дата<input type="date" id="acc-date" value="' + today() + '"></label>'
        + '<label>Сумма, ₽<input type="text" inputmode="decimal" id="acc-sum" placeholder="29 455"></label>'
        + '<label class="apiacc__chk"><input type="checkbox" id="acc-novat"> сумма без НДС</label>'
        + '<button type="button" class="bar__btn" id="acc-save">Внести</button></div>'
        + '<p class="apierr" id="acc-err"></p></div>';
    },

    bind: function (opts) {
      var err = d.getElementById('acc-err');
      if (!err) return;
      var head = { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' };
      function num(v) { return String(v || '').replace(/\s/g, '').replace(',', '.'); }
      function fail(r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error({ bad_amount: 'Сумма — число, до двух знаков после запятой.',
            bad_period: 'Укажите дату.' }[j.error] || 'Не сохранилось (' + r.status + ').');
        });
      }

      d.getElementById('acc-budget-edit').addEventListener('click', function () {
        d.getElementById('acc-budget-form').hidden = false;
        d.getElementById('acc-budget').focus();
      });
      d.getElementById('acc-budget-save').addEventListener('click', function () {
        w.fetch(opts.api + '/site-analytics/ad-api/yandex_direct/weekly-budget', {
          method: 'PUT', headers: head, body: JSON.stringify({ amount: num(d.getElementById('acc-budget').value) || null }),
        }).then(function (r) { return r.ok ? opts.onChange() : fail(r); })
          .catch(function (e) { err.textContent = e.message; });
      });

      d.getElementById('acc-save').addEventListener('click', function () {
        var sum = num(d.getElementById('acc-sum').value);
        var day = d.getElementById('acc-date').value;
        if (!sum) { err.textContent = 'Введите сумму.'; return; }
        var btn = d.getElementById('acc-save');
        btn.disabled = true;
        w.fetch(opts.api + '/site-analytics/spend', {
          method: 'POST', headers: head,
          body: JSON.stringify({
            channel: 'yandex_ads', title: 'Яндекс.Директ', kind: d.getElementById('acc-kind').value,
            period_start: day, period_end: day, amount: sum, currency: 'RUB',
            vat: d.getElementById('acc-novat').checked ? 'excl' : 'incl',
          }),
        }).then(function (r) { return r.ok ? opts.onChange() : fail(r); })
          .catch(function (e) { err.textContent = e.message; btn.disabled = false; });
      });
    },
  };
})(window, document);
