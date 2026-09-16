/* =============================================================================
   v2.js — расчёт платежа и лента курсов на главной. Библиотек нет.
   -----------------------------------------------------------------------------
   Правила расчёта — ровно те же, что в LokomotivPos (app.lokomotivneva.ru):
     • курс      — profinance.ru «Курсы валют к рублю Forex», колонка ПРОДАЖА;
     • наценка   — по объёму платежа в долларовом эквиваленте:
                   до 50 000 $ → +1,7 %, 50 000–200 000 $ → +1,5 %, свыше → +1,3 %
                   (backend/src/../callTreeCalc.js);
     • агент     — 0,3 % от рублёвой суммы платежа, НДС включён;
     • банк      — комиссия SWIFT = MEDIAN(минимум; сумма × 0,2 %; максимум)
                   в валюте платежа (backend/src/lib/bankFee.js).
   Источник курса открытого API не имеет, поэтому котировки проставлены в
   разметке и обновляются через API LokomotivPos, когда публичный маршрут
   будет включён (RATES_ENDPOINT ниже). Нет ответа — считаем по разметке.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var RATES_ENDPOINT = 'https://app.lokomotivneva.ru/api/public/fx-rates';

  /* Котировки «Продажа» БЕЗ наценки. Обновляются из API; здесь — запасные
     значения на случай, если источник недоступен (profinance, 16.09.2026 19:00). */
  var market = { USD: 84.358, EUR: 97.331, CNY: 12.5795, AED: 84.358 / 3.6725 };

  /* Дирхама ОАЭ нет в котировках источника: он с 1997 года жёстко привязан
     к доллару по 3,6725 AED за 1 $ (курс ЦБ РФ даёт ровно это соотношение),
     поэтому считаем его кросс-курсом от доллара. */
  var AED_PER_USD = 3.6725;

  /* Наценка к рыночному курсу по объёму сделки в долларах. */
  var TIERS = [
    { upTo: 50000, pct: 1.7 },
    { upTo: 200000, pct: 1.5 },
    { upTo: Infinity, pct: 1.3 }
  ];
  var AGENT_FEE_PCT = 0.3;
  var SWIFT_PCT = 0.2;
  /* Тариф банка-исполнителя: [минимум, максимум] в валюте платежа.
     Валюта вне таблицы — чистые 0,2 % без ограничителей. */
  var SWIFT_LIMITS = { USD: [50, 100], EUR: [25, 100], CNY: [160, 1100], AED: [120, 600] };
  var TICKER_MARKUP = 1.5;   // в бегущей строке показываем средний тир

  var nf = function (v, dg) {
    return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: dg, maximumFractionDigits: dg });
  };
  var tierFor = function (usd) {
    for (var i = 0; i < TIERS.length; i++) if (usd < TIERS[i].upTo) return TIERS[i];
    return TIERS[TIERS.length - 1];
  };

  /* ------------------------- Лента курсов --------------------------------- */
  function paintTicker() {
    d.querySelectorAll('[data-rate]').forEach(function (el) {
      var base = market[el.getAttribute('data-rate')];
      if (!base) return;
      var val = el.querySelector('.rate__val');
      if (val) val.textContent = nf(base * (1 + TICKER_MARKUP / 100), 4) + ' ₽';
    });
  }

  /* --------------------------- Расчёт ------------------------------------- */
  var express = d.querySelector('[data-express]');

  function recalc() {
    if (!express) return;
    var amountEl = express.querySelector('[data-express-amount]');
    var curEl = express.querySelector('[data-express-currency]');
    var cur = curEl ? curEl.value : 'USD';
    var rateMarket = market[cur];

    var digits = (amountEl.value || '').replace(/\D+/g, '');
    if (digits) amountEl.value = Number(digits).toLocaleString('ru-RU');
    var sum = parseInt(digits || '0', 10);

    var set = function (name, text) {
      var el = express.querySelector('[data-express-' + name + ']');
      if (el) el.textContent = text;
    };

    if (!rateMarket) { set('rate', 'расчёт сделает менеджер'); return; }

    /* Тир наценки — по долларовому эквиваленту суммы, как в системе.
       Пока сумма не введена, показываем средний тир (+1,5%) — тот же курс,
       что бежит в ленте наверху, иначе цифры на одном экране расходятся. */
    var usdEquivalent = market.USD ? (sum * rateMarket) / market.USD : 0;
    var tier = sum ? tierFor(usdEquivalent) : { pct: TICKER_MARKUP };
    var rate = rateMarket * (1 + tier.pct / 100);

    /* Процент наценки в интерфейсе не показываем (Тати, 16.09.2026) —
       он уже учтён в самом курсе. */
    set('rate', nf(rate, 4) + ' ₽');

    if (!sum) { ['base', 'fee', 'swift', 'total'].forEach(function (k) { set(k, '—'); }); return; }

    var base = sum * rate;                        // рубли по курсу с наценкой
    var fee = base * (AGENT_FEE_PCT / 100);       // вознаграждение агента 0,3 %

    /* SWIFT: 0,2 % в валюте платежа, зажатые тарифом банка, затем в рубли. */
    var swiftCur = sum * (SWIFT_PCT / 100);
    var lim = SWIFT_LIMITS[cur];
    if (lim) swiftCur = Math.min(Math.max(swiftCur, lim[0]), lim[1]);
    var swift = swiftCur * rate;

    set('base', nf(base, 2) + ' ₽');
    set('fee', nf(fee, 2) + ' ₽');
    set('swift', nf(swift, 2) + ' ₽ (' + nf(swiftCur, 2) + ' ' + cur + ')');
    set('total', nf(base + fee + swift, 2) + ' ₽');
  }

  /* Направления — из общего конфига сайта, чтобы срок не разъезжался с блоком
     «Подберём условия» ниже по странице. */
  if (express) {
    var routeSel = express.querySelector('[data-express-route]');
    var cfg = (w.LOKO && w.LOKO.qualify) || null;
    if (cfg && routeSel && !routeSel.options.length) {
      cfg.routes.forEach(function (r) {
        var o = d.createElement('option');
        o.value = r.id; o.textContent = r.label;
        routeSel.appendChild(o);
      });
    }
    var setTerm = function () {
      if (!cfg || !routeSel) return;
      var route = cfg.routes.filter(function (r) { return r.id === routeSel.value; })[0] || cfg.routes[0];
      var el = express.querySelector('[data-express-term]');
      if (el) el.textContent = route.term;
    };
    express.addEventListener('input', function () { recalc(); });
    express.addEventListener('change', function () { setTerm(); recalc(); });
    setTerm();
    recalc();
  }

  /* --------------- Обновление котировок из системы ------------------------ */
  if (w.fetch) {
    var ctrl = w.AbortController ? new AbortController() : null;
    var stop = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
    fetch(RATES_ENDPOINT, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        clearTimeout(stop);
        if (!data || !data.rates) return;
        ['USD', 'EUR', 'CNY', 'AED'].forEach(function (c) {
          if (data.rates[c]) market[c] = Number(data.rates[c]);
        });
        if (!data.rates.AED && market.USD) market.AED = market.USD / AED_PER_USD;
        paintTicker();
        recalc();
      })
      .catch(function () { clearTimeout(stop); /* остаются значения из разметки */ });
  }

  /* --------------------------- Счётчики ----------------------------------- */
  var counters = [].slice.call(d.querySelectorAll('[data-count-to]'));
  var reducedMotion = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (counters.length && !reducedMotion && w.requestAnimationFrame) {
    var run = function (el) {
      var to = parseFloat(el.getAttribute('data-count-to'));
      var t0 = performance.now(), dur = 900;
      var tick = function (t) {
        var k = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    var fired = false;
    var maybe = function () {
      if (fired) return;
      var band = counters[0].closest('section');
      if (!band) return;
      var r = band.getBoundingClientRect();
      if (r.top < innerHeight * 0.9 && r.bottom > 0) { fired = true; counters.forEach(run); }
    };
    maybe();
    addEventListener('scroll', maybe, { passive: true });
    addEventListener('resize', maybe, { passive: true });
  }

})(window, document);
