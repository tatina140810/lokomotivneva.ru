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

  /* ClientID Метрики. Счётчик грузится отдельно и на телефоне часто не успевает к первому
     запросу (29.10: у первых сессий ClientID пустой) — поэтому:
     • сессию заводим, подождав не дольше 1,5 с (визит важнее, чем ClientID);
     • не дождались — ждём дальше: поздний ответ счётчика и повторные вопросы через 3, 7 и 15 с;
       как только ClientID появился — внеочередная отметка с ним;
     • уходит со страницы, а ClientID так и не отправлен — досылаем его sendBeacon. */
  var cid = null;
  var cidSent = false;
  var cidWaiters = [];
  function takeCid(v) {
    if (cid || !/^\d{5,30}$/.test(String(v))) return;
    cid = String(v);
    var list = cidWaiters; cidWaiters = [];
    list.forEach(function (f) { f(cid); });
    if (!cidSent) sendCid();
  }
  function askCid() {
    try { if (typeof w.ym === 'function') w.ym(COUNTER, 'getClientID', takeCid); } catch (x) { /* счётчика нет */ }
  }
  function clientId(cb) {
    if (cid) return cb(cid);
    var done = false;
    var finish = function (v) { if (!done) { done = true; cb(v); } };
    cidWaiters.push(finish);
    setTimeout(function () { finish(null); }, 1500);
    askCid();
  }
  [3000, 7000, 15000].forEach(function (ms) { setTimeout(function () { if (!cid) askCid(); }, ms); });

  function sendCid() {
    var s = store();
    if (!cid || !s || !s.token) return;
    cidSent = true;
    post('/ping', { token: s.token, client_id: cid });
  }
  w.addEventListener('pagehide', function () {
    var s = store();
    if (!cid || cidSent || !s || !s.token || !w.navigator.sendBeacon) return;
    try {
      cidSent = w.navigator.sendBeacon(API + '/ping', new Blob([JSON.stringify({ token: s.token, client_id: cid })], { type: 'text/plain' }));
    } catch (x) { /* не вышло — значит не вышло */ }
  });

  function session() {
    clientId(function (c) {
      post('/session', {
        visitor_id: STAT.visitorId, session_id: STAT.sessionId, client_id: c,
        entry: e, landing: String(w.location.href).slice(0, 500)
      }).then(function (r) {
        if (!r || !r.tracked || !r.token) return;
        store({ token: r.token, sid: STAT.sessionId, pinged: Date.now() });
        if (c) cidSent = true;
        else if (cid) sendCid();   /* ClientID пришёл, пока заводили сессию */
      });
    });
  }

  function ping() {
    var s = store();
    if (!s || !s.token || d.visibilityState === 'hidden') return;
    if (Date.now() - (s.pinged || 0) < PING_MS - 5000) return;
    s.pinged = Date.now();
    store(s);
    clientId(function (c) {
      post('/ping', { token: s.token, client_id: c }).then(function (r) {
        if (r && r.expired) { store(null); cidSent = false; session(); return; }
        if (c) cidSent = true;
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
