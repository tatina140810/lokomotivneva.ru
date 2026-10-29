/* Коллтрекинг без подменных номеров (Тати 2026-10-29). Номер на сайте один для всех и
   скриптом НЕ меняется. Посетителю из рекламы (Директ, Telegram, VK) система
   app.lokomotivneva.ru заводит сессию: ClientID Метрики, метки, страница входа и отметки
   «ещё на сайте». Если на основной номер позвонили, когда на сайте был ровно один такой
   посетитель, звонок уходит в Метрику с его ClientID — Директ видит конверсию.

   Правила:
   • Отказ от аналитики (cookie.js → loko_analytics=deny) или выключенный stat.js — ничего
     не делаем: визит неоткуда взять, а согласия нет.
   • Без рекламных меток в первом касании визита сервер не спрашиваем вовсе — что это
     реклама, решает сервер по тем же правилам, что и статистика.
   • Пока вкладка видна, раз в 5 минут отправляем отметку; токен живёт в sessionStorage.
   • Любая ошибка — молча: на работу сайта коллтрекинг влиять не должен.
   Подключается ПОСЛЕ stat.js (берёт из него visitor_id и первое касание). */
(function (w, d) {
  'use strict';
  try {
    var CFG = (w.LOKO && w.LOKO.calltracking) || {};
    if (!CFG.enabled) return;
    if (w.localStorage.getItem('loko_analytics') === 'deny') return;
  } catch (e) { return; }
  var STAT = w.LOKO_STAT;
  if (!STAT || !STAT.visitorId || !STAT.entry) return;

  var API = CFG.api || 'https://app.lokomotivneva.ru/api/calltracking';
  var COUNTER = CFG.counterId || 112180979;
  var PING_MS = 5 * 60 * 1000;
  var KEY = 'loko_ct';
  var e = STAT.entry;
  var hasMarks = ['yclid', 'utm_source', 'utm_medium', 'utm_campaign'].some(function (k) { return e[k]; });
  if (!hasMarks) return;

  function store(v) {
    try {
      if (v === undefined) return JSON.parse(w.sessionStorage.getItem(KEY) || 'null');
      if (v === null) w.sessionStorage.removeItem(KEY); else w.sessionStorage.setItem(KEY, JSON.stringify(v));
    } catch (x) { return null; }
    return v;
  }

  function post(path, body) {
    var ctrl = w.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
    return fetch(API + path, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined, credentials: 'omit'
    }).then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .catch(function () { clearTimeout(t); return null; });
  }

  /* ClientID Метрики: счётчик может ещё грузиться — ждём не дольше 1,5 с. */
  function clientId(cb) {
    var done = false;
    var finish = function (v) { if (!done) { done = true; cb(/^\d{5,30}$/.test(String(v)) ? String(v) : null); } };
    setTimeout(function () { finish(null); }, 1500);
    try { if (typeof w.ym === 'function') w.ym(COUNTER, 'getClientID', finish); else finish(null); } catch (x) { finish(null); }
  }

  function session() {
    clientId(function (cid) {
      post('/session', {
        visitor_id: STAT.visitorId, session_id: STAT.sessionId, client_id: cid,
        entry: e, landing: String(w.location.href).slice(0, 500)
      }).then(function (r) {
        if (r && r.tracked && r.token) store({ token: r.token, sid: STAT.sessionId, pinged: Date.now() });
      });
    });
  }

  function ping() {
    var s = store();
    if (!s || !s.token || d.visibilityState === 'hidden') return;
    if (Date.now() - (s.pinged || 0) < PING_MS - 5000) return;
    s.pinged = Date.now();
    store(s);
    clientId(function (cid) {
      post('/ping', { token: s.token, client_id: cid }).then(function (r) {
        if (r && r.expired) { store(null); session(); }
      });
    });
  }

  function start() {
    var s = store();
    /* Новая страница того же визита: сессия уже есть — отмечаемся, а не заводим новую. */
    if (s && s.token && s.sid === STAT.sessionId) { s.pinged = 0; store(s); ping(); } else { session(); }
    setInterval(ping, 30 * 1000);
    d.addEventListener('visibilitychange', ping);
  }

  try {
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
  } catch (x) { /* коллтрекинг не должен мешать сайту */ }
})(window, document);
