/* Страница «Партнёрам» (Тати 2026-10-14): расчёт вознаграждения партнёра.
   Объём платежей клиента в месяц × 0,1% — в месяц, × 6 — за 6 месяцев.
   Пустое поле или 0 — «—». Формат как в калькуляторе на главной: «10 000 ₽». */
(function () {
  'use strict';
  var box = document.querySelector('[data-partner-calc]');
  if (!box) return;
  var input = box.querySelector('[data-partner-amount]');
  var month = box.querySelector('[data-partner-month]');
  var total = box.querySelector('[data-partner-total]');
  var RATE = 0.001;
  var MONTHS = 6;
  var rub = function (v) { return Math.round(v).toLocaleString('ru-RU') + ' ₽'; };

  function recalc() {
    var digits = (input.value || '').replace(/\D+/g, '').slice(0, 15);
    input.value = digits ? Number(digits).toLocaleString('ru-RU') : '';
    var sum = Number(digits || 0);
    if (!sum) { month.textContent = '—'; total.textContent = '—'; return; }
    month.textContent = rub(sum * RATE);
    total.textContent = rub(sum * RATE * MONTHS);
  }
  input.addEventListener('input', recalc);
  recalc();
})();
