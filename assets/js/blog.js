/* Фильтр ленты блога по рубрикам (Тати 2026-10-29). Без скрипта видна вся лента,
   поэтому кнопки в разметке скрыты и показываются здесь. Рубрику можно открыть
   ссылкой /blog/#news — так ведут хлебные крошки статьи. */
(function (d) {
  'use strict';
  var bar = d.querySelector('[data-blog-filter]');
  var cards = d.querySelectorAll('#blog-feed [data-cat]');
  if (!bar || !cards.length) return;
  var buttons = bar.querySelectorAll('button');

  function show(cat) {
    [].forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', String(b.dataset.cat === cat)); });
    [].forEach.call(cards, function (c) { c.hidden = !!cat && c.dataset.cat !== cat; });
  }

  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    show(b.dataset.cat);
    history.replaceState(null, '', b.dataset.cat ? '#' + b.dataset.cat : location.pathname);
  });

  var start = location.hash.slice(1);
  var known = [].some.call(buttons, function (b) { return b.dataset.cat === start; });
  show(known ? start : '');
  bar.hidden = false;
})(document);
