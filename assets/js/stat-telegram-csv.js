/* Загрузка CSV Telegram Ads (Тати 2026-10-13): несколько файлов сразу, по одному на
   объявление. Файлы читаются как текст и уходят на сервер: он разбирает их сам и в
   предпросмотре, и при сохранении. Предпросмотр — строки, период, расход в € и в ₽ по
   курсу оплаты, сколько дней заменится; сохранение — только по кнопке «Сохранить». */
(function (w, d) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  var ERR = {
    no_header: 'не нашлась шапка с датой и расходом', no_rows: 'нет строк с датой и расходом',
    no_ad_name: 'укажите название объявления', file_too_large: 'файл больше 1 МБ',
    no_files: 'файлы не выбраны', too_many_files: 'не больше 30 файлов за раз',
    no_rate: 'нет пополнений Telegram в € — курс не посчитать',
  };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dmy(iso) { if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function readText(file) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok({ name: file.name, text: String(r.result || '') }); };
      r.onerror = function () { fail(new Error('Не прочитался файл ' + file.name)); };
      r.readAsText(file, 'utf-8');
    });
  }

  w.bindTelegramCsv = function (host, opts) {
    if (!host) return;
    var files = [];
    host.innerHTML = '<div class="apiacc"><div class="apiacc__row">'
      + '<label class="bar__btn tgupload">Загрузить CSV Telegram Ads'
      + '<input type="file" id="tg-file" accept=".csv,text/csv,text/plain" multiple hidden></label>'
      + '<span class="t-sub">можно выбрать несколько файлов — по одному на объявление</span></div>'
      + '<div id="tg-preview"></div><p class="apierr" id="tg-err"></p></div>';
    var err = d.getElementById('tg-err');
    var box = d.getElementById('tg-preview');

    function post(path, body) {
      return w.fetch(opts.api + '/site-analytics/telegram-csv' + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + opts.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error((ERR[j.error] || 'Не получилось (' + r.status + ')') + (j.file ? ': ' + j.file : ''));
          return j;
        });
      });
    }
    function payload() {
      return { files: files.map(function (f, i) {
        var inp = d.getElementById('tg-name-' + i);
        return { name: f.name, text: f.text, adName: inp ? inp.value : null };
      }) };
    }
    function show(res) {
      var ok = res.files.every(function (f) { return !f.error; });
      var tot = res.files.reduce(function (s, f) { return s + (f.error ? 0 : f.eur); }, 0);
      box.innerHTML = '<p class="apiacc__line"><b>Предпросмотр</b> <span class="t-sub">— курс оплаты '
        + (res.rate ? nf.format(res.rate.rate) + ' ₽ за 1 €' + (res.rate.provisional ? ' (предварительный, уточнить по eLama)' : '') : 'не посчитан') + '</span></p>'
        + '<table><thead><tr><th>Файл</th><th>Объявление</th><th>Строк</th><th>Период</th><th>Расход, €</th><th>Расход, ₽</th><th>Заменит дней</th></tr></thead><tbody>'
        + res.files.map(function (f, i) {
          return '<tr><td>' + esc(f.fileName) + '</td><td><input type="text" class="tgname" id="tg-name-' + i + '" value="'
            + esc(f.adName || '') + '" maxlength="200"></td>'
            + (f.error ? '<td colspan="5" class="apierr">' + esc(ERR[f.error] || f.error) + '</td>'
              : '<td>' + f.count + (f.skipped ? ' <span class="t-sub">(+' + f.skipped + ' пропущено)</span>' : '') + '</td><td>'
                + dmy(f.from) + ' — ' + dmy(f.to) + '</td><td>' + nf.format(f.eur) + '</td><td>'
                + (f.rub == null ? '—' : nf.format(f.rub)) + '</td><td>' + (f.replaces || 0) + '</td>') + '</tr>';
        }).join('')
        + '</tbody></table><p class="apiacc__line">Итого: <b>' + nf.format(Math.round(tot * 100) / 100) + ' €</b></p>'
        + '<div class="apiacc__row"><button type="button" class="bar__btn" id="tg-recheck">Проверить ещё раз</button>'
        + '<button type="button" class="bar__btn tgsave" id="tg-save"' + (ok && res.rate ? '' : ' disabled') + '>Сохранить</button>'
        + '<button type="button" class="bar__btn" id="tg-cancel">Отмена</button></div>';
      d.getElementById('tg-recheck').addEventListener('click', preview);
      d.getElementById('tg-cancel').addEventListener('click', function () { files = []; box.innerHTML = ''; err.textContent = ''; });
      d.getElementById('tg-save').addEventListener('click', function (e) {
        e.target.disabled = true;
        err.textContent = '';
        post('', payload()).then(function () { if (opts.onChange) opts.onChange(); })
          .catch(function (x) { err.textContent = x.message; e.target.disabled = false; });
      });
    }
    function preview() {
      err.textContent = '';
      post('/preview', payload()).then(show).catch(function (x) { err.textContent = x.message; });
    }
    d.getElementById('tg-file').addEventListener('change', function (e) {
      var list = [].slice.call(e.target.files || []);
      e.target.value = '';
      if (!list.length) return;
      Promise.all(list.map(readText)).then(function (r) { files = r; box.innerHTML = ''; preview(); })
        .catch(function (x) { err.textContent = x.message; });
    });
  };
})(window, document);
