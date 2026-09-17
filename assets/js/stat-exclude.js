/* Блок «Мои визиты» на странице статистики: не учитывать заходы с моего адреса и
   с этого браузера.
   Зачем: мы сами постоянно заходим на сайт — проверить правку, показать клиенту,
   открыть с телефона. На небольших числах пара таких заходов заметно двигает и
   «прямые заходы», и среднее время, и картина перестаёт быть правдой. */
(function (w, d) {
  'use strict';
  var BROWSER_KEY = 'loko_stat_off';

  function browserOff() {
    try { return w.localStorage.getItem(BROWSER_KEY) === '1'; } catch (e) { return false; }
  }
  function setBrowserOff(on) {
    try {
      if (on) w.localStorage.setItem(BROWSER_KEY, '1');
      else w.localStorage.removeItem(BROWSER_KEY);
      return true;
    } catch (e) { return false; }
  }

  /* host — куда рисуем, opts = { api, token, onChange } */
  w.renderExcludeBox = function (host, opts) {
    var api = opts.api, token = opts.token;
    var head = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function draw(me, list) {
      var rows = (list || []).map(function (x) {
        var when = x.created_at ? new Date(x.created_at).toLocaleDateString('ru-RU') : '';
        return '<tr><td>' + esc(x.label || 'без подписи')
          + '<div class="t-sub">' + esc(x.ip_hash).slice(0, 12) + '… · с ' + when + '</div></td>'
          + '<td><button type="button" class="bar__btn" data-back="' + esc(x.ip_hash) + '">Снова учитывать</button></td></tr>';
      }).join('');

      host.innerHTML = '<div class="card"><div class="card__head"><h2>Мои визиты</h2>'
        + '<span class="card__note">чтобы наши собственные заходы не попадали в отчёт</span></div>'
        + '<table><tbody>'
        + '<tr><td>Мой адрес сейчас: <b>' + esc(me.ip) + '</b>'
        + '<div class="t-sub">' + (me.excluded
          ? 'заходы с этого адреса в отчёт не попадают'
          : 'заходы с этого адреса сейчас считаются как обычные посетители') + '</div></td>'
        + '<td>' + (me.excluded
          ? '<button type="button" class="bar__btn" data-back="' + esc(me.hash || '') + '" data-self="1">Снова учитывать</button>'
          : '<button type="button" class="bar__btn" id="ex-add">Не учитывать мой адрес</button>') + '</td></tr>'
        + '<tr><td>Этот браузер'
        + '<div class="t-sub">' + (browserOff()
          ? 'визиты из этого браузера не отправляются'
          : 'нужно там, где адрес меняется: мобильный интернет, чужой Wi-Fi') + '</div></td>'
        + '<td><button type="button" class="bar__btn" id="ex-browser">'
        + (browserOff() ? 'Снова считать этот браузер' : 'Не считать этот браузер') + '</button></td></tr>'
        + rows
        + '</tbody></table>'
        + '<p class="t-sub" style="margin:12px 0 0">Отчёт пересчитывается сразу и задним числом: '
        + 'прошлые заходы с исключённого адреса тоже перестают учитываться. Сами записи сохраняются, '
        + 'решение всегда можно отменить.</p></div>';

      var add = d.getElementById('ex-add');
      if (add) add.addEventListener('click', function () {
        add.disabled = true; add.textContent = 'Сохраняем…';
        w.fetch(api + '/site-analytics/excluded', {
          method: 'POST', headers: head, body: JSON.stringify({ label: 'мой адрес' }),
        }).then(load).then(function () { if (opts.onChange) opts.onChange(); });
      });

      var br = d.getElementById('ex-browser');
      if (br) br.addEventListener('click', function () {
        var ok = setBrowserOff(!browserOff());
        if (!ok) { br.textContent = 'Браузер не разрешил сохранить'; return; }
        load();
      });

      [].forEach.call(host.querySelectorAll('[data-back]'), function (b) {
        b.addEventListener('click', function () {
          var hash = b.getAttribute('data-back');
          if (!hash) return;
          b.disabled = true; b.textContent = 'Возвращаем…';
          w.fetch(api + '/site-analytics/excluded/' + encodeURIComponent(hash), {
            method: 'DELETE', headers: head,
          }).then(load).then(function () { if (opts.onChange) opts.onChange(); });
        });
      });
    }

    function load() {
      return Promise.all([
        w.fetch(api + '/site-analytics/my-ip', { headers: head }).then(function (r) { return r.ok ? r.json() : { ip: '—', excluded: false }; }),
        w.fetch(api + '/site-analytics/excluded', { headers: head }).then(function (r) { return r.ok ? r.json() : { excluded: [] }; }),
      ]).then(function (res) {
        var me = res[0];
        var list = (res[1].excluded || []);
        /* Свой адрес показан отдельной строкой сверху — в общем списке он был бы дублем. */
        var rest = list.filter(function (x) { return x.ip_hash !== me.hash; });
        draw(me, rest);
      }).catch(function () {
        host.innerHTML = '<div class="card"><p class="empty">Не удалось загрузить настройки учёта.</p></div>';
      });
    }

    load();
  };
})(window, document);
