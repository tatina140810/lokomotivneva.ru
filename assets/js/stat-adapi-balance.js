/* Почасовой остаток счёта Директа рядом с ручными замерами (Тати 2026-10-09).
   С 2026-10-09 замеры в расчёте: последний замер суток — остаток на конец дня; ручной
   замер в те же сутки показывается рядом для сверки. Скачок остатка без внесённого пополнения останавливает замеры — здесь его
   видно красным, и здесь же замеры продолжаются: «Пополнение внесено — проверить»
   (сервер ищет его сам) или «Разобрано, продолжить» (если пополнения не было). */
(function (w, d) {
  'use strict';
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var STATUS = {
    first: 'первый замер', ok: '', refund: 'возврат',
    topup: 'пополнение (авто — уточнить по счёту)', jump: 'скачок!', drop: 'падение!',
  };
  var SHOW = 24;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function r2(v) { return v == null ? '—' : nf2.format(Number(v)); }
  function signed(v) { return v == null ? '' : (v > 0 ? '+' : '') + nf2.format(v); }
  function when(iso, day) {
    if (!iso) return day ? day.split('-').reverse().join('.') + ', время не указано' : '—';
    var t = new Date(iso);
    return t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' }) + ' '
      + t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  }

  w.adApiBalance = {
    html: function (s) {
      var bw = s.balanceWatch;
      if (!bw) return '';
      var rows = bw.snapshots.slice(0, SHOW).map(function (b) {
        return { at: b.at, src: 'API', net: b.net, vat: b.withVat, delta: b.deltaNet, status: b.status };
      });
      // Ручные замеры — в той же ленте, чтобы сверять глазами.
      bw.manual.forEach(function (m) {
        rows.push({ at: m.at, day: m.day, src: 'вручную', net: m.net, vat: m.withVat,
          delta: null, status: m.ignored ? 'сомнительный' : '' });
      });
      rows.sort(function (a, b) {
        var ta = a.at ? Date.parse(a.at) : Date.parse(a.day + 'T12:00:00+03:00');
        var tb = b.at ? Date.parse(b.at) : Date.parse(b.day + 'T12:00:00+03:00');
        return tb - ta;
      });
      var alert = bw.paused
        ? '<div class="apibal__alert"><b>Замеры остановлены.</b> ' + esc(bw.alert || '')
          + '<div class="apiacc__row"><button type="button" class="bar__btn" id="bal-check">Пополнение внесено — проверить</button>'
          + '<button type="button" class="bar__btn" id="bal-force">Разобрано, продолжить</button></div>'
          + '<p class="apierr" id="bal-err"></p></div>'
        : '';
      return '<div class="apibal"><h4>Остаток счёта по часам <span class="t-sub">— в расчёт идёт последний замер суток; '
        + 'ручной замер в те же сутки только для сверки</span></h4>'
        + alert
        + (rows.length ? '<div class="scrollx"><table><thead><tr><th>Время, МСК</th><th>Откуда</th>'
          + '<th>Без НДС</th><th>С НДС</th><th>За час</th><th></th></tr></thead><tbody>'
          + rows.map(function (r) {
            var bad = r.status === 'jump' || r.status === 'drop';
            return '<tr' + (r.src === 'вручную' ? ' class="apibal__manual"' : '') + '><td>' + esc(when(r.at, r.day)) + '</td>'
              + '<td>' + r.src + '</td><td>' + r2(r.net) + '</td><td>' + r2(r.vat) + '</td>'
              + '<td>' + signed(r.delta) + '</td>'
              + '<td' + (bad ? ' class="apierr"' : ' class="t-sub"') + '>' + esc(STATUS[r.status] != null ? STATUS[r.status] : r.status) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<p class="t-sub">Первый замер появится в течение часа.</p>')
        + '</div>';
    },

    bind: function (opts) {
      function go(force) {
        var err = d.getElementById('bal-err');
        w.fetch(opts.api + '/site-analytics/ad-api/balance/resume', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: force }),
        }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Сервер не ответил (' + r.status + ').')); })
          .then(function (j) {
            if (j.resumed) return opts.onChange();
            err.textContent = 'Пополнение с подходящей суммой не найдено. Внесите его в поля выше '
              + '(дата и время зачисления) и проверьте снова — или нажмите «Разобрано», если его не было.';
          })
          .catch(function (e) { err.textContent = e.message; });
      }
      var a = d.getElementById('bal-check');
      var b = d.getElementById('bal-force');
      if (a) a.addEventListener('click', function () { go(false); });
      if (b) b.addEventListener('click', function () { go(true); });
    },
  };
})(window, document);
