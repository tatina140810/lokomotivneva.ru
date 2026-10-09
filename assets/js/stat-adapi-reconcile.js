/* Сверка пополнений Директа с выгрузкой счетов (Тати 2026-10-09) — раз в месяц.
   Автопополнения создаются по росту остатка (рост × 1,22, до 100 ₽) и помечены
   «авто, уточнить по счёту». Здесь вставляют выгрузку счетов за месяц — строки «дата
   сумма» в любом виде (из Excel, CSV) — и видят расхождения. Данные сверка не меняет.
   Напоминание горит, пока за прошедший месяц есть автопополнения и он не отмечен
   сверенным. */
(function (w, d) {
  'use strict';
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август',
    'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var LABEL = {
    match: ['совпало', ''], differs: ['сумма отличается', 'apierr'],
    no_topup: ['счёт есть, пополнения нет', 'apierr'], no_invoice: ['пополнение без счёта', 'apierr'],
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rubC(c) { return c == null ? '—' : nf2.format(c / 100) + ' ₽'; }
  function dmy(s) { return s ? s.split('-').reverse().join('.') : '—'; }
  function monthName(m) { var p = m.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function thisMonth() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7); }

  // Прошедшие месяцы с автопополнениями, которые ещё не сверены.
  function pending(rc) {
    var cur = thisMonth();
    return (rc.autoByMonth || []).filter(function (a) {
      return a.month < cur && (!rc.reconciledMonth || a.month > rc.reconciledMonth);
    });
  }

  w.adApiReconcile = {
    html: function (s) {
      var rc = s.reconcile;
      if (!rc) return '';
      var due = pending(rc);
      var prev = new Date(Date.now() + 3 * 3600e3);
      prev.setUTCDate(1); prev.setUTCMonth(prev.getUTCMonth() - 1);
      var defMonth = due.length ? due[0].month : prev.toISOString().slice(0, 7);
      return '<div class="apibal"><h4>Сверка пополнений со счетами <span class="t-sub">— раз в месяц</span></h4>'
        + due.map(function (a) {
          return '<p class="apiwarn">Сверьте ' + monthName(a.month) + ': автопополнений ' + a.count
            + ' на ' + nf2.format(a.total) + ' ₽ — суммы примерные, уточните по счетам.</p>';
        }).join('')
        + '<div class="apiacc__row"><label>Месяц<input type="month" id="rc-month" value="' + defMonth + '"></label></div>'
        + '<textarea id="rc-text" rows="4" class="rc__text" placeholder="Выгрузка счетов: в каждой строке дата и сумма с НДС, например&#10;03.09.2026  6 771,00&#10;24.09.2026  18 300,00"></textarea>'
        + '<div class="apiacc__row"><button type="button" class="bar__btn" id="rc-go">Сверить</button>'
        + '<button type="button" class="bar__btn" id="rc-done" hidden>Отметить месяц сверенным</button></div>'
        + '<p class="apierr" id="rc-err"></p><div id="rc-out"></div></div>';
    },

    bind: function (opts) {
      var go = d.getElementById('rc-go');
      if (!go) return;
      var err = d.getElementById('rc-err');
      var out = d.getElementById('rc-out');
      var done = d.getElementById('rc-done');
      var head = { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' };

      go.addEventListener('click', function () {
        err.textContent = '';
        var month = d.getElementById('rc-month').value;
        w.fetch(opts.api + '/site-analytics/ad-api/reconcile', {
          method: 'POST', headers: head,
          body: JSON.stringify({ month: month, text: d.getElementById('rc-text').value }),
        }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Сервер не ответил (' + r.status + ').')); })
          .then(function (j) {
            var bad = j.rows.filter(function (r) { return r.status !== 'match'; }).length;
            out.innerHTML = '<p class="t-sub">Счетов за ' + monthName(j.month) + ': ' + j.invoices
              + (j.otherMonth ? ', из другого месяца пропущено: ' + j.otherMonth : '')
              + (j.unparsed.length ? '. Не разобраны строки: ' + j.unparsed.map(esc).join(' · ') : '')
              + '. Расхождений: <b>' + bad + '</b>.</p>'
              + (j.rows.length ? '<div class="scrollx"><table><thead><tr><th>Итог</th><th>Счёт</th><th>Сумма счёта</th>'
                + '<th>Пополнение</th><th>Сумма</th><th>Разница</th></tr></thead><tbody>'
                + j.rows.map(function (r) {
                  var l = LABEL[r.status];
                  return '<tr><td class="' + l[1] + '">' + l[0] + '</td><td>' + dmy(r.invoiceDay) + '</td>'
                    + '<td>' + rubC(r.invoiceC) + '</td><td>' + dmy(r.topupDay) + (r.auto ? ' <span class="t-sub">авто</span>' : '') + '</td>'
                    + '<td>' + rubC(r.topupC) + '</td><td>' + (r.diffC ? rubC(r.diffC) : '') + '</td></tr>';
                }).join('') + '</tbody></table></div>' : '');
            done.hidden = false;
            done.dataset.month = j.month;
          })
          .catch(function (e) { err.textContent = e.message; });
      });

      done.addEventListener('click', function () {
        w.fetch(opts.api + '/site-analytics/ad-api/reconciled', {
          method: 'PUT', headers: head, body: JSON.stringify({ month: done.dataset.month }),
        }).then(function (r) { return r.ok ? opts.onChange() : Promise.reject(new Error('Не сохранилось (' + r.status + ').')); })
          .catch(function (e) { err.textContent = e.message; });
      });
    },
  };
})(window, document);
