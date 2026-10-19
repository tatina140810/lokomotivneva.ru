/* =============================================================================
   v2.js — расчёт платежа и лента курсов на главной. Библиотек нет.
   -----------------------------------------------------------------------------
   Правила расчёта — ровно те же, что в LokomotivPos (app.lokomotivneva.ru):
     • курс      — ориентировочный курс по тарифу субагента: profinance + коэффициент
                   по объёму (объём — в долларовом эквиваленте платежа;
                   backend/src/../callTreeCalc.js). Точный курс фиксирует субагент
                   в Поручении;
     • агент     — 0,3 % от рублёвой суммы платежа, НДС включён;
     • SWIFT     — комиссия банка за перевод (Тати 2026-10-15, как в кабинете клиента):
                   процент от суммы платежа, но не меньше минимума и не больше максимума,
                   в валюте платежа; в рубли — по тому же курсу. Банк — по умолчанию
                   системы (Элдик/РСК); от 150 000 $ в эквиваленте — бесплатно.
                   Тарифы — backend/src/lib/bankFee.js, приходят из API.
   Курс и тарифы подтягиваются из LokomotivPos (RATES_ENDPOINT ниже): менеджер в
   карте звонка и калькулятор на сайте считают по одним и тем же цифрам. Значения
   ниже — запасные, на случай, если API недоступен.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var RATES_ENDPOINT = 'https://app.lokomotivneva.ru/api/public/fx-rates';

  /* Котировки profinance «Продажа» без коэффициента по объёму. Обновляются из API; здесь — запасные
     значения на случай, если источник недоступен (profinance, 16.09.2026 19:00). */
  var market = { USD: 84.358, EUR: 97.331, CNY: 12.5795, AED: 84.358 / 3.6725 };

  /* Дирхама ОАЭ нет в котировках источника: он с 1997 года жёстко привязан
     к доллару по 3,6725 AED за 1 $ (курс ЦБ РФ даёт ровно это соотношение),
     поэтому считаем его кросс-курсом от доллара. */
  var AED_PER_USD = 3.6725;

  /* Коэффициент по объёму сделки в долларах (тариф субагента). */
  var TIERS = [
    { upTo: 50000, pct: 1.7 },
    { upTo: 200000, pct: 1.5 },
    { upTo: Infinity, pct: 1.3 }
  ];
  var AGENT_FEE_PCT = 0.3;

  /* Комиссия банка за SWIFT — запасные тарифы Элдика (РСК), основные приходят из API. */
  var SWIFT = {
    bank: 'rsk',
    freeFromUsd: 150000,
    tariffs: { rsk: {
      USD: { pct: 0.2, min: 50, max: 150 },  EUR: { pct: 0.2, min: 25, max: 150 },
      CNY: { pct: 0.2, min: 150, max: 1000 }, AED: { pct: 0.2, min: 200, max: 400 },
      KZT: { pct: 0.1, min: 2000, max: 5000 }, RUB: { pct: 0.2, min: 200, max: 1000 }
    } }
  };
  /* MEDIAN(минимум; сумма × ставка; максимум) — как в таблице «Платежи» и в кабинете.
     Результат — в центах валюты (целое число), округление до 0,01 вверх от половины. */
  var swiftFeeCents = function (sum, cur) {
    var t = (SWIFT.tariffs[SWIFT.bank] || {})[cur] || { pct: 0.2 };
    var v = divHalfUp(BigInt(sum) * BigInt(Math.round(t.pct * 1000)), BigInt(1000)); // сумма × % → центы
    if (t.min != null) { var mn = BigInt(Math.round(t.min * 100)); if (v < mn) v = mn; }
    if (t.max != null) { var mx = BigInt(Math.round(t.max * 100)); if (v > mx) v = mx; }
    return v;
  };

  /* Деньги — целыми числами (BigInt), без float (Тати 2026-10-19): раньше расчёт шёл по
     неокруглённому курсу, а на экране курс с 4 знаками — ручная проверка не сходилась
     на копейки. Теперь порядок такой же, как при проверке на калькуляторе:
       курс → 4 знака; платёж = сумма × курс → копейки; вознаграждение = платёж × 0,3 %
       → копейки; SWIFT в валюте → 0,01, × курс → копейки; итог = сумма округлённых строк.
     Округление математическое (половина — вверх). */
  /* BigInt вызываем функцией, без литералов 100n: на совсем старом браузере литерал —
     синтаксическая ошибка всего файла (пропала бы и лента курсов), а так сломается
     только расчёт. */
  function divHalfUp(a, b) { return (a * BigInt(2) + b) / (b * BigInt(2)); }  // a ≥ 0, b > 0
  function roundRate4(rate) {                                    // курс в 1/10000 рубля
    return BigInt(Math.round(Number((rate * 10000).toPrecision(15))));
  }
  function expressMoney(sum, rate4, feePct, swiftCents) {
    var base = divHalfUp(BigInt(sum) * rate4, BigInt(100));                         // копейки
    var fee = divHalfUp(base * BigInt(Math.round(feePct * 1000)), BigInt(100000));  // копейки
    var swift = divHalfUp(swiftCents * rate4, BigInt(10000));                       // копейки
    return { base: base, fee: fee, swift: swift, total: base + fee + swift };
  }
  w.LOKO_EXPRESS_MONEY = expressMoney;  // для ручной проверки расчёта из консоли

  /* Валюты по направлениям — как в карте звонка оператора
     (backend/src/lib/paymentDirections.js). Пустой список = согласуем с менеджером,
     тогда показываем все валюты. Значения запасные: основные приходят из API.
     В Турцию платим только долларами (Тати 2026-09-18). */
  var DIRECTIONS = {
    china:  ['CNY', 'USD'],
    turkey: ['USD'],
    uae:    ['AED', 'USD'],
    europe: ['EUR'],
    other:  []
  };
  var TICKER_MARKUP = 1.5;   // в бегущей строке показываем средний коэффициент
  /* Время котировки «ЧЧ:ММ» по Москве — из ответа API (поле time, его даёт profinance).
     Пока ответа нет — null: на запасных значениях время не известно. */
  var rateTime = null;

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

    if (!rateMarket) {
      set('rate', 'расчёт сделает менеджер');
      var rtNo = express.querySelector('[data-express-rate-time]');
      if (rtNo) rtNo.hidden = true;
      return;
    }

    /* Коэффициент по объёму — по долларовому эквиваленту суммы, как в системе.
       Пока сумма не введена, показываем средний коэффициент — тот же курс,
       что бежит в ленте наверху, иначе цифры на одном экране расходятся. */
    var usdEquivalent = market.USD ? (sum * rateMarket) / market.USD : 0;
    var tier = sum ? tierFor(usdEquivalent) : { pct: TICKER_MARKUP };
    /* Курс сразу округляем до 4 знаков — по нему и показываем, и считаем. */
    var rate4 = roundRate4(rateMarket * (1 + tier.pct / 100));

    /* Коэффициент по объёму в интерфейсе не показываем (Тати, 16.09.2026) —
       он уже учтён в самом курсе. */
    set('rate', nf(Number(rate4) / 10000, 4) + ' ₽');
    /* Время котировки из источника (profinance, МСК), а не часы браузера (Тати 2026-10-19).
       Нет времени (источник недоступен, запасные значения) — подпись не показываем. */
    var rt = express.querySelector('[data-express-rate-time]');
    if (rt) { rt.hidden = !rateTime; rt.textContent = rateTime ? 'ориентировочно, на ' + rateTime + ' МСК' : ''; }

    if (!sum) { ['base', 'fee', 'swift', 'total'].forEach(function (k) { set(k, '—'); }); return; }

    /* Комиссия банка за SWIFT (Тати 2026-10-15): в валюте платежа, в рубли — по тому
       же курсу; крупный платёж (от 150 000 $ в эквиваленте) — бесплатно. */
    var free = usdEquivalent >= SWIFT.freeFromUsd;
    var swiftCents = free ? BigInt(0) : swiftFeeCents(sum, cur);
    var m = expressMoney(sum, rate4, AGENT_FEE_PCT, swiftCents);  // всё в копейках
    var rub = function (k) { return nf(Number(k) / 100, 2) + ' ₽'; };

    set('base', rub(m.base));
    set('fee', rub(m.fee));
    set('swift', free ? 'бесплатно' : nf(Number(swiftCents) / 100, 2) + ' ' + cur + ' ≈ ' + rub(m.swift));
    set('total', rub(m.total));
  }

  /* Направления — из общего конфига сайта, чтобы срок не разъезжался с блоком
     «Подберём условия» ниже по странице. */
  if (express) {
    var routeSel = express.querySelector('[data-express-route]');
    var cfg = (w.LOKO && w.LOKO.qualify) || null;
    /* Выпадающий список направлений заменён кнопками (Тати 2026-09-29): кнопки
       в разметке, выбранное направление пишем в скрытое поле data-express-route —
       остальной расчёт читает его, как раньше читал select. */
    var routeBtns = express.querySelector('[data-express-routes]');
    if (routeBtns && routeSel) {
      routeBtns.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-route]') : null;
        if (!btn || btn.getAttribute('aria-pressed') === 'true') return;
        routeSel.value = btn.getAttribute('data-route');
        [].forEach.call(routeBtns.querySelectorAll('[data-route]'), function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        syncCurrencies(); setTerm(); recalc(); calcGoal();
      });
    }
    var setTerm = function () {
      if (!cfg || !routeSel) return;
      var route = cfg.routes.filter(function (r) { return r.id === routeSel.value; })[0] || cfg.routes[0];
      var el = express.querySelector('[data-express-term]');
      if (el) el.textContent = route.term;
    };
    /* Цель VK «calc_submit». Кнопки у калькулятора нет — он считает на лету,
       поэтому цель ставим один раз за просмотр, когда посетитель сам получил
       итог и остановился на 1,5 с: иначе засчитали бы первую набранную цифру. */
    var calcGoalSent = false, calcGoalTimer = null;
    var calcGoal = function () {
      if (calcGoalSent) return;
      clearTimeout(calcGoalTimer);
      calcGoalTimer = setTimeout(function () {
        var total = express.querySelector('[data-express-total]');
        if (!total || total.textContent.trim() === '—') return;
        calcGoalSent = true;
        if (typeof w.vkGoal === 'function') w.vkGoal('calc_submit');
        if (typeof w.ymGoal === 'function') w.ymGoal('calc_submit');
      }, 1500);
    };
    express.addEventListener('input', function () { recalc(); calcGoal(); });
    express.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.hasAttribute && t.hasAttribute('data-express-route')) syncCurrencies();
      setTerm(); recalc(); calcGoal();
    });
    setTerm();
    syncCurrencies();
    recalc();
  }

  /* Раскрытие сноски по звёздочке убрано (Тати 2026-09-24): предупреждение о
     комиссии банка и оговорка про оферту должны быть видны сразу, без клика.
     Звёздочка осталась значком при «Итого к оплате», сноска — обычный текст
     под таблицей расчёта. */

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
        rateTime = data.source === 'profinance' && /^\d{1,2}:\d{2}$/.test(data.time || '') ? data.time : null;
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
        if (data.swift && data.swift.tariffs) {
          SWIFT.tariffs = data.swift.tariffs;
          if (data.swift.defaultBank) SWIFT.bank = data.swift.defaultBank;
          if (typeof data.swift.freeFromUsd === 'number') SWIFT.freeFromUsd = data.swift.freeFromUsd;
        }
        if (data.directions && data.directions.length) {
          var dirs = {};
          data.directions.forEach(function (r) { dirs[r.id] = r.currencies || []; });
          DIRECTIONS = dirs;
          syncCurrencies();
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
