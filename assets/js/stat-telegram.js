/* Раздел «Telegram Ads» (Тати 2026-10-13): по образцу плиток Директа и VK в «Рекламе в
   кабинетах» — итоги за выбранный период, график по дням, таблица по объявлениям, журнал
   оплат eLama и переводов, загрузка CSV сверху. API у Telegram Ads нет: расход, показы и
   клики — из CSV, рубли — по курсу переводов (lib/telegramFunds.js на сервере).
   Переходы и обращения — по нашему счётчику (метки utm_source=telegram_ads), как у Директа
   и VK. Расход по-прежнему попадает в «Затраты на рекламу» — здесь ничего не пересчитывается.
   Данные — блок telegram и строка telegram_ads из budgetTable в /api/site-analytics/summary. */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('ru-RU');
  function rub(v) { return v == null ? '—' : nf0.format(Math.round(Number(v))) + ' ₽'; }
  function rub2(v) { return v == null ? '—' : nf2.format(Number(v)) + ' ₽'; }
  function eur(v) { return v == null ? '—' : nf.format(Number(v)) + ' €'; }
  function cnt(v) { return v == null ? '—' : nf0.format(Number(v)); }
  function pct(v) { return v == null ? '—' : String(v).replace('.', ',') + ' %'; }
  // Без расхода цена — прочерк, как в «Затратах на рекламу», а не «0 ₽».
  function div(a, b) { return a && b ? a / b : null; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dmy(iso) { if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function msk(at) { return at ? new Date(at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК' : 'не было'; }
  function daysWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'день';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
    return 'дней';
  }
  function kv(k, v, hint) {
    return '<div class="apitile__kv"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><span>' + k + '</span><b>' + v + '</b></div>';
  }

  /* Итоги за период — та же плитка, что у Директа и VK. */
  function totals(t, row) {
    var p = t.inPeriod;
    var j = t.journal;
    var visits = row ? row.visits : null;
    var leads = row ? row.leads : null;
    return '<div class="apitile"><h3>Telegram Ads</h3>'
      + '<div class="apitile__main">' + rub(p.rub) + '<span class="t-sub"> расход за период · ' + eur(p.eur) + '</span></div>'
      + kv('Показы', cnt(p.impressions))
      + kv('Клики', cnt(p.clicks) + (p.clicks != null && !p.clicksComplete ? '*' : ''), p.clicks == null
        ? 'в дневном отчёте Reports кликов нет — загрузите выгрузку Statistics' : p.clicksComplete ? '' : '* клики загружены не за все дни')
      + kv('CTR', pct(p.clicks != null && p.clickImpressions ? Math.round((p.clicks / p.clickImpressions) * 1e4) / 100 : null),
        'доля показов, по которым кликнули — по дням, где клики загружены')
      + kv('Цена клика', rub2(p.clicksComplete ? div(p.rub, p.clicks) : null), p.clicksComplete ? '' : 'считается, когда клики загружены за все дни')
      + kv('Цена 1000 показов', rub2(p.impressions ? (p.rub / p.impressions) * 1000 : null))
      + '<div class="apitile__sep"></div>'
      + kv('Переходы на сайт', cnt(visits), 'по нашему счётчику: визиты с меткой Telegram Ads')
      + kv('Цена перехода', rub2(div(p.rub, visits)))
      + kv('Обращения с Telegram', cnt(leads), 'заявки с сайта с меткой Telegram Ads; звонки по каналам не разносятся')
      + kv('Цена обращения', rub(div(p.rub, leads)))
      + '<div class="apitile__sep"></div>'
      + (j ? kv('Остаток бюджета', rub(j.remainingRub), 'оплачено eLama минус расход по CSV, вместе с деньгами, ещё не переведёнными с eLama')
          + kv('В кабинете Telegram Ads (расчёт)', eur(j.cabinetEur), 'переведено минус расход по CSV')
          + kv('У eLama, не переведено (оценка)', rub(j.unallocatedRub))
        : kv('Остаток бюджета', row && row.remaining != null ? rub(row.remaining) : '—'))
      + '<p class="t-sub">Рубли — по курсу переводов' + (t.rate ? ' ' + nf2.format(t.rate.rate) + ' ₽ за 1 €' : '')
      + (t.rate && t.rate.provisional ? ' <span class="tgprov">предварительный курс, уточнить по счетам eLama</span>' : '') + '</p></div>';
  }

  function chartTile(t) {
    return '<div class="apitile tgc"><h3>По дням</h3>' + (w.telegramChart ? w.telegramChart(t.daily) : '') + '</div>';
  }

  /* По объявлениям — как «По кампаниям»: цифры за выбранный период. */
  function adsTable(ads) {
    if (!ads.length) return '<p class="t-sub">Объявлений пока нет — загрузите CSV Telegram Ads.</p>';
    return '<div class="scrollx"><table class="tgads"><thead><tr><th>Объявление</th><th>Создано</th><th>Показы</th><th>Клики</th>'
      + '<th>CTR</th><th>Расход, €</th><th>Расход, ₽</th><th>Цена 1000 показов</th><th>Остаток на объявлении</th></tr></thead><tbody>'
      + ads.map(function (a) {
        var p = a.period;
        return '<tr><td>' + esc(a.name) + ' <button type="button" class="tgren" data-ren="' + esc(a.name) + '">Переименовать</button>'
          + '<div class="t-sub">в CSV ' + dmy(a.from) + ' — ' + dmy(a.to) + ' (' + a.days + ' '
          + daysWord(a.days) + '), всего ' + eur(a.eur) + '; загружено ' + msk(a.uploadedAt) + '</div></td>'
          + '<td title="первый день объявления в CSV">' + dmy(a.from) + '</td>'
          + '<td>' + cnt(p.impressions) + '</td><td' + (p.clicks == null ? ' title="клики не загружены"' : '') + '>' + cnt(p.clicks) + '</td><td>' + pct(p.ctr) + '</td>'
          + '<td>' + eur(p.eur) + '</td><td>' + rub(p.rub) + '</td>'
          + '<td>' + (p.cpmEur == null ? '—' : eur(p.cpmEur) + ' <span class="t-sub">' + rub(p.cpmRub) + '</span>') + '</td>'
          + '<td class="t-sub" title="в CSV остатка нет — он виден в кабинете Telegram Ads">—</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function issuesHtml(list) {
    return (list || []).map(function (x) {
      return '<p class="apiwarn">CSV расходится с остатками за ' + dmy(x.from) + '–' + dmy(x.to) + ': по остаткам '
        + eur(x.balanceEur) + ', в CSV ' + eur(x.csvEur) + ' (разница ' + eur(x.diffEur) + '). Данные не правились.</p>';
    }).join('');
  }

  w.renderTelegramBox = function (host, opts) {
    var t = opts.summary && opts.summary.telegram;
    if (!host || !t) return;
    var row = (opts.summary.budgetTable || []).filter(function (r) { return r.channel === 'telegram_ads'; })[0] || null;
    var label = w.statPeriodLabel ? w.statPeriodLabel(opts.summary.period) : '';
    var html = '<div class="card" id="tg-card"><div class="card__head"><h2>Telegram Ads</h2>'
      + '<span class="card__note">' + label + ' · данные из CSV Telegram Ads, загружаются вручную</span></div>'
      + '<div id="tg-csv"></div>'
      + '<p class="t-sub tgcov">Последняя загрузка: ' + msk(t.lastUpload)
      + (t.coverage ? '; расход есть за ' + dmy(t.coverage.from) + ' — ' + dmy(t.coverage.to) + ' (дни по UTC)' : '; расхода из CSV ещё нет') + '</p>';
    if (t.stale) {
      html += '<p class="tgremind">' + (t.staleDays == null ? 'Telegram ещё не обновлялся'
        : 'Telegram не обновлялся ' + t.staleDays + ' ' + daysWord(t.staleDays)) + ': загрузите CSV или внесите '
        + (t.journal ? 'контрольный остаток' : 'баланс') + '.</p>';
    }
    html += '<div class="apigrid tggrid">' + totals(t, row) + chartTile(t) + '</div>'
      + issuesHtml(t.issues)
      + '<h3 class="adsh3">По объявлениям</h3>' + adsTable(t.ads);
    if (t.journal && w.renderTelegramFunds) html += w.renderTelegramFunds(t.journal);
    html += '<p class="t-sub" style="margin:10px 0 0">Расход Telegram входит в «Затраты на рекламу» и итоги. Дни CSV — по UTC, '
      + 'как в кабинете Telegram Ads; период страницы — по МСК, поэтому расход позднего вечера может попасть в соседний день.</p></div>';
    host.innerHTML = html;
    if (t.journal && w.bindTelegramFunds) w.bindTelegramFunds(d.getElementById('tg-card'), opts);
    if (w.bindTelegramCsv) w.bindTelegramCsv(d.getElementById('tg-csv'), opts);
    bindRename(d.getElementById('tg-card'), t.ads, opts);
  };

  /* Переименовать объявление после загрузки; имя существующего — объединить с ним.
     Совпадающие дни сервер не объединяет (день посчитался бы дважды) и называет их. */
  function bindRename(card, ads, opts) {
    if (!card) return;
    card.addEventListener('click', function (e) {
      var from = e.target.dataset && e.target.dataset.ren;
      if (from == null) return;
      var cell = e.target.parentNode;
      var old = cell.innerHTML;
      cell.innerHTML = '<div class="tgrenf"><input type="text" class="tgname" maxlength="200" list="tg-ad-names" value="' + esc(from) + '">'
        + '<datalist id="tg-ad-names">' + ads.map(function (a) { return '<option value="' + esc(a.name) + '">'; }).join('') + '</datalist>'
        + '<button type="button" class="bar__btn tgsave">Сохранить</button><button type="button" class="bar__btn">Отмена</button>'
        + '<span class="t-sub">впишите новое название или выберите существующее — тогда объявления объединятся</span>'
        + '<p class="apierr"></p></div>';
      var inp = cell.querySelector('input');
      var err = cell.querySelector('.apierr');
      var btns = cell.querySelectorAll('button');
      inp.focus();
      btns[1].addEventListener('click', function () { cell.innerHTML = old; });
      btns[0].addEventListener('click', function () {
        var to = inp.value.trim();
        if (!to || to === from) { cell.innerHTML = old; return; }
        var merge = ads.some(function (a) { return a.name === to; });
        if (merge && !w.confirm('Объединить «' + from + '» с «' + to + '»? Расход и показы сложатся в одну строку.')) return;
        btns[0].disabled = true;
        w.fetch(opts.api + '/site-analytics/telegram-csv/rename', {
          method: 'POST', headers: { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: from, to: to }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (x) {
            if (r.status === 409 && x.days) throw new Error('Не объединено: у обоих объявлений есть дни ' + x.days.map(dmy).join(', ') + ' — один день посчитался бы дважды.');
            if (!r.ok) throw new Error('Не получилось (' + r.status + ')');
            if (opts.onChange) opts.onChange();
          });
        }).catch(function (x) { err.textContent = x.message; btns[0].disabled = false; });
      });
    });
  }
})(window, document);
