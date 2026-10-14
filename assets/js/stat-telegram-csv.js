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
    no_rate: 'нет переводов Telegram в € — курс не посчитать',
    ad_choice_required: 'выберите, к какому объявлению относится файл',
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
    /* Объявление файла без признака (ID в имени файла или «Ad:» в файле) выбирают из списка;
       «Новое объявление…» открывает поле названия. Файлам с признаком выбор не нужен. */
    function chosen(i) {
      var sel = d.getElementById('tg-ad-' + i);
      if (!sel) return null;
      if (sel.value === '__new') { var n = d.getElementById('tg-new-' + i); return n && n.value.trim() ? n.value.trim() : null; }
      return sel.value || null;
    }
    function payload() {
      return { files: files.map(function (f, i) { return { name: f.name, text: f.text, adName: chosen(i) }; }) };
    }
    function adCell(f, i, ads) {
      if (!f.needsChoice) {
        return '<b>' + esc(f.adName) + '</b><div class="t-sub">' + (f.keySource === 'ad_id' ? 'по ID ' + esc(f.adCode) + ' в имени файла'
          : 'по строке «Ad:» в файле') + '</div>';
      }
      // «Проверить ещё раз» возвращает сделанный выбор в adName — показываем его снова.
      var isNew = !!f.adName && ads.indexOf(f.adName) < 0;
      var hint = (f.similar || []).length ? '<div class="t-sub">дни и суммы совпадают с «' + esc(f.similar[0].adName) + '» ('
        + f.similar[0].days + ' дн.)</div>' : '';
      return '<select class="tgname" id="tg-ad-' + i + '" data-i="' + i + '"><option value="">— к какому объявлению относится файл? —</option>'
        + ads.map(function (a) { return '<option value="' + esc(a) + '"' + (a === f.adName ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('')
        + '<option value="__new"' + (isNew ? ' selected' : '') + '>Новое объявление…</option></select>'
        + '<input type="text" class="tgname" id="tg-new-' + i + '" maxlength="200" placeholder="Название нового объявления" value="'
        + (isNew ? esc(f.adName) : '') + '"' + (isNew ? '' : ' hidden') + '>'
        + '<div class="t-sub">в имени файла нет ID объявления — выберите вручную</div>' + hint;
    }
    function syncSave(res) {
      var btn = d.getElementById('tg-save');
      var ready = res.files.every(function (f, i) { return !f.error && (!f.needsChoice || chosen(i)); });
      btn.disabled = !(ready && res.rate);
    }
    function show(res) {
      var tot = res.files.reduce(function (s, f) { return s + (f.error || f.kind === 'stats' ? 0 : f.eur); }, 0);
      var KIND = { reports: 'расход (Reports)', stats: 'показы и клики (Statistics) — не расход' };
      var c = function (v) { return v == null ? '—' : nf.format(v); };
      box.innerHTML = '<p class="apiacc__line"><b>Предпросмотр</b> <span class="t-sub">— курс переводов '
        + (res.rate ? nf.format(res.rate.rate) + ' ₽ за 1 €' + (res.rate.provisional ? ' (предварительный курс, уточнить по счетам eLama)' : '') : 'не посчитан')
        + '; в сводке рубли пересчитываются по журналу переводов</span></p>'
        + '<table><thead><tr><th>Файл</th><th>Вид</th><th>Объявление</th><th>Дней</th><th>Период (UTC)</th><th>Показы</th><th>Клики</th><th>Расход, €</th><th>Расход, ₽</th><th>Заменит дней</th></tr></thead><tbody>'
        + res.files.map(function (f, i) {
          return '<tr><td>' + esc(f.fileName) + '</td><td class="t-sub">' + esc(KIND[f.kind] || '') + '</td><td>' + adCell(f, i, res.ads || []) + '</td>'
            + (f.error ? '<td colspan="7" class="apierr">' + esc(ERR[f.error] || f.error) + '</td>'
              : '<td>' + f.count + (f.skipped ? ' <span class="t-sub">(+' + f.skipped + ' пропущено)</span>' : '') + '</td><td>'
                + dmy(f.from) + ' — ' + dmy(f.to) + '</td><td>' + c(f.views) + '</td><td>' + c(f.clicks) + '</td><td>' + c(f.eur) + '</td><td>'
                + (f.rub == null ? '—' : nf.format(f.rub)) + '</td><td>' + (f.replaces || 0) + '</td>') + '</tr>';
        }).join('')
        + '</tbody></table><p class="apiacc__line">Итого расход: <b>' + nf.format(Math.round(tot * 100) / 100) + ' €</b> <span class="t-sub">— только файлы Reports; '
        + 'дни того же объявления заменяются, повторная загрузка итог не меняет</span></p>'
        + '<div class="apiacc__row"><button type="button" class="bar__btn" id="tg-recheck">Проверить ещё раз</button>'
        + '<button type="button" class="bar__btn tgsave" id="tg-save" disabled>Сохранить</button>'
        + '<button type="button" class="bar__btn" id="tg-cancel">Отмена</button></div>';
      box.querySelectorAll('select[id^="tg-ad-"]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          d.getElementById('tg-new-' + sel.dataset.i).hidden = sel.value !== '__new';
          syncSave(res);
        });
      });
      box.querySelectorAll('input[id^="tg-new-"]').forEach(function (inp) { inp.addEventListener('input', function () { syncSave(res); }); });
      syncSave(res);
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
