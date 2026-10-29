/* Коллтрекинг (Тати 2026-10-29). Посетителю из рекламы (Директ, Telegram, VK) показываем
   номер из пула app.lokomotivneva.ru: звонок на него система сведёт с визитом и передаст
   в Метрику, а Директ сможет учиться на звонках. Остальным — обычный номер из вёрстки.

   Правила:
   • Отказ от аналитики (cookie.js → loko_analytics=deny) — номер не подменяем, сервер
     не спрашиваем. Без stat.js (выключен) — тоже: визит неоткуда взять.
   • Без рекламных меток в первом касании визита сервер не спрашиваем вовсе.
   • Номер закреплён за посетителем на 30 минут; пока вкладка открыта и видна, раз в
     5 минут продлеваем. Номер живёт в sessionStorage — на соседних страницах тот же.
   • Любая ошибка (сервер молчит, пул пуст) — на сайте остаётся номер по умолчанию.
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
  var BASE = String(CFG.defaultNumber || '74951080100');   // номер в вёрстке, 7XXXXXXXXXX
  var PING_MS = 5 * 60 * 1000;
  var KEY = 'loko_ct';
  var e = STAT.entry;
  var hasMarks = ['yclid', 'utm_source', 'utm_medium', 'utm_campaign'].some(function (k) { return e[k]; });
  if (!hasMarks) return;

  function store(v) {
    try {
      if (v === undefined) return JSON.parse(w.sessionStorage.getItem(KEY) || 'null');
      w.sessionStorage.setItem(KEY, JSON.stringify(v));
    } catch (x) { return null; }
    return v;
  }

  /* Номер в любой записи: +7 (495) 10-80-100, +74951080100, 8 495 108-01-00… Ищем номер по
     умолчанию и уже подставленные раньше (аренда истекла — пришёл другой номер из пула). */
  var SEP = '[\\s()\\-\\u00a0]*';
  var known = [BASE];
  var RE = null;
  var current = null;
  function buildRe() {
    RE = new RegExp(known.map(function (n) {
      return '(?:\\+7|8)' + SEP + n.slice(1).split('').join(SEP);
    }).join('|'), 'g');
  }

  function swapText(node) {
    var v = node.nodeValue;
    if (!v || v.length < 10) return;
    RE.lastIndex = 0;
    if (RE.test(v)) { RE.lastIndex = 0; node.nodeValue = v.replace(RE, current.display); }
  }
  function swapIn(root) {
    if (!current || !root) return;
    try {
      var links = root.querySelectorAll ? root.querySelectorAll('a[href^="tel:"]') : [];
      if (root.matches && root.matches('a[href^="tel:"]')) links = [root].concat([].slice.call(links));
      [].forEach.call(links, function (a) {
        var digits = a.getAttribute('href').replace(/\D/g, '').replace(/^8/, '7');
        if (known.indexOf(digits) >= 0) a.setAttribute('href', 'tel:+' + current.number);
      });
      if (root.nodeType === 3) return swapText(root);
      var walker = d.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode && n.parentNode.nodeName;
          return /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(p) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      var n;
      while ((n = walker.nextNode())) swapText(n);
    } catch (x) { /* вёрстка важнее подмены */ }
  }

  var observer = null;
  function apply(s) {
    if (!s || !s.number || s.number === BASE) return;
    if (current && current.number !== s.number && known.indexOf(current.number) < 0) known.push(current.number);
    current = { number: s.number, display: s.display || ('+' + s.number) };
    buildRe();
    swapIn(d.body);
    if (!observer && w.MutationObserver) {
      observer = new MutationObserver(function (list) {
        list.forEach(function (m) {
          [].forEach.call(m.addedNodes || [], function (node) { swapIn(node); });
          if (m.type === 'characterData') swapText(m.target);
        });
      });
      observer.observe(d.body, { childList: true, subtree: true, characterData: true });
    }
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

  /* ClientID Метрики: счётчик может ещё грузиться или быть выключен — ждём не дольше 1,5 с. */
  function clientId(cb) {
    var done = false;
    var finish = function (v) { if (!done) { done = true; cb(/^\d{5,30}$/.test(String(v)) ? String(v) : null); } };
    setTimeout(function () { finish(null); }, 1500);
    try { if (typeof w.ym === 'function') w.ym(COUNTER, 'getClientID', finish); else finish(null); } catch (x) { finish(null); }
  }

  function remember(r) {
    var s = { number: r.number, display: r.display, token: r.token, sid: STAT.sessionId,
      until: Date.now() + (r.ttl_sec || 0) * 1000, pinged: Date.now() };
    store(s);
    return s;
  }

  function session() {
    clientId(function (cid) {
      post('/session', {
        visitor_id: STAT.visitorId, session_id: STAT.sessionId, client_id: cid,
        entry: e, landing: String(w.location.href).slice(0, 500)
      }).then(function (r) {
        if (!r || !r.dynamic || !r.token) return;
        apply(remember(r));
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
        if (!r) return;
        if (r.expired) { store(null); session(); return; }
        s.until = Date.now() + (r.ttl_sec || 0) * 1000;
        if (r.number && r.number !== s.number) { s.number = r.number; s.display = r.display; apply(s); }
        store(s);
      });
    });
  }

  function start() {
    var s = store();
    if (s && s.token && s.sid === STAT.sessionId) {
      apply(s);
      if (Date.now() > s.until) { s.pinged = 0; store(s); }
      ping();
    } else {
      session();
    }
    setInterval(ping, 30 * 1000);
    d.addEventListener('visibilitychange', ping);
  }

  try {
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
  } catch (x) { /* подмена номера не должна мешать сайту */ }
})(window, document);
