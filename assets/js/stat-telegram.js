/* Реклама в Telegram (Тати 2026-10-13): курс оплаты, расход по дням из CSV Telegram Ads,
   сверка с остатками и напоминание, если канал давно не обновляли. Данные — блок
   telegram в /api/site-analytics/summary; загрузка CSV — stat-telegram-csv.js.
   «Потрачено» в сводной таблице по-прежнему считается по остаткам: CSV только
   раскладывает его по дням, поэтому ничего не удваивается. */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('ru-RU');
  function rub(v) { return v == null ? '—' : nf0.format(Math.round(Number(v))) + ' ₽'; }
  function eur(v) { return v == null ? '—' : nf.format(Number(v)) + ' €'; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dmy(iso) { if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function dm(iso) { var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1]; }
  function daysWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'день';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
    return 'дней';
  }

  /* Столбики расхода по дням (₽ по курсу оплаты), подпись дня снизу, сумма — в подсказке. */
  function chart(daily) {
    if (!daily.length) return '<p class="t-sub">За период расхода из CSV нет — загрузите выгрузку Telegram Ads.</p>';
    var max = daily.reduce(function (m, x) { return Math.max(m, x.rub); }, 0) || 1;
    var W = 640, H = 140, pad = 18, bw = Math.max(4, Math.min(28, (W - 8) / daily.length - 4));
    var step = (W - 8) / daily.length;
    var every = Math.ceil(daily.length / 12);
    var bars = daily.map(function (x, i) {
      var h = Math.round((x.rub / max) * (H - pad - 14));
      var cx = 4 + i * step + (step - bw) / 2;
      return '<rect x="' + cx.toFixed(1) + '" y="' + (H - pad - h) + '" width="' + bw.toFixed(1) + '" height="' + h
        + '" rx="2" fill="var(--telegram)"><title>' + dmy(x.day) + ': ' + eur(x.eur) + ' = ' + rub(x.rub)
        + '; показы ' + nf0.format(x.impressions) + ', клики ' + nf0.format(x.clicks) + ', действия ' + nf0.format(x.actions)
        + '</title></rect>'
        + (i % every === 0 ? '<text x="' + (cx + bw / 2).toFixed(1) + '" y="' + (H - 4) + '" font-size="10" text-anchor="middle" fill="currentColor">'
          + dm(x.day) + '</text>' : '');
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tgchart" role="img" aria-label="Расход Telegram по дням">'
      + '<line x1="0" y1="' + (H - pad) + '" x2="' + W + '" y2="' + (H - pad) + '" stroke="var(--line)"/>' + bars + '</svg>';
  }

  function issuesHtml(list) {
    return (list || []).map(function (x) {
      return '<p class="apiwarn">CSV расходится с остатками за ' + dmy(x.from) + '–' + dmy(x.to) + ': по остаткам '
        + eur(x.balanceEur) + ', в CSV ' + eur(x.csvEur) + ' (разница ' + eur(x.diffEur) + '; CSV покрывает '
        + x.coveredDays + ' из ' + x.totalDays + ' ' + daysWord(x.totalDays) + '). Данные не правились — '
        + 'проверьте, все ли объявления загружены и внесены ли пополнения и замеры.</p>';
    }).join('');
  }

  function adsHtml(ads) {
    if (!ads.length) return '';
    return '<table class="tbl tgads"><thead><tr><th>Объявление</th><th>Дни</th><th>Расход, €</th><th>Расход, ₽</th><th>Загружено</th></tr></thead><tbody>'
      + ads.map(function (a) {
        return '<tr><td>' + esc(a.name) + '</td><td>' + dmy(a.from) + ' — ' + dmy(a.to) + ' (' + a.days + ')</td><td>'
          + eur(a.eur) + '</td><td>' + rub(a.rub) + '</td><td class="t-sub">'
          + (a.uploadedAt ? new Date(a.uploadedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  w.renderTelegramBox = function (host, opts) {
    var t = opts.summary && opts.summary.telegram;
    if (!host || !t) return;
    var html = '<div class="card" id="tg-card"><div class="card__head"><h2>Реклама в Telegram</h2>'
      + '<span class="card__note">' + (t.journal ? 'расход — из CSV Telegram Ads по курсу переводов; бюджет — оплаты eLama'
        : 'расход по дням — из CSV Telegram Ads; «потрачено» и остаток — по замерам в €') + '</span></div>';
    if (t.stale) {
      html += '<p class="tgremind">' + (t.staleDays == null ? 'Telegram ещё не обновлялся'
        : 'Telegram не обновлялся ' + t.staleDays + ' ' + daysWord(t.staleDays)) + ': загрузите CSV или внесите '
        + (t.journal ? 'контрольный остаток' : 'баланс') + '.</p>';
    }
    var j = t.journal;
    if (j) {
      html += '<p class="apiacc__line">Курс переводов: <b>' + (t.rate ? nf.format(Math.round(t.rate.rate * 100) / 100) + ' ₽ за 1 €' : '—') + '</b>'
        + (t.rate && t.rate.provisional ? ' <span class="tgprov">предварительный курс, уточнить по счетам eLama</span>' : '')
        + ' <span class="t-sub">— последняя загрузка CSV: '
        + (t.lastUpload ? new Date(t.lastUpload).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК' : 'не было') + '</span></p>'
        + (w.renderTelegramFunds ? w.renderTelegramFunds(j) : '');
    } else html += '<p class="apiacc__line">Курс оплаты: <b>' + (t.rate ? nf.format(t.rate.rate) + ' ₽ за 1 €' : '—') + '</b>'
      + (t.rate && t.rate.provisional ? ' <span class="tgprov">предварительный, уточнить по eLama</span>' : '')
      + (t.rate ? ' <span class="t-sub">— оплачено ' + rub(t.rate.paidRub) + ' ÷ зачислено ' + eur(t.rate.creditedEur)
        + '; в нём НДС и комиссия eLama</span>' : ' <span class="t-sub">— нет пополнений в €</span>') + '</p>'
      + '<p class="apiacc__line">Последний замер остатка: <b>' + (t.lastBalance ? eur(t.lastBalance.eur) + ' = ' + rub(t.lastBalance.rub) : '—')
      + '</b> <span class="t-sub">' + (t.lastBalance ? 'на ' + dmy(t.lastBalance.date) : '') + '; последняя загрузка CSV: '
      + (t.lastUpload ? new Date(t.lastUpload).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК' : 'не было') + '</span></p>'
      + (t.afterBalance && t.afterBalance.eur ? '<p class="apiacc__line">Остаток сейчас (расчёт): <b>' + eur(t.afterBalance.balanceEur)
        + ' = ' + rub(t.afterBalance.balanceRub) + '</b> <span class="t-sub">— замер минус расход из CSV после него ('
        + eur(t.afterBalance.eur) + '); новый замер из кабинета заменит расчёт</span></p>' : '');
    html += '<p class="apiacc__line">За период по CSV: <b>' + eur(t.inPeriod.eur) + ' = ' + rub(t.inPeriod.rub) + '</b>'
      + ' <span class="t-sub">показы ' + nf0.format(t.inPeriod.impressions) + ', клики ' + nf0.format(t.inPeriod.clicks)
      + ', действия ' + nf0.format(t.inPeriod.actions) + '</span></p>'
      + chart(t.daily) + issuesHtml(t.issues) + adsHtml(t.ads)
      + '<div id="tg-csv"></div></div>';
    host.innerHTML = html;
    if (j && w.bindTelegramFunds) w.bindTelegramFunds(d.getElementById('tg-card'), opts);
    if (w.bindTelegramCsv) w.bindTelegramCsv(d.getElementById('tg-csv'), opts);
  };
})(window, document);
