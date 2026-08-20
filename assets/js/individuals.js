/* =============================================================================
   individuals.js — раздел «Для физлиц» (/individuals/)
   -----------------------------------------------------------------------------
   Отвечает только за переключатель направлений (учёба / лечение / путешествия /
   другое). Форма заявки на этой странице — обычный #lead-form, его валидацию и
   отправку ведёт main.js (там же контракт бэкенда: name, phone, email, message
   обязательны и непусты).

   Связь табов с формой: при выборе таба подставляем то же направление в select
   формы, чтобы человек не выбирал его второй раз. Обратной связи нет — если он
   поменяет select руками, табы не трогаем.

   Без JS страница остаётся рабочей: все панели видимы (hidden проставляется
   отсюда), форма отправляется как обычно.
   ============================================================================= */
(function () {
  'use strict';

  var root = document.querySelector('[data-tabs]');
  if (!root) return;

  var buttons = [].slice.call(root.querySelectorAll('[role="tab"]'));
  var panels = [].slice.call(root.querySelectorAll('[role="tabpanel"]'));
  if (!buttons.length || !panels.length) return;

  var directionSelect = document.querySelector('[data-lead-topic]');

  function activate(id, focusTab) {
    buttons.forEach(function (btn) {
      var on = btn.getAttribute('aria-controls') === id;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;               /* по табам ходим стрелками, Tab уводит дальше */
      if (on && focusTab) btn.focus();
    });
    panels.forEach(function (panel) { panel.hidden = panel.id !== id; });

    /* Подставляем направление в форму, если такое значение в ней есть. */
    var btn = buttons.filter(function (b) { return b.getAttribute('aria-controls') === id; })[0];
    var value = btn && btn.getAttribute('data-direction');
    if (directionSelect && value) {
      var exists = [].slice.call(directionSelect.options).some(function (o) { return o.value === value; });
      if (exists) directionSelect.value = value;
    }
  }

  buttons.forEach(function (btn, i) {
    btn.addEventListener('click', function () {
      activate(btn.getAttribute('aria-controls'), false);
    });
    btn.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      var next = buttons[(i + step + buttons.length) % buttons.length];
      activate(next.getAttribute('aria-controls'), true);
    });
  });

  /* Кнопки «Оставить заявку» внутри панелей: выбрать направление и увести к форме. */
  document.querySelectorAll('[data-direction-cta]').forEach(function (link) {
    link.addEventListener('click', function () {
      var value = link.getAttribute('data-direction-cta');
      if (directionSelect && value) directionSelect.value = value;
    });
  });

  /* Стартовый таб: из хеша (#study и т.п.), иначе первый. */
  var fromHash = window.location.hash.replace('#', '');
  var initial = panels.filter(function (p) { return p.id === fromHash; })[0];
  activate(initial ? initial.id : panels[0].id, false);
}());
