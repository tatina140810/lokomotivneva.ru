/* Реклама по месяцам (Тати 2026-10-08): сколько потратили на каждую статью, сколько
   людей она привела, сколько обращений и почём обошлось одно обращение.
   Данные — GET /api/site-analytics/ads-monthly (месяц считается тем же отчётом, что
   страница за период, границы месяца — по Москве). */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август',
    'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function rub(v) { return v == null || v === '' || Number(v) === 0 ? '—' : nf.format(Number(v)) + ' ₽'; }
  function cnt(v) { return v == null ? '—' : nf.format(Number(v)); }
  function eff(v) {
    if (v == null) return '—';
    var color = v >= 100 ? 'var(--good, #2E9E44)' : 'var(--bad, #C0392B)';
    return '<span style="color:' + color + '">' + (v >= 200 ? '×' + (v / 100).toFixed(1).replace('.', ',') : v + ' %') + '</span>';
  }
  function title(m) {
    var p = String(m.month).split('-');
    return MONTHS[Number(p[1]) - 1] + ' ' + p[0] + (m.partial ? ' (идёт)' : '');
  }

  function draw(host, months) {
    if (!months.length) { host.innerHTML = ''; return; }
    var body = months.map(function (m) {
      var rows = m.rows.map(function (r) {
        var spent = r.noSpend ? '<span style="color:var(--bad, #C0392B)">не внесён</span>' : rub(r.spent);
        return '<tr><td style="padding-left:18px">' + esc(r.title) + '</td><td>' + spent + '</td>'
          + '<td>' + cnt(r.visits) + '</td><td>' + rub(r.costPerVisit) + '</td>'
          + '<td>' + cnt(r.leads) + '</td><td>' + rub(r.costPerLead) + '</td><td>' + eff(r.efficiency) + '</td></tr>';
      }).join('');
      var t = m.total;
      return '<tr style="background:var(--bg-2, #F3F4F6);font-weight:600"><td>' + esc(title(m)) + '</td>'
        + '<td>' + rub(t.spent) + '</td><td>' + cnt(t.adVisits) + '</td>'
        + '<td>' + rub(t.adVisits ? t.spent / t.adVisits : null) + '</td>'
        + '<td>' + cnt(t.adLeads) + '</td><td>' + rub(t.costPerAdLead) + '</td><td></td></tr>'
        + rows
        + '<tr><td style="padding-left:18px;color:var(--ink-2)" colspan="7">Все обращения за месяц (заявки с сайта + звонки): <b>'
        + cnt(t.contacts) + '</b>' + (t.costPerContact ? ' · цена обращения с учётом всей рекламы <b>' + rub(t.costPerContact) + '</b>' : '')
        + '</td></tr>';
    }).join('');
    host.innerHTML = '<h3 class="adsh3">Реклама по месяцам</h3>'
      + '<table class="budget"><thead><tr><th>Месяц / статья</th><th>Потрачено</th><th>Переходов</th>'
      + '<th>Цена перехода</th><th>Заявок с сайта</th><th>Цена заявки</th><th>Эффективность</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table>'
      + '<p class="t-sub" style="margin:10px 0 0">«Потрачено» — расход статьи внутри месяца (между замерами '
      + 'остатка — точно, из записи за длинный период — доля по дням). «Эффективность» — цена перехода статьи '
      + 'против средней по всей рекламе месяца: больше 100 % — переходы дешевле среднего. Звонки метку не несут, '
      + 'поэтому по статьям не разносятся — они входят в общую цену обращения месяца.</p>';
  }

  w.renderAdsMonthly = function (host, opts) {
    if (!host) return;
    host.innerHTML = '<p class="t-sub">Загружаем рекламу по месяцам…</p>';
    w.fetch(opts.api + '/site-analytics/ads-monthly?months=6', { headers: { Authorization: 'Bearer ' + opts.token } })
      .then(function (r) { return r.ok ? r.json() : { months: [] }; })
      .then(function (res) { draw(host, res.months || []); })
      .catch(function () { host.innerHTML = ''; });
  };
})(window, document);
