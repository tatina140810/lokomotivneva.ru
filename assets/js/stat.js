/* Внутренняя статистика сайта lokomotivneva.ru (Тати 2026-09-17).
   Отвечает на вопрос «сколько людей пришло из Яндекса, а сколько из других каналов»,
   что смотрели, сколько пробыли и кто вернулся. Данные уходят в нашу же систему
   (app.lokomotivneva.ru) и видны на /stat/ — в отличие от Метрики, они наши и их
   можно связать с заявками.

   Устройство: копим события в очередь и отправляем пачкой через sendBeacon — так
   отправка переживает закрытие вкладки и не задерживает переходы. Любая ошибка здесь
   не должна мешать сайту работать, поэтому всё обёрнуто в try/catch: статистика — не
   та вещь, ради которой можно уронить страницу клиенту. */
(function (w, d) {
  'use strict';
  var API = 'https://app.lokomotivneva.ru/api/site-analytics/public';
  var SESSION_GAP_MS = 30 * 60 * 1000;  // визит рвётся после 30 минут без действий
  var PING_MS = 30000;                  // отметка «ещё здесь» раз в 30 сек активного времени
  var FLUSH_MS = 15000;                 // как часто отправляем накопленное
  var TICK_MS = 5000;                   // шаг счётчика времени на странице

  /* Страницу статистики не считаем: иначе директор, глядя в отчёт, сам себе
     накручивает просмотры. */
  if (/^\/stat\/?/.test(d.location.pathname)) return;

  function uuid() {
    try {
      if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
      var b = new Uint8Array(16);
      w.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      var h = [].map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    } catch (e) {
      /* Совсем старый браузер: случайный, но валидный по форме идентификатор —
         сервер принимает только строгий формат. */
      var r = function (n) { var s = ''; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; };
      return r(8) + '-' + r(4) + '-4' + r(3) + '-8' + r(3) + '-' + r(12);
    }
  }

  function ls(key, val) {
    try {
      if (val === undefined) return w.localStorage.getItem(key);
      w.localStorage.setItem(key, val);
      return val;
    } catch (e) { return null; }   // приватный режим, запрет хранилища
  }

  /* Кто. Идентификатор случайный и к личности не привязан; живёт в браузере, пока
     человек не почистит данные сайта. */
  var visitorId = ls('loko_vid');
  if (!visitorId || visitorId.length !== 36) visitorId = ls('loko_vid', uuid());

  /* Визит. Рвём по паузе в 30 минут — так же, как считают визиты все аналитики,
     иначе одна открытая вкладка на неделю выглядела бы одним бесконечным визитом. */
  var now = Date.now();
  var lastSeen = Number(ls('loko_seen') || 0);
  var sessionId = ls('loko_sid');
  var freshSession = !sessionId || sessionId.length !== 36 || !lastSeen || (now - lastSeen) > SESSION_GAP_MS;
  if (freshSession) sessionId = ls('loko_sid', uuid());
  ls('loko_seen', String(now));

  /* Откуда пришёл ВИЗИТ. Запоминаем один раз в начале визита: на второй странице
     источником уже значился бы наш собственный сайт, и канал бы потерялся.
     Рекламные метки (yclid Яндекс.Директа, gclid Google Ads) читаем из адреса —
     они и позволяют отличить платный переход от бесплатного поиска. */
  var entry;
  try {
    entry = JSON.parse(ls('loko_entry') || 'null');
  } catch (e) { entry = null; }
  if (freshSession || !entry) {
    var q = {};
    try {
      var sp = new URLSearchParams(d.location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'yclid', 'gclid', 'ysclid', 'fbclid'].forEach(function (k) {
        var v = sp.get(k);
        if (v) q[k] = String(v).slice(0, 200);
      });
    } catch (e) { /* адрес без параметров */ }
    q.referrer = d.referrer ? String(d.referrer).slice(0, 500) : '';
    entry = q;
    ls('loko_entry', JSON.stringify(entry));
  }

  /* Форма заявки берёт это отсюда: тогда у лида в системе виден канал, и понятно,
     какая реклама приносит клиентов, а не просто заходы (см. assets/js/main.js). */
  w.LOKO_STAT = { visitorId: visitorId, sessionId: sessionId, entry: entry };

  var viewId = uuid();
  var queue = [];
  var dwell = 0;          // активное время на странице, нарастающим итогом
  var nextPing = PING_MS;
  var maxScroll = 0;
  var sent = {};          // чтобы не слать одну и ту же веху дважды

  function push(type, extra) {
    var e = extra || {};
    e.uid = uuid();
    e.type = type;
    e.view_id = viewId;
    e.path = d.location.pathname || '/';
    e.ts = new Date().toISOString();
    queue.push(e);
    if (queue.length >= 20) flush();
  }

  function flush(useBeacon) {
    if (!queue.length) return;
    var body = JSON.stringify({
      visitor_id: visitorId, session_id: sessionId, entry: entry,
      lang: d.documentElement.lang || (w.navigator && w.navigator.language) || null,
      screen_w: (w.screen && w.screen.width) || null,
      events: queue.splice(0, queue.length),
    });
    try {
      /* sendBeacon отправляет даже при закрытии вкладки и не блокирует переход.
         Если его нет или он отказался (переполнена очередь браузера) — обычный
         запрос с keepalive. Не получилось и это — молча теряем: статистика не
         повод мешать человеку пользоваться сайтом. */
      if (useBeacon !== false && w.navigator && w.navigator.sendBeacon) {
        var ok = w.navigator.sendBeacon(API, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
        if (ok) return;
      }
      if (w.fetch) {
        w.fetch(API, {
          method: 'POST', keepalive: true, mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: body,
        }).catch(function () {});
      }
    } catch (e) { /* статистика не критична */ }
  }

  /* Просмотр страницы. */
  push('pageview', { title: (d.title || '').slice(0, 300) });

  /* Время на странице. Считаем только пока вкладка на виду: фоновая вкладка,
     открытая на весь день, иначе дала бы часы «чтения» и испортила среднее.
     Время меряем по часам, а не тиками таймера: при шаге в несколько секунд визит
     короче шага записывался бы нулём, и среднее занижалось. Отправляем нарастающим
     итогом — потерянное событие ухода (закрыли вкладку, пропал интернет) тогда не
     обнуляет время, отчёт берёт последнее известное. */
  var visibleSince = d.visibilityState === 'hidden' ? 0 : Date.now();
  function activeMs() {
    return dwell + (visibleSince ? Date.now() - visibleSince : 0);
  }
  function pauseClock() {
    if (visibleSince) { dwell += Date.now() - visibleSince; visibleSince = 0; }
  }
  function resumeClock() {
    if (!visibleSince) visibleSince = Date.now();
  }
  setInterval(function () {
    if (d.visibilityState === 'hidden') return;
    if (activeMs() >= nextPing) {
      nextPing += PING_MS;
      push('ping', { dwell_ms: activeMs() });
    }
  }, TICK_MS);

  /* Глубина прокрутки — вехами, а не на каждый пиксель. */
  function onScroll() {
    try {
      var h = d.documentElement;
      var full = Math.max(h.scrollHeight, d.body ? d.body.scrollHeight : 0) - w.innerHeight;
      var pct = full > 0 ? Math.round(((w.pageYOffset || h.scrollTop) / full) * 100) : 100;
      if (pct > maxScroll) maxScroll = Math.min(100, Math.max(0, pct));
      [25, 50, 75, 100].forEach(function (mark) {
        if (maxScroll >= mark && !sent['s' + mark]) {
          sent['s' + mark] = 1;
          push('scroll', { scroll_pct: mark });
        }
      });
    } catch (e) { /* нестандартная разметка */ }
  }
  w.addEventListener('scroll', onScroll, { passive: true });

  /* Целевые действия. Считаем то, что означает интерес: позвонил, написал в
     мессенджер, скачал документ, открыл калькулятор, отправил форму. Названия
     осмысленные — в отчёте должно читаться «нажали телефон», а не «ссылка №4». */
  function targetOf(el) {
    if (!el) return null;
    if (el.getAttribute && el.getAttribute('data-stat')) return el.getAttribute('data-stat').slice(0, 200);
    var href = (el.getAttribute && el.getAttribute('href')) || '';
    if (/^tel:/i.test(href)) return 'Телефон';
    if (/^mailto:/i.test(href)) return 'Почта';
    if (/t\.me|telegram/i.test(href)) return 'Telegram';
    if (/wa\.me|whatsapp/i.test(href)) return 'WhatsApp';
    if (/\.pdf($|\?)/i.test(href)) return 'Документ PDF';
    if (/app\.lokomotivneva\.ru/i.test(href)) return 'Личный кабинет';
    return null;
  }

  d.addEventListener('click', function (ev) {
    try {
      var el = ev.target;
      for (var i = 0; el && i < 4; i++) {
        var t = targetOf(el);
        if (t) { push('click', { target: t, title: (d.title || '').slice(0, 300) }); return; }
        el = el.parentElement;
      }
    } catch (e) { /* клик по чему-то экзотическому */ }
  }, true);

  /* Отправленная заявка — конечная цель сайта. Событие ставит main.js после
     успешного ответа сервера (см. window.LOKO_STAT.lead). */
  w.LOKO_STAT.lead = function () { push('form', { target: 'Заявка отправлена' }); flush(); };

  /* Уход со страницы: фиксируем итоговое время и прокрутку и дожимаем очередь. */
  function leave() {
    if (sent.left) return;
    sent.left = 1;
    pauseClock();
    push('leave', { dwell_ms: dwell, scroll_pct: maxScroll });
    ls('loko_seen', String(Date.now()));
    flush();
  }
  w.addEventListener('pagehide', leave);
  w.addEventListener('beforeunload', leave);
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') {
      pauseClock();
      push('ping', { dwell_ms: dwell, scroll_pct: maxScroll });
      flush();
    } else {
      resumeClock();
    }
  });

  setInterval(function () { flush(); }, FLUSH_MS);
})(window, document);
