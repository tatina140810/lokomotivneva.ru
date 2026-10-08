/* Реклама в кабинетах (Тати 2026-10-08): расход, показы, клики, CTR, цена клика и
   тысячи показов — прямо из Яндекс.Директа и VK Рекламы, без ручного ввода. Сервер
   забирает статистику сам каждые 30 минут; кнопка «Обновить сейчас» — не дожидаясь.
   Рядом — наши переходы и обращения по тому же каналу и цена заявки.
   Данные — блок adApi в /api/site-analytics/summary. Telegram Ads и экраны API не
   имеют — их расход по-прежнему вносится в «Затратах на рекламу». */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU');
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var LABEL = { yandex_direct: 'Директ', vk_ads: 'VK' };
  // Что нужно, чтобы кабинет заработал — показываем, пока ключей нет.
  var HOWTO = {
    yandex_direct: 'Нужен OAuth-токен аккаунта с доступом к API Директа '
      + '(приложение на oauth.yandex.ru + заявка в кабинете: Инструменты → API).',
    vk_ads: 'Нужны client_id и client_secret: кабинет VK Рекламы → Настройки → Доступ к API '
      + '(если раздела нет, его включает поддержка VK Рекламы).',
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rub(v) { return v == null ? '—' : nf.format(Math.round(Number(v))) + ' ₽'; }
  function rub2(v) { return v == null ? '—' : nf2.format(Number(v)) + ' ₽'; }
  function cnt(v) { return v == null ? '—' : nf.format(Number(v)); }
  function pct(v) { return v == null ? '—' : String(v).replace('.', ',') + ' %'; }
  function when(iso) {
    if (!iso) return '';
    var t = new Date(iso);
    var hm = t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return t.toDateString() === new Date().toDateString()
      ? 'сегодня в ' + hm : t.toLocaleDateString('ru-RU') + ' в ' + hm;
  }

  function kv(k, v, hint) {
    return '<div class="apitile__kv"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>'
      + '<span>' + k + '</span><b>' + v + '</b></div>';
  }

  function tile(s) {
    if (!s.connected && !s.hasData) {
      return '<div class="apitile apitile--off"><h3>' + esc(s.label) + '</h3>'
        + '<p class="t-sub">Не подключён. ' + esc(HOWTO[s.source] || '') + '</p></div>';
    }
    var status = s.lastError
      ? '<p class="apierr">Ошибка обновления ' + esc(when(s.lastErrorAt)) + ': ' + esc(s.lastError) + '</p>'
      : '<p class="t-sub">Обновлено ' + (s.lastSyncAt ? esc(when(s.lastSyncAt)) : '— ещё не забирали') + '</p>';
    return '<div class="apitile"><h3>' + esc(s.label) + '</h3>'
      + '<div class="apitile__main">' + rub(s.cost) + '<span class="t-sub"> расход за период</span></div>'
      + kv('Показы', cnt(s.impressions))
      + kv('Клики', cnt(s.clicks))
      + kv('CTR', pct(s.ctr), 'доля показов, по которым кликнули')
      + kv('Цена клика', rub2(s.cpc))
      + kv('Цена 1000 показов', rub2(s.cpm))
      + '<div class="apitile__sep"></div>'
      + kv('Переходы на сайт', cnt(s.visits), 'по нашему счётчику: визиты с этого канала')
      + kv('Цена перехода', rub2(s.costPerVisit))
      + kv('Заявки с сайта', cnt(s.leads))
      + kv('Цена заявки', rub(s.costPerLead))
      + status + '</div>';
  }

  function campaigns(list) {
    if (!list.length) return '<p class="t-sub">За выбранный период в кабинетах нет показов.</p>';
    return '<div class="scrollx"><table><thead><tr><th>Кампания</th><th>Показы</th><th>Клики</th>'
      + '<th>CTR</th><th>Расход</th><th>Цена клика</th><th>Цена 1000 показов</th></tr></thead><tbody>'
      + list.map(function (c) {
        return '<tr><td>' + esc(c.name || ('Кампания ' + c.campaignId))
          + '<div class="t-sub">' + esc(LABEL[c.source] || c.source) + ' · №' + esc(c.campaignId) + '</div></td>'
          + '<td>' + cnt(c.impressions) + '</td><td>' + cnt(c.clicks) + '</td><td>' + pct(c.ctr) + '</td>'
          + '<td>' + rub(c.cost) + '</td><td>' + rub2(c.cpc) + '</td><td>' + rub2(c.cpm) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  w.renderAdApiBox = function (host, opts) {
    var block = opts.summary && opts.summary.adApi;
    if (!host || !block) return;
    var anyOn = block.sources.some(function (s) { return s.connected || s.hasData; });

    host.innerHTML = '<div class="card"><div class="card__head"><h2>Реклама в кабинетах</h2>'
      + '<span class="card__note">Директ и VK Реклама: данные из кабинетов, обновляются сами каждые 30 минут</span>'
      + (anyOn ? '<button type="button" class="bar__btn apisync" id="api-sync">Обновить сейчас</button>' : '')
      + '</div>'
      + '<div class="apigrid">' + block.sources.map(tile).join('') + '</div>'
      + (anyOn ? '<h3 class="adsh3">По кампаниям</h3>' + campaigns(block.campaigns) : '')
      + '<p class="t-sub" id="api-msg" style="margin:10px 0 0">Расход с НДС, как списывается со счёта. '
      + 'Заявки и переходы — по нашему счётчику на сайте, на уровне канала: без меток в ссылке '
      + 'заявку нельзя приписать конкретной кампании.</p></div>';

    var btn = d.getElementById('api-sync');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var msg = d.getElementById('api-msg');
      btn.disabled = true;
      btn.textContent = 'Забираем из кабинетов…';
      w.fetch(opts.api + '/site-analytics/ad-api/sync', {
        method: 'POST', headers: { Authorization: 'Bearer ' + opts.token },
      }).then(function (r) {
        if (r.status === 429) throw new Error('Обновлять можно не чаще раза в минуту.');
        if (!r.ok) throw new Error('Сервер не ответил (' + r.status + ').');
        return r.json();
      }).then(function () {
        // Отчёт перерисуется целиком; ошибка кабинета, если была, видна в его карточке.
        if (opts.onChange) opts.onChange();
      }).catch(function (e) {
        msg.textContent = e.message;
        btn.disabled = false;
        btn.textContent = 'Обновить сейчас';
      });
    });
  };
})(window, document);
