/* VK: свои деньги и бонусы (Тати 2026-10-09). API VK отдаёт только общий остаток,
   поэтому раздел — из кабинета: пополнения с типом «свои»/«бонус» (у бонуса — срок
   сгорания) и замер остатков двумя числами на один момент. Бонусы — не затраты: цены
   перехода и заявки считаются по своим деньгам, по полному расходу — второй строкой.
   НДС (Тати 2026-10-12): баланс и расход в кабинете — без НДС, пополнения оплачены
   счетами с НДС 22 %. Затраты — свои деньги с НДС (расход своих × 1,22); пополнение
   вносится двумя суммами: зачислено на баланс и оплачено по счёту. */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU');
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function rub(v) { return v == null ? '—' : nf.format(Math.round(Number(v))) + ' ₽'; }
  function rub2(v) { return v == null ? '—' : nf2.format(Number(v)) + ' ₽'; }
  function dmy(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('.') : ''; }
  function at(iso) {
    if (!iso) return '';
    var t = new Date(iso);
    return t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' }) + ' '
      + t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) + ' МСК';
  }
  function kv(k, v, hint) {
    return '<div class="apitile__kv"' + (hint ? ' title="' + hint + '"' : '') + '><span>' + k + '</span><b>' + v + '</b></div>';
  }
  function today() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }

  function flagText(f) {
    if (f.kind === 'not_proportional') return 'VK списал не пропорционально остаткам (' + dmy(f.from) + '–' + dmy(f.to)
      + '): свои ' + String(f.ownShare).replace('.', ',') + ' %, по остаткам ожидалось ' + String(f.expectedShare).replace('.', ',') + ' %.';
    if (f.kind === 'bonus_expires') return 'Бонусы сгорают ' + dmy(f.on) + (f.amount != null ? ': остаток ' + rub2(f.amount) : '') + '.';
    if (f.kind === 'bonus_burn_pending') return 'Срок бонусов ' + dmy(f.on) + ' прошёл: остаток ' + rub2(f.amount)
      + ' сгорел — внесите замер остатков из кабинета, чтобы сгоревшее не считалось расходом.';
    if (f.kind === 'bonus_burned_inside') return 'В промежутке ' + dmy(f.from) + '–' + dmy(f.to) + ' сгорели бонусы (' + dmy(f.on)
      + '): часть списания бонусов ' + rub2(f.amount) + ' — сгорание, а не реклама.';
    if (f.kind === 'negative') return (f.fund === 'bonus' ? 'Бонусы' : 'Свои') + ' ' + dmy(f.from) + '–' + dmy(f.to)
      + ': остаток вырос на ' + rub2(f.amount) + ' без пополнения — внесите пополнение.';
    if (f.kind === 'no_stats') return 'Нет статистики за ' + dmy(f.from) + '–' + dmy(f.to) + ' — расход разложен по дням поровну.';
    return f.kind;
  }

  w.adApiVk = {
    applies: function (s) { return s.source === 'vk_ads'; },

    // Верх карточки, когда есть пополнения VK; иначе карточка как раньше.
    head: function (s) {
      var v = s.vkFunds;
      if (!v) return null;
      var flags = (v.flags || []).map(function (f) {
        return '<p class="apiwarn">' + flagText(f) + '</p>';
      }).join('');
      // С оценкой по остатку из API раздел известен до последнего часового замера;
      // предупреждение — только если оценки нет (нет замеров API после ручного).
      if (v.partial && !v.estimated) {
        flags += '<p class="apiwarn">Свои и бонусы учтены до замера ' + (v.knownUntil ? at(v.knownUntil) : '—')
          + '. Дальше раздел неизвестен — внесите свежие остатки из кабинета.</p>';
      }
      var est = v.estimated ? ', оценка' : '';
      // Длинные серые пояснения — в свёрнутый «Как считается» (Тати 2026-10-30); на виду цифры.
      var how = [
        'Своих в кабинете — расход своих денег по остаткам, без НДС' + (v.knownUntil ? ', учтён до ' + at(v.knownUntil) : '')
          + (v.estimated ? ' (оценка)' : '') + '; × 1,22 — потрачено с НДС.',
        'Бонусы VK бесплатные — в затраты и цены не входят.',
        'Полный расход кабинета — статистика VK × 1,22, как если бы бонусов не было; для сравнения с Директом'
          + (s.lastSyncAt ? '. Данные на ' + at(s.lastSyncAt) : '') + '.',
        'Остаток своих — в кабинете, без НДС' + (v.estimated ? ' (оценка)' : '') + '; «оплачено» — сумма счетов с НДС за этот остаток.',
        'Бюджет: оплачено по счетам — сумма счетов с НДС за пополнения своих.',
      ];
      if (v.apiBalance) how.push('Общий остаток по API — свои и бонусы вместе, на ' + at(v.apiBalance.at) + '.');
      if (w.adApiVkAuto) how = how.concat(w.adApiVkAuto.notes(s));
      return '<div class="apitile__main">' + rub(v.own.inPeriodVat) + '<span class="t-sub"> своих денег потрачено за период, с НДС</span></div>'
        + kv('Своих в кабинете', rub2(v.own.inPeriod) + '<div class="t-sub">без НДС' + est + '</div>', 'расход своих по остаткам; × 1,22 — потрачено с НДС')
        + kv('Бонусы потрачено', rub2(v.bonus.inPeriod), 'бонусы VK бесплатные — в затраты и цены не входят')
        + kv('Полный расход кабинета', rub2(v.statsInPeriod) + '<div class="t-sub">с НДС; без НДС ' + rub2(s.costNet) + '</div>',
          'статистика VK × 1,22 — как если бы бонусов не было; для сравнения с Директом')
        + '<div class="apitile__sep"></div>'
        + kv('Остаток своих', rub2(v.own.balance) + '<div class="t-sub">без НДС' + est + '; оплачено ' + rub2(v.own.balanceVat) + '</div>')
        + kv('Остаток бонусов', rub2(v.bonus.balance) + (v.estimated ? '<div class="t-sub">оценка</div>' : ''))
        + kv('Бюджет: оплачено по счетам', rub2(v.own.paid), 'сумма счетов с НДС за пополнения своих')
        + kv('Бонусы получено', rub2(v.bonus.topups))
        + (v.apiBalance ? kv('Общий остаток по API', rub2(v.apiBalance.total), 'на ' + at(v.apiBalance.at) + '; свои + бонусы вместе') : '')
        + flags + (w.adApiVkAuto ? w.adApiVkAuto.html(s) : '')
        + '<details class="apifold"><summary>Как считается</summary>'
        + how.map(function (h) { return '<p>' + h + '</p>'; }).join('') + '</details>'
        + '<div class="apitile__sep"></div>';
    },

    // Цены по своим деньгам — основная строка; по полному расходу — вторая.
    prices: function (s) {
      var v = s.vkFunds;
      if (!v) return null;
      return kv('Цена перехода', rub2(s.costPerVisit) + '<div class="t-sub">по полному расходу: ' + rub2(v.costPerVisitFull) + '</div>',
          'основная — по своим деньгам с НДС; вторая — по полному расходу кабинета с НДС')
        + kv('Заявки с сайта', s.leads == null ? '—' : nf.format(s.leads))
        + kv('Цена заявки', rub(s.costPerLead) + '<div class="t-sub">по полному расходу: ' + rub(v.costPerLeadFull) + '</div>');
    },

    form: function () {
      // Ручной ввод нужен редко — свёрнут по умолчанию (Тати 2026-10-30).
      return '<details class="apifold apifold--form"><summary>Внести вручную</summary>'
        + '<div class="apiacc"><p class="apiacc__line"><b>VK: пополнения и остатки</b> <span class="t-sub">— суммы кабинета без НДС; оплата по счёту — с НДС</span></p>'
        + '<div class="apiacc__row">'
        + '<label>Что<select id="vk-kind"><option value="topup">Пополнение</option><option value="balance">Остатки из кабинета</option></select></label>'
        + '<label>Дата<input type="date" id="vk-date" value="' + today() + '"></label>'
        + '<label>Время, МСК<input type="time" id="vk-time"></label></div>'
        + '<div class="apiacc__row" id="vk-topup">'
        + '<label>Зачислено, ₽<input type="text" inputmode="decimal" id="vk-sum" placeholder="5 000"></label>'
        + '<label id="vk-paid-wrap">Оплачено по счёту, ₽<input type="text" inputmode="decimal" id="vk-paid" placeholder="× 1,22"></label>'
        + '<label>Чьи<select id="vk-funds"><option value="own">свои</option><option value="bonus">бонус</option></select></label>'
        + '<label id="vk-exp-wrap" hidden>Сгорает<input type="date" id="vk-exp"></label>'
        + '<label>Пометка<input type="text" id="vk-note" placeholder="№ счёта, акция"></label></div>'
        + '<div class="apiacc__row" id="vk-bal" hidden>'
        + '<label>Свои, ₽<input type="text" inputmode="decimal" id="vk-own"></label>'
        + '<label>Бонусы, ₽<input type="text" inputmode="decimal" id="vk-bonus"></label></div>'
        + '<div class="apiacc__row"><button type="button" class="bar__btn" id="vk-save">Внести</button></div>'
        + '<p class="apierr" id="vk-err"></p></div></details>';
    },

    bind: function (opts) {
      if (w.adApiVkAuto) w.adApiVkAuto.bind(opts);
      var save = d.getElementById('vk-save');
      if (!save) return;
      var err = d.getElementById('vk-err');
      var kind = d.getElementById('vk-kind');
      var fundsSel = d.getElementById('vk-funds');
      function sync() {
        d.getElementById('vk-topup').hidden = kind.value !== 'topup';
        d.getElementById('vk-bal').hidden = kind.value !== 'balance';
        d.getElementById('vk-exp-wrap').hidden = fundsSel.value !== 'bonus';
        // Бонус бесплатный — оплаты по счёту у него нет.
        d.getElementById('vk-paid-wrap').hidden = fundsSel.value === 'bonus';
      }
      kind.addEventListener('change', sync);
      fundsSel.addEventListener('change', sync);
      function num(id) { return String(d.getElementById(id).value || '').replace(/\s/g, '').replace(',', '.'); }
      function post(body) {
        return w.fetch(opts.api + '/site-analytics/spend', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function (r) {
          if (r.ok) return r.json();
          return r.json().catch(function () { return {}; }).then(function (j) {
            throw new Error({ bad_amount: 'Сумма — число, до двух знаков после запятой.', bad_time: 'Время — ЧЧ:ММ.',
              bad_expires: 'Срок сгорания — только у бонуса.', bad_period: 'Укажите дату.',
              bad_paid: 'Оплачено по счёту — число, до двух знаков после запятой.' }[j.error] || 'Не сохранилось (' + r.status + ').');
          });
        });
      }
      save.addEventListener('click', function () {
        err.textContent = '';
        var day = d.getElementById('vk-date').value;
        var base = { channel: 'vk_ads', title: 'VK Реклама', kind: kind.value, period_start: day, period_end: day,
          currency: 'RUB', time: d.getElementById('vk-time').value || null };
        var jobs;
        if (kind.value === 'topup') {
          if (!num('vk-sum')) { err.textContent = 'Введите сумму.'; return; }
          // Свои: оплачено по счёту; пусто — зачислено × 1,22 (сервер). Бонус: оплачено 0.
          var bonus = fundsSel.value === 'bonus';
          jobs = [post(Object.assign({}, base, { amount: num('vk-sum'), funds: fundsSel.value, vat: 'excl',
            paid: bonus ? '0' : (num('vk-paid') || null),
            expires_on: fundsSel.value === 'bonus' ? (d.getElementById('vk-exp').value || null) : null,
            note: d.getElementById('vk-note').value || null }))];
        } else {
          // Остатки — парой на один момент: иначе раздел расхода не посчитать.
          if (!num('vk-own') || !num('vk-bonus')) { err.textContent = 'Нужны оба остатка: свои и бонусы.'; return; }
          if (!base.time) { err.textContent = 'Укажите время замера — VK тратит в течение дня.'; return; }
          jobs = [post(Object.assign({}, base, { amount: num('vk-own'), funds: 'own', vat: 'excl' })),
            post(Object.assign({}, base, { amount: num('vk-bonus'), funds: 'bonus', vat: 'excl' }))];
        }
        save.disabled = true;
        Promise.all(jobs).then(function () { opts.onChange(); })
          .catch(function (e) { err.textContent = e.message; save.disabled = false; });
      });
    },
  };
})(window, document);
