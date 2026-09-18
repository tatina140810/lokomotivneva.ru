/* =============================================================================
   v2.js — расчёт платежа и лента курсов на главной. Библиотек нет.
   -----------------------------------------------------------------------------
   Правила расчёта — ровно те же, что в LokomotivPos (app.lokomotivneva.ru):
     • курс      — profinance.ru «Курсы валют к рублю Forex», колонка ПРОДАЖА;
     • наценка   — по объёму платежа в долларовом эквиваленте:
                   до 50 000 $ → +1,7 %, 50 000–200 000 $ → +1,5 %, свыше → +1,3 %
                   (backend/src/../callTreeCalc.js);
     • агент     — 0,3 % от рублёвой суммы платежа, НДС включён;
     • банк      — комиссия SWIFT = MEDIAN(минимум; сумма × ставка; максимум)
                   в валюте платежа по тарифу Элдик (РСК); свыше 150 000 $ —
                   бесплатно (backend/src/lib/bankFee.js).
   Курс и тарифы подтягиваются из LokomotivPos (RATES_ENDPOINT ниже): менеджер в
   карте звонка и калькулятор на сайте считают по одним и тем же цифрам. Значения
   ниже — запасные, на случай, если API недоступен.
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
  var SWIFT_DEFAULT_PCT = 0.2;
  /* Тариф банка-исполнителя в валюте платежа: ставка и границы (Тати 17.09.2026).
     Считаем по банку Элдик (РСК) — он у нас по умолчанию, пока клиент не назвал
     другой; в системе тарифы обоих банков живут в backend/src/lib/bankFee.js.
     Валюта вне таблицы — чистые 0,2 % без ограничителей. */
  var SWIFT_TARIFFS = {
    USD: { pct: 0.2, min: 50, max: 150 },
    EUR: { pct: 0.2, min: 25, max: 150 },
    CNY: { pct: 0.2, min: 150, max: 1000 },
    AED: { pct: 0.2, min: 200, max: 400 },
    KZT: { pct: 0.1, min: 2000, max: 5000 }
  };
  /* Платёж крупнее порога — SWIFT за наш счёт (в долларовом эквиваленте). */
  var SWIFT_FREE_FROM_USD = 150000;

  /* Валюты по направлениям — как в карте звонка оператора
     (backend/src/lib/paymentDirections.js). Пустой список = согласуем с менеджером,
     тогда показываем все валюты. Значения ниже запасные: основные приходят из API. */
  var DIRECTIONS = {
    china:  ['CNY', 'USD'],
    turkey: ['USD'],
    uae:    ['AED', 'USD'],
    europe: ['EUR'],
    other:  []
  };
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

  /* Валюта и направление связаны: в Китай мы не платим в евро, в Европу — только
     в евро. Поэтому при выборе направления оставляем в списке лишь те валюты,
     которыми мы туда платим (Тати 17.09.2026). */
  var ALL_CCY = null;
  function syncCurrencies() {
    if (!express) return;
    var curEl = express.querySelector('[data-express-currency]');
    var routeEl = express.querySelector('[data-express-route]');
    if (!curEl || !routeEl) return;
    if (!ALL_CCY) {
      ALL_CCY = [].slice.call(curEl.options).map(function (o) {
        return { value: o.value, text: o.textContent };
      });
    }
    var allowed = DIRECTIONS[routeEl.value];
    var list = (allowed && allowed.length)
      ? ALL_CCY.filter(function (o) { return allowed.indexOf(o.value) >= 0; })
      : ALL_CCY;
    var keep = curEl.value;
    curEl.innerHTML = '';
    list.forEach(function (o) {
      var opt = d.createElement('option');
      opt.value = o.value; opt.textContent = o.text;
      curEl.appendChild(opt);
    });
    /* Если выбранная валюта в это направление не идёт — переключаем на первую
       подходящую, иначе расчёт показал бы цену платежа, которого не будет. */
    curEl.value = list.some(function (o) { return o.value === keep; }) ? keep : (list[0] || {}).value;
    var note = express.querySelector('[data-express-ccy-note]');
    if (note) {
      note.textContent = (allowed && allowed.length)
        ? 'В это направление платим в: ' + allowed.join(', ')
        : 'Направление согласуем с менеджером — валюту уточним при обращении.';
    }
  }

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

    /* SWIFT: ставка банка в валюте платежа, зажатая тарифом, затем в рубли.
       Свыше порога комиссию берём на себя — в расчёте это ноль. */
    var t = SWIFT_TARIFFS[cur];
    var swiftCur = sum * ((t ? t.pct : SWIFT_DEFAULT_PCT) / 100);
    if (t) swiftCur = Math.min(Math.max(swiftCur, t.min), t.max);
    var swiftFree = usdEquivalent > SWIFT_FREE_FROM_USD;
    if (swiftFree) swiftCur = 0;
    var swift = swiftCur * rate;

    set('base', nf(base, 2) + ' ₽');
    set('fee', nf(fee, 2) + ' ₽');
    set('swift', swiftFree ? 'бесплатно' : nf(swift, 2) + ' ₽ (' + nf(swiftCur, 2) + ' ' + cur + ')');
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
    express.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.hasAttribute && t.hasAttribute('data-express-route')) syncCurrencies();
      setTerm(); recalc();
    });
    setTerm();
    syncCurrencies();
    recalc();
  }

  /* --------------- Обновление котировок из системы ------------------------
     Тянем при загрузке и раз в 5 минут, пока вкладка открыта: столько же живёт
     кеш котировок на сервере, чаще смысла нет.                              */
  function pullRates() {
    var ctrl = w.AbortController ? new AbortController() : null;
    var stop = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
    fetch(RATES_ENDPOINT, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        clearTimeout(stop);
        if (!data) return;
        if (data.rates) {
          ['USD', 'EUR', 'CNY', 'AED'].forEach(function (c) {
            if (data.rates[c]) market[c] = Number(data.rates[c]);
          });
          if (!data.rates.AED && market.USD) market.AED = market.USD / AED_PER_USD;
        }
        /* Правила расчёта тоже берём из системы: поменяли тариф в LokomotivPos —
           сайт считает по-новому без правки этого файла. */
        if (data.markup && data.markup.length) {
          TIERS = data.markup.map(function (t) {
            return { upTo: t.upTo == null ? Infinity : Number(t.upTo), pct: Number(t.pct) };
          });
        }
        if (typeof data.agentFeePct === 'number') AGENT_FEE_PCT = data.agentFeePct;
        if (data.directions && data.directions.length) {
          var dirs = {};
          data.directions.forEach(function (r) { dirs[r.id] = r.currencies || []; });
          DIRECTIONS = dirs;
          syncCurrencies();
        }
        if (data.swift) {
          var bank = data.swift.defaultBank;
          var table = data.swift.tariffs && data.swift.tariffs[bank];
          if (table) {
            var next = {};
            Object.keys(table).forEach(function (c) {
              if (c.indexOf('_') >= 0) return;       // USD_DIRECT — только для менеджера
              next[c] = { pct: Number(table[c].pct), min: Number(table[c].min), max: Number(table[c].max) };
            });
            if (Object.keys(next).length) SWIFT_TARIFFS = next;
          }
          if (typeof data.swift.freeFromUsd === 'number') SWIFT_FREE_FROM_USD = data.swift.freeFromUsd;
        }
        paintTicker();
        recalc();
      })
      .catch(function () { clearTimeout(stop); /* остаются значения из разметки */ });
  }
  if (w.fetch) {
    pullRates();
    setInterval(pullRates, 5 * 60 * 1000);
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


  /* ------------------- Живая печать в первом экране -----------------------
     Видео грузим только на широких экранах и только когда страница уже
     отрисована: на телефоне его не показываем вовсе (там блок скрыт), а на
     десктопе оно не конкурирует за канал с текстом и калькулятором.        */
  (function () {
    var v = d.querySelector('[data-hero-video]');
    if (!v) return;
    if (innerWidth < 1001) return;                       // на узком экране печати нет
    if (w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var start = function () {
      v.muted = true;                       // Safari стартует только беззвучное
      v.src = v.getAttribute('data-hero-video');
      v.load();                             // без этого при preload="none" play() отклоняется
      var go = function () {
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () {
          /* Автозапуск заблокирован (энергосбережение, настройки браузера).
             Пробуем ещё раз при первом действии человека на странице. */
          var once = function () {
            v.play().catch(function () {});
            d.removeEventListener('pointerdown', once);
            d.removeEventListener('keydown', once);
            d.removeEventListener('scroll', once);
          };
          d.addEventListener('pointerdown', once, { once: true });
          d.addEventListener('keydown', once, { once: true });
          d.addEventListener('scroll', once, { once: true, passive: true });
        });
      };
      if (v.readyState >= 2) go();
      else v.addEventListener('loadeddata', go, { once: true });
    };
    if ('requestIdleCallback' in w) requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 1200);
  })();
})(window, document);
