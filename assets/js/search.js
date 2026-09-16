/* =============================================================================
   search.js — поиск по страницам сайта (навигация, а не полнотекстовый поиск)

   Сайт статический, бэкенда нет. Поэтому ищем по индексу assets/search-index.json:
   заголовок, описание, заголовки секций и синонимы каждой страницы. Индекс
   собирается скриптом build-search-index.py — после правки текстов на
   страницах его нужно пересобрать, иначе выдача отстанет от сайта.

   Окно поиска создаётся скриптом при первом открытии, индекс подгружается
   тогда же: страницам, где поиском не воспользовались, он ничего не стоит.
   ============================================================================= */
(function () {
  'use strict';

  var openers = Array.prototype.slice.call(document.querySelectorAll('[data-search-open]'));
  if (!openers.length) return;

  var INDEX_URL = '/assets/search-index.json';

  /* Что показывать при пустом поле: не первые страницы индекса (он отсортирован
     по адресу, и наверх всплывают «О компании» и «Блог»), а разделы, ради
     которых на сайт заходят. Порядок — как в шапке. */
  var QUICK = ['/payments/', '/logistics/', '/how-it-works/', '/docs/', '/trust/', '/contacts/'];
  var index = null;        // массив страниц; null — ещё не загружали
  var loading = null;      // промис загрузки, чтобы не тянуть индекс дважды
  var modal = null;        // разметка окна создаётся один раз, при первом открытии
  var input, list, status;
  var results = [];        // то, что сейчас в выдаче
  var active = -1;         // подсвеченная строка (стрелками)
  var lastFocused = null;  // куда вернуть фокус после закрытия

  /* --- Нормализация: регистр, ё→е, дефисы. Для 23 страниц этого хватает,
         стемминг и морфология здесь были бы стрельбой из пушки. --- */
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9%\s]/gi, ' ');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* --- Оценка страницы по запросу ---------------------------------------
     Слова запроса ищем по отдельности: «оплата китай» должна находить
     страницу про Китай, даже если такой пары слов на ней нет. Совпадение в
     заголовке весит больше, чем в описании и заголовках секций. */
  function score(item, words) {
    var title = norm(item.title);
    var desc = norm(item.desc);
    var heads = norm((item.heads || []).join(' '));
    var tags = norm((item.tags || []).join(' '));
    var total = 0;

    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var hit = 0;
      if (title.indexOf(w) === 0) hit = 100;          // заголовок начинается со слова
      else if (title.indexOf(w) > -1) hit = 60;
      if (tags.indexOf(w) > -1) hit = Math.max(hit, 50);
      if (heads.indexOf(w) > -1) hit = Math.max(hit, 30);
      if (desc.indexOf(w) > -1) hit = Math.max(hit, 20);
      if (!hit) return 0;                             // слово не найдено — страница не подходит
      total += hit;
    }
    return total;
  }

  function search(query) {
    var words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length || !index) return [];
    return index
      .map(function (item) { return { item: item, s: score(item, words) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 8)
      .map(function (r) { return r.item; });
  }

  /* --- Описание в выдаче: режем по границе слова, а не по символу ---
         иначе строка обрывается на «оплата у» и выглядит как ошибка. */
  function trim(text, max) {
    text = String(text || '');
    if (text.length <= max) return text;
    var cut = text.slice(0, max);
    var space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '') + '…';
  }

  /* --- Подсветка найденного в строке выдачи --- */
  function mark(text, words) {
    var out = esc(text);
    words.forEach(function (w) {
      if (w.length < 2) return;
      out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
        '<mark>$1</mark>');
    });
    return out;
  }

  function render(query) {
    var words = norm(query).split(/\s+/).filter(Boolean);
    results = search(query);
    active = results.length ? 0 : -1;

    if (!query.trim()) {
      /* Пустой запрос — не пустое окно: показываем основные разделы,
         чтобы поиском можно было пользоваться как оглавлением сайта. */
      results = index ? QUICK.map(function (u) {
        return index.filter(function (it) { return it.url === u; })[0];
      }).filter(Boolean) : [];
      active = -1;
      status.textContent = index ? 'Основные разделы' : 'Загружаем список страниц…';
    } else if (!results.length) {
      status.textContent = 'Ничего не нашлось. Попробуйте «платежи», «Китай», «таможня» или позвоните нам.';
    } else {
      status.textContent = results.length === 1 ? 'Одна страница' : 'Страниц: ' + results.length;
    }

    list.innerHTML = results.map(function (it, i) {
      return '' +
        '<li>' +
          '<a class="search__hit' + (i === active ? ' is-active' : '') + '" href="' + esc(it.url) + '">' +
            '<span class="search__hit-title">' + mark(it.title, words) + '</span>' +
            '<span class="search__hit-desc">' + mark(trim(it.desc, 110), words) + '</span>' +
            '<span class="search__hit-url">' + esc(it.url) + '</span>' +
          '</a>' +
        '</li>';
    }).join('');
  }

  function loadIndex() {
    if (loading) return loading;
    /* cache: 'no-cache' — не «не кэшировать», а «перед выдачей из кэша
       спросить сервер». Индекс маленький, зато после пересборки выдача
       обновляется сразу: в имени файла версии нет, в отличие от js и css. */
    loading = fetch(INDEX_URL, { credentials: 'same-origin', cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) { index = data; })
      .catch(function () {
        index = [];
        status.textContent = 'Поиск сейчас недоступен. Разделы есть в меню и в подвале страницы.';
      });
    return loading;
  }

  function build() {
    modal = document.createElement('div');
    modal.className = 'search';
    modal.id = 'search';
    modal.hidden = true;
    modal.innerHTML = '' +
      '<div class="search__backdrop" data-search-close></div>' +
      '<div class="search__dialog" role="dialog" aria-modal="true" aria-label="Поиск по сайту">' +
        '<div class="search__field">' +
          '<svg class="icon search__icon" aria-hidden="true" viewBox="0 0 24 24">' +
            '<use href="/assets/sprite.svg#i-search"></use></svg>' +
          '<input class="search__input" type="search" autocomplete="off" spellcheck="false" ' +
            'placeholder="Платежи в Китай, таможня, документы…" aria-label="Что ищем">' +
          '<button class="search__close" type="button" data-search-close aria-label="Закрыть поиск">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
          '</button>' +
        '</div>' +
        '<p class="search__status" role="status" aria-live="polite"></p>' +
        '<ul class="search__list"></ul>' +
      '</div>';
    document.body.appendChild(modal);

    input = modal.querySelector('.search__input');
    list = modal.querySelector('.search__list');
    status = modal.querySelector('.search__status');

    input.addEventListener('input', function () { render(input.value); });

    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-search-close]')) close();
    });

    /* Стрелки ходят по выдаче, Enter открывает подсвеченную страницу.
       Обычный Tab и клик тоже работают — это не замена фокусу, а ускорение. */
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        var hits = list.querySelectorAll('.search__hit');
        hits.forEach(function (el, i) { el.classList.toggle('is-active', i === active); });
        if (hits[active]) hits[active].scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter' && active > -1 && results[active]) {
        e.preventDefault();
        location.href = results[active].url;
      }
    });
  }

  function open() {
    if (!modal) build();
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-search-open');
    input.value = '';
    render('');
    input.focus();
    if (!index) loadIndex().then(function () { render(input.value); });
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('is-search-open');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  openers.forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); open(); });
  });

  /* Ctrl/Cmd+K — привычный способ открыть поиск; «/» не занимаем, чтобы
     не мешать вводу в формах. Esc закрывает и когда фокус ушёл из окна. */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      modal && !modal.hidden ? close() : open();
    }
    if (e.key === 'Escape') close();
  });
})();
