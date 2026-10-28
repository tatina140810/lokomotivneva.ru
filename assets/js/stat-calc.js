/* Расчёты в калькуляторе (Тати 2026-10-28): блок на /stat/, свёрнут по умолчанию и
   раскрывается кнопкой в шапке «Что смотрят». Данные грузятся только при раскрытии —
   GET /api/site-analytics/calc за тот же период, что и вся страница.

   Два счёта расчётов: «расчётов» — каждый новый итог (сменили сумму, валюту или
   направление), «просмотров с расчётом» — один раз за просмотр страницы, как цель
   calc_submit в Метрике. Точных сумм нет — только диапазоны. */
(function (w) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU');
  function num(v) { return nf.format(Math.round(Number(v) || 0)); }
  function pct(v) { return (Math.round(Number(v) * 10) / 10).toString().replace('.', ',') + '%'; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function when(iso) {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).replace(',', ' в');
  }
  function day(s) { var p = String(s).split('-'); return p[2] + '.' + p[1]; }

  function table(head, rows, empty) {
    if (!rows.length) return '<p class="empty">' + empty + '</p>';
    return '<table><thead><tr>' + head + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }
  function tile(label, value, hint) {
    return '<div class="tile"><div class="tile__label">' + label + '</div><div class="tile__value">' + value
      + '</div><div class="tile__hint">' + hint + '</div></div>';
  }
  /* Ступень воронки: полоса показывает долю от первой ступени. */
  function step(label, value, base, note) {
    var wd = base > 0 ? Math.max(2, Math.round((value / base) * 100)) : 0;
    return '<div class="funnel__step"><div class="funnel__label">' + label + '</div>'
      + '<div class="funnel__bar"><span style="width:' + (value ? wd : 0) + '%"></span></div>'
      + '<div class="funnel__num"><b>' + num(value) + '</b>' + (note ? ' <span class="t-sub">' + note + '</span>' : '') + '</div></div>';
  }
  function split(title, rows) {
    return '<div><h3 class="calc__h3">' + title + '</h3>' + table('<th>' + title + '</th><th>Расчётов</th><th>Людей</th>',
      rows.map(function (r) {
        return '<tr><td>' + esc(r.label) + '</td><td>' + num(r.calcs) + '</td><td>' + num(r.visitors) + '</td></tr>';
      }), 'Нет данных.') + '</div>';
  }

  function draw(host, x) {
    if (!x.totals) {
      host.innerHTML = '<p class="empty">' + (x.calcSince
        ? 'За этот период расчётов не было. Расчёты собираем с ' + esc(when(x.calcSince)) + ' МСК.'
        : 'Расчётов пока не было: счёт начнётся с первого расчёта на сайте после обновления.') + '</p>';
      return;
    }
    var t = x.totals, f = x.funnel;
    var html = '<p class="t-sub" style="margin:0 0 14px">Расчёты собираем с ' + esc(when(x.calcSince)) + ' МСК'
      + (x.periodClipped ? ' — за более ранний период данных нет, воронка считается с этого момента' : '') + '.</p>';

    html += '<div class="tiles">'
      + tile('Расчётов', num(t.calcs), 'каждый новый итог: сменили сумму, валюту или направление')
      + tile('Просмотров с расчётом', num(t.viewsWithCalc), 'один раз за просмотр страницы, как в Метрике')
      + tile('Людей посчитали', num(t.visitors), 'разные посетители')
      + tile('Доля посчитавших', pct(f.calcRate), 'от всех посетителей за период')
      + '</div>';

    html += '<h3 class="calc__h3">Воронка</h3><div class="funnel">'
      + step('Зашли на сайт', f.visitors, f.visitors)
      + step('Посчитали в калькуляторе', f.calcVisitors, f.visitors, pct(f.calcRate) + ' от зашедших')
      + step('Оставили заявку после расчёта', f.calcLeadVisitors, f.visitors, pct(f.calcLeadRate) + ' от посчитавших')
      + '</div><p class="t-sub" style="margin:6px 0 18px">Всего заявку оставили ' + num(f.leadVisitors)
      + ' чел., из них без расчёта — ' + num(Math.max(0, f.leadVisitors - f.calcLeadVisitors))
      + '. Звонки сюда не входят: номер не связан с посетителем сайта.</p>';

    html += '<h3 class="calc__h3">По каналам</h3>' + table(
      '<th>Канал</th><th>Людей</th><th>Посчитали</th><th>Доля</th><th>Расчётов</th><th>Заявка после расчёта</th>',
      x.channels.map(function (c) {
        return '<tr' + (c.calcVisitors ? '' : ' class="t-zero"') + '><td>' + esc(c.label) + '</td><td>' + num(c.visitors) + '</td>'
          + '<td>' + num(c.calcVisitors) + '</td><td>' + pct(c.calcRate) + '</td><td>' + num(c.calcs) + '</td>'
          + '<td>' + num(c.calcLeadVisitors) + '</td></tr>';
      }), 'Нет визитов за период.');

    html += '<div class="calc__grid">' + split('Направление', x.routes) + split('Валюта', x.currencies)
      + split('Сумма', x.bands) + '</div>'
      + '<p class="t-sub" style="margin:6px 0 18px">Сумма — по долларовому эквиваленту, точные суммы не сохраняем.</p>';

    html += '<h3 class="calc__h3">По дням</h3>' + table(
      '<th>День</th><th>Расчётов</th><th>Просмотров с расчётом</th><th>Людей</th>',
      x.daily.map(function (r) {
        return '<tr><td>' + day(r.day) + '</td><td>' + num(r.calcs) + '</td><td>' + num(r.viewsWithCalc) + '</td><td>' + num(r.visitors) + '</td></tr>';
      }), 'Нет данных.');

    host.innerHTML = html;
  }

  w.renderCalcBox = function (host, opts) {
    if (!host) return;
    host.innerHTML = '<p class="loading">Загружаем расчёты…</p>';
    w.fetch(opts.api + '/site-analytics/calc?from=' + encodeURIComponent(opts.from) + '&to=' + encodeURIComponent(opts.to),
      { headers: { Authorization: 'Bearer ' + opts.token } })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (x) { draw(host, x); })
      .catch(function () {
        host.innerHTML = '<p class="empty">Не удалось получить расчёты. Обновите страницу.</p>';
      });
  };
})(window);
