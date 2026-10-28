/* Сворачиваемые блоки на /stat/ (Тати 2026-10-28): каждый блок с заголовком (h2 карточки
   или подзаголовок h3.adsh3 — «Внесённые данные», «По кампаниям» и т.п.) сворачивается
   нажатием на заголовок. Выбор запоминается в этом браузере.

   Блоки рисуют разные файлы, часть — после своих загрузок, поэтому разметку не трогаем:
   скрываем «тело» блока классом и пересчитываем после каждого изменения #content.
   Тело заголовка h2 в шапке карточки — всё, что в карточке после шапки; тело остальных
   заголовков — следующие соседи до заголовка того же или старшего уровня. */
(function (w, d) {
  'use strict';
  var KEY = 'stat_collapsed';
  // Длинные списки свёрнуты, пока их не раскрыли (Тати 2026-10-28, скриншот «Внесённые данные»).
  var DEFAULT_COLLAPSED = ['Внесённые данные'];
  var state;
  try { state = JSON.parse(w.localStorage.getItem(KEY) || 'null'); } catch (e) { state = null; }
  if (!state || typeof state !== 'object') {
    state = {};
    DEFAULT_COLLAPSED.forEach(function (k) { state[k] = true; });
  }
  function save() { try { w.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* приватный режим */ } }

  var root = d.getElementById('content');
  if (!root) return;

  function level(el) { return el.tagName === 'H2' ? 2 : 3; }

  function bodyOf(h) {
    var head = h.parentElement && h.parentElement.classList.contains('card__head') ? h.parentElement : null;
    var out = [];
    var el = (head || h).nextElementSibling;
    for (; el; el = el.nextElementSibling) {
      if (!head && el.matches('h2, h3.adsh3') && level(el) <= level(h)) break;
      out.push(el);
    }
    return out;
  }

  function keyOf(h) {
    if (!h.dataset.clpKey) h.dataset.clpKey = h.textContent.replace(/\s+/g, ' ').trim();
    return h.dataset.clpKey;
  }

  function prepare(h) {
    if (h.dataset.clpReady) return;
    var key = keyOf(h);
    h.dataset.clpReady = '1';
    h.classList.add('clp-head');
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '0');
    h.title = 'Свернуть или развернуть';
    var mark = d.createElement('span');
    mark.className = 'clp-mark';
    mark.setAttribute('aria-hidden', 'true');
    h.insertBefore(mark, h.firstChild);
    function toggle() { state[key] = !state[key]; save(); apply(); }
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  function apply() {
    var heads = root.querySelectorAll('h2, h3.adsh3');
    [].forEach.call(root.querySelectorAll('.clp-hidden'), function (el) { el.classList.remove('clp-hidden'); });
    [].forEach.call(heads, function (h) {
      prepare(h);
      var closed = !!state[keyOf(h)];
      h.setAttribute('aria-expanded', String(!closed));
      if (closed) bodyOf(h).forEach(function (el) { el.classList.add('clp-hidden'); });
    });
  }

  // Пересчёт сразу в колбэке наблюдателя (он и так собирает изменения пачкой). Через
  // requestAnimationFrame нельзя: в фоновой вкладке он не срабатывает до её открытия.
  new MutationObserver(apply).observe(root, { childList: true, subtree: true });
  apply();
})(window, document);
