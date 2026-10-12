/* VK без ручного ввода (Тати 2026-10-12). Сервер сам находит пополнения по росту
   общего остатка из API, оценивает «свои / бонус» между ручными замерами (бонус платит
   долю по остаткам, но не больше 50 %) и сжигает бонус в день срока. Здесь — показ:
   оценка и дата последнего ручного замера, расхождение замера с оценкой, напоминание
   раз в месяц, пауза замеров, автопополнения с вопросом «свои или бонус?» и правкой
   «оплачено по счёту». */
(function (w, d) {
  'use strict';
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function rub2(v) { return v == null ? '—' : nf2.format(Number(v)) + ' ₽'; }
  function sign(v) { return (Number(v) > 0 ? '+' : '') + nf2.format(Number(v)) + ' ₽'; }
  function dmy(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('.') : ''; }
  function at(iso) {
    if (!iso) return '';
    var t = new Date(iso);
    return t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' }) + ' '
      + t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) + ' МСК';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function checkLine(c) {
    return '<p class="t-sub">Ручной замер ' + at(c.at) + ': свои ' + rub2(c.own) + ' (оценка ' + rub2(c.estOwn) + ', '
      + sign(c.ownDiff) + '), бонус ' + rub2(c.bonus) + ' (оценка ' + rub2(c.estBonus) + ', ' + sign(c.bonusDiff) + ').</p>'
      + (c.warn ? '<p class="apiwarn">Расхождение больше 50 ₽ — расчёт пересчитан от ручного замера.</p>' : '');
  }

  function topupRow(t) {
    var state = t.funds === 'bonus'
      ? 'бонус' + (t.expiresOn ? ', сгорает ' + dmy(t.expiresOn) : '')
      : 'свои' + (t.answered ? '' : ' — по умолчанию, ждём ответа');
    return '<div class="vkauto__row" data-id="' + t.id + '">'
      + '<div><b>' + at(t.at) + '</b> · зачислено ' + rub2(t.credited)
      + (t.funds === 'own' ? ' · оплачено по счёту ' + rub2(t.paid) : '') + '<div class="t-sub">' + esc(state) + '</div></div>'
      + '<div class="apiacc__row">'
      + '<button type="button" class="bar__btn" data-vk-funds="own">Свои</button>'
      + '<label class="vkauto__exp">Бонус до<input type="date" data-vk-exp value="' + (t.expiresOn ? String(t.expiresOn).slice(0, 10) : '') + '"></label>'
      + '<button type="button" class="bar__btn" data-vk-funds="bonus">Бонус</button>'
      + (t.funds === 'own' ? '<label>Оплачено, ₽<input type="text" inputmode="decimal" data-vk-paid value="' + Number(t.paid).toFixed(2) + '"></label>'
        + '<button type="button" class="bar__btn" data-vk-save-paid>Сохранить</button>' : '')
      + '</div></div>';
  }

  w.adApiVkAuto = {
    html: function (s) {
      var v = s.vkFunds;
      if (!v) return '';
      var e = v.estimate;
      var out = '';
      if (e) {
        out += '<p class="t-sub">' + (v.estimated
          ? 'Свои и бонус — оценка на ' + at(e.at) + ' по остатку из API; последний ручной замер: ' + at(e.lastManualAt)
          : 'Свои и бонус — по ручному замеру ' + at(e.lastManualAt)) + '.</p>';
        if (e.lastCheck) out += checkLine(e.lastCheck);
        if (e.remind) out += '<p class="apiwarn">Ручного замера остатков не было больше месяца — внесите свои и бонус из кабинета VK.</p>';
        (e.burned || []).forEach(function (b) {
          out += '<p class="t-sub">Бонус сгорел ' + at(b.at) + ': ' + rub2(b.amount) + ' — не расход.</p>';
        });
      }
      if (v.paused) {
        out += '<p class="apiwarn">' + esc(v.alert || 'Замеры остатка VK на паузе.') + '</p>'
          + '<div class="apiacc__row"><button type="button" class="bar__btn" data-vk-resume="0">Пополнение внесено — продолжить</button>'
          + '<button type="button" class="bar__btn" data-vk-resume="1">Разобрано — продолжить</button></div>';
      }
      var tops = v.autoTopups || [];
      if (tops.length) {
        out += '<div class="vkauto"><p class="apiacc__line"><b>Автопополнения</b> <span class="t-sub">— по росту остатка; «свои», пока не выбрано иначе</span></p>'
          + tops.map(topupRow).join('') + '</div>';
      }
      return out + '<p class="apierr" id="vk-auto-err"></p>';
    },

    bind: function (opts) {
      var host = d.getElementById('ad-api');
      if (!host || host.getAttribute('data-vk-auto')) return;
      host.setAttribute('data-vk-auto', '1');                 // один обработчик на всю жизнь блока
      function req(method, path, body) {
        return w.fetch(opts.api + path, {
          method: method,
          headers: { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        }).then(function (r) {
          if (r.ok) return r.json();
          return r.json().catch(function () { return {}; }).then(function (j) {
            throw new Error({ bad_expires: 'Для бонуса укажите, до какого дня он действует.', bad_paid: 'Оплачено — число, до двух знаков после запятой.',
              not_found: 'Пополнение не найдено.', no_topup_found: 'Пополнения под этот рост не нашлось — внесите его или нажмите «Разобрано».' }[j.error || j.reason]
              || 'Не сохранилось (' + r.status + ').');
          });
        });
      }
      host.addEventListener('click', function (ev) {
        var err = d.getElementById('vk-auto-err');
        var b = ev.target.closest('[data-vk-funds],[data-vk-save-paid],[data-vk-resume]');
        if (!b || !host.contains(b)) return;
        if (err) err.textContent = '';
        var row = b.closest('.vkauto__row');
        var job;
        if (b.hasAttribute('data-vk-resume')) {
          job = req('POST', '/site-analytics/ad-api/vk-balance/resume', { force: b.getAttribute('data-vk-resume') === '1' })
            .then(function (r) { if (r && r.resumed === false) throw new Error('Пополнения под этот рост не нашлось — внесите его или нажмите «Разобрано».'); });
        } else if (b.hasAttribute('data-vk-funds')) {
          var funds = b.getAttribute('data-vk-funds');
          var exp = row.querySelector('[data-vk-exp]').value;
          if (funds === 'bonus' && !exp) { if (err) err.textContent = 'Для бонуса укажите, до какого дня он действует.'; return; }
          job = req('POST', '/site-analytics/vk-topups/' + row.getAttribute('data-id') + '/funds',
            funds === 'bonus' ? { funds: funds, expires_on: exp } : { funds: funds });
        } else {
          var paid = String(row.querySelector('[data-vk-paid]').value || '').replace(/\s/g, '').replace(',', '.');
          job = req('PUT', '/site-analytics/vk-topups/' + row.getAttribute('data-id') + '/paid', { paid: paid });
        }
        b.disabled = true;
        job.then(function () { opts.onChange(); })
          .catch(function (e) { if (err) err.textContent = e.message; b.disabled = false; });
      });
    },
  };
})(window, document);
