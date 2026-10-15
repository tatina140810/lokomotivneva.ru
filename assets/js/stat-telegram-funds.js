/* Журнал денег Telegram (Тати 2026-10-13): оплаты eLama в ₽, переводы в € на рекламный
   аккаунт Telegram Ads, контрольные остатки из кабинета. Курс переводов считает сервер
   из журнала; здесь можно внести только точный курс перевода по счёту eLama.
   Данные — telegram.journal в /api/site-analytics/summary, запись — /telegram-funds. */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('ru-RU');
  var PROV = 'предварительный курс, уточнить по счетам eLama';
  var ERR = {
    bad_day: 'укажите дату', bad_time: 'неверное время', bad_amount: 'неверная сумма',
    bad_rate: 'неверный курс', bad_kind: 'выберите вид записи', not_found: 'запись не найдена',
  };
  function rub(v) { return v == null ? '—' : nf0.format(Math.round(Number(v))) + ' ₽'; }
  function rub2(v) { return v == null ? '—' : nf.format(Number(v)) + ' ₽'; }
  function eur(v) { return v == null ? '—' : nf.format(Number(v)) + ' €'; }
  function rate(v) { return v == null ? '—' : nf.format(Math.round(Number(v) * 100) / 100); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dmy(iso) { if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function utc(at) { return at ? ' ' + new Date(at).toISOString().slice(11, 16) + ' UTC' : ''; }
  var SRC = { exact: 'точный, по счёту', tranche: 'по оплатам партии', previous: 'как у предыдущего перевода' };

  function del(e) {
    return '<button type="button" class="tgdel" data-del="' + e.id + '" title="Убрать из журнала">×</button>';
  }

  /* Подпись «У eLama, не переведено»: последняя сверка с кабинетом eLama совпала (±1 ₽) —
     «по кабинету eLama, дата»; не совпала — оценка и цифра кабинета рядом; сверок нет — «оценка».
     Сама сумма — по-прежнему расчёт «оплачено − переведено» (Тати 2026-10-15). */
  w.telegramElamaNote = function (j) {
    var last = (j.elamaChecks || []).slice(-1)[0];
    if (!last) return 'оценка';
    var dm = dmy(last.day).slice(0, 5);
    return last.warn ? 'оценка; в кабинете eLama ' + dm + ' — ' + rub(last.rub) : 'по кабинету eLama, ' + dm;
  };

  w.renderTelegramFunds = function (j) {
    var badge = j.provisional ? ' <span class="tgprov">' + PROV + '</span>' : '';
    var html = '<h3 class="adsh3">Оплаты eLama и переводы в кабинет</h3>'
      + '<p class="apiacc__line">Оплачено eLama: <b>' + rub(j.paidRub) + '</b>'
      + ' <span class="t-sub">— бюджет Telegram в сводной таблице</span></p>'
      + '<p class="apiacc__line">Переведено в Telegram Ads: <b>' + eur(j.transferredEur) + ' = ' + rub(j.transferredRub) + '</b>' + badge + '</p>'
      + '<p class="apiacc__line">У eLama в рублях, не переведено (' + esc(w.telegramElamaNote(j)) + '): <b>' + rub(j.unallocatedRub) + '</b>'
      + ' <span class="t-sub">— это не расход</span></p>'
      + '<p class="apiacc__line">Расход по CSV: <b>' + eur(j.spentEur) + ' = ' + rub(j.spentRub) + '</b>'
      + ' <span class="t-sub">— € по курсу переводов, по очереди: сначала первый перевод</span></p>'
      + '<p class="apiacc__line">Остаток: <b>' + rub(j.paidRub) + ' − ' + rub(j.spentRub) + ' = ' + rub(j.remainingRub) + '</b>'
      + ' <span class="t-sub">— вместе с оплатами, которые ещё у eLama</span></p>'
      + '<p class="apiacc__line">В кабинете Telegram Ads должно быть (расчёт): <b>' + eur(j.cabinetEur) + '</b>'
      + ' <span class="t-sub">— переведено минус расход по CSV</span></p>'
      + (j.overEur ? '<p class="apiwarn">По CSV потрачено на ' + eur(j.overEur) + ' больше, чем переведено: проверьте журнал переводов.</p>' : '')
      + (j.unpriced ? '<p class="apiwarn">У части переводов нет курса: внесите оплаты той же партии или точный курс.</p>' : '');

    html += '<table class="tbl tgfunds"><thead><tr><th>Оплата eLama</th><th>Сумма</th><th>Партия</th><th>Пометка</th><th></th></tr></thead><tbody>'
      + (j.payments.length ? j.payments.map(function (p) {
        return '<tr><td>' + dmy(p.day) + '</td><td>' + rub(p.rub) + '</td><td>' + esc(p.tranche || '—') + '</td><td class="t-sub">'
          + esc(p.note || '') + '</td><td>' + del(p) + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="t-sub">оплат нет</td></tr>') + '</tbody></table>';

    html += '<table class="tbl tgfunds"><thead><tr><th>Перевод в Telegram Ads</th><th>€</th><th>Курс</th><th>₽</th><th>Точный курс по счёту</th><th></th></tr></thead><tbody>'
      + (j.transfers.length ? j.transfers.map(function (t) {
        return '<tr><td>' + dmy(t.day) + utc(t.at) + (t.tranche ? ' <span class="t-sub">· партия ' + esc(t.tranche) + '</span>' : '') + '</td><td>'
          + eur(t.eur) + '</td><td>' + rate(t.rate) + ' <span class="t-sub">' + (SRC[t.source] || 'нет') + (t.provisional ? ', предварительный' : '')
          + '</span></td><td>' + rub(t.rub) + '</td><td><input type="text" class="tgrate" inputmode="decimal" data-rate="' + t.id + '" value="'
          + (t.source === 'exact' ? esc(t.rate) : '') + '" placeholder="₽ за 1 €"><button type="button" class="bar__btn" data-rate-save="' + t.id
          + '">Сохранить</button></td><td>' + del(t) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="t-sub">переводов нет</td></tr>') + '</tbody></table>';

    html += '<table class="tbl tgfunds"><thead><tr><th>Контрольный остаток</th><th>В кабинете</th><th>По расчёту</th><th>Разница</th><th>Пометка</th><th></th></tr></thead><tbody>'
      + (j.checks.length ? j.checks.map(function (c) {
        return '<tr><td>' + dmy(c.day) + utc(c.at) + '</td><td>' + eur(c.eur) + '</td><td>' + eur(c.expectedEur) + '</td><td'
          + (c.warn ? ' class="apierr"' : '') + '>' + (c.diffEur > 0 ? '+' : '') + eur(c.diffEur) + (c.warn ? ' — больше 1 €, проверьте CSV и переводы' : '')
          + '</td><td class="t-sub">' + esc(c.note || '') + '</td><td>' + del(c) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="t-sub">контрольных остатков нет</td></tr>') + '</tbody></table>';

    if ((j.elamaChecks || []).length) {
      html += '<table class="tbl tgfunds"><thead><tr><th>Остаток в кабинете eLama</th><th>В кабинете</th><th>По расчёту</th><th>Разница</th><th>Пометка</th><th></th></tr></thead><tbody>'
        + j.elamaChecks.map(function (c) {
          return '<tr><td>' + dmy(c.day) + utc(c.at) + '</td><td>' + rub2(c.rub) + '</td><td>' + rub2(c.expectedRub) + '</td><td'
            + (c.warn ? ' class="apierr"' : '') + '>' + (c.diffRub > 0 ? '+' : '') + rub2(c.diffRub) + (c.warn ? ' — больше 1 ₽, проверьте оплаты и переводы' : '')
            + '</td><td class="t-sub">' + esc(c.note || '') + '</td><td>' + del(c) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    if (j.excluded && j.excluded.length) {
      html += '<p class="t-sub">Исключено из расчёта: ' + j.excluded.map(function (x) {
        return dmy(x.day) + ' ' + (x.kind === 'balance' ? 'замер ' : 'пополнение ') + nf.format(x.amount) + ' ' + (x.currency === 'EUR' ? '€' : '₽')
          + ' — ' + esc(x.reason);
      }).join('; ') + '</p>';
    }

    html += '<div class="apiacc__row tgadd"><select id="tgf-kind"><option value="payment">Оплата eLama, ₽</option>'
      + '<option value="transfer">Перевод в Telegram Ads, €</option><option value="check">Контрольный остаток из кабинета, €</option>'
      + '<option value="elama">Остаток в кабинете eLama, ₽</option></select>'
      + '<input type="date" id="tgf-day"><input type="time" id="tgf-time" title="Время по Бишкеку, необязательно">'
      + '<input type="text" id="tgf-amount" inputmode="decimal" placeholder="Сумма">'
      + '<input type="text" id="tgf-tranche" maxlength="40" placeholder="Партия">'
      + '<input type="text" id="tgf-note" maxlength="500" placeholder="Пометка">'
      + '<button type="button" class="bar__btn tgsave" id="tgf-add">Добавить</button></div>'
      + '<p class="t-sub">Партия связывает оплаты с переводом: их курс = сумма оплат ÷ сумма переводов. '
      + 'Перевод без партии берёт курс предыдущего. Контрольный остаток — свободный бюджет плюс остатки на объявлениях; время — по Бишкеку.</p>'
      + '<p class="apierr" id="tgf-err"></p>';
    return html;
  };

  w.bindTelegramFunds = function (host, opts) {
    if (!host) return;
    var err = d.getElementById('tgf-err');
    function call(method, path, body) {
      err.textContent = '';
      return w.fetch(opts.api + '/site-analytics/telegram-funds' + path, {
        method: method,
        headers: { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (x) {
          if (!r.ok) throw new Error(ERR[x.error] || 'Не получилось (' + r.status + ')');
          if (opts.onChange) opts.onChange();
        });
      }).catch(function (x) { err.textContent = x.message; });
    }
    var kind = d.getElementById('tgf-kind');
    var tranche = d.getElementById('tgf-tranche');
    kind.addEventListener('change', function () { tranche.hidden = kind.value === 'check' || kind.value === 'elama'; });
    d.getElementById('tgf-add').addEventListener('click', function () {
      var day = d.getElementById('tgf-day').value;
      var time = d.getElementById('tgf-time').value;
      var amount = d.getElementById('tgf-amount').value.replace(/\s/g, '').replace(',', '.');
      var body = { kind: kind.value, day: day, note: d.getElementById('tgf-note').value,
        at: day && time ? day + 'T' + time + ':00+06:00' : null };
      body[kind.value === 'payment' || kind.value === 'elama' ? 'amount_rub' : 'amount_eur'] = amount;
      if (kind.value === 'payment' || kind.value === 'transfer') body.tranche = tranche.value;
      call('POST', '', body);
    });
    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.dataset.del && w.confirm('Убрать запись из журнала?')) call('DELETE', '/' + t.dataset.del);
      if (t.dataset.rateSave) {
        var inp = host.querySelector('[data-rate="' + t.dataset.rateSave + '"]');
        call('PATCH', '/' + t.dataset.rateSave, { rate: inp.value.replace(/\s/g, '').replace(',', '.') || null });
      }
    });
  };
})(window, document);
