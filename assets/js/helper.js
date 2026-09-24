/* =============================================================================
   helper.js — бот-помощник: отвечает по базе знаний (helper-kb.js), а когда
   ответа нет — зовёт живого менеджера.
   -----------------------------------------------------------------------------
   Никаких внешних сервисов и библиотек: поиск по ключевым словам идёт в
   браузере. Заявка на менеджера уходит туда же, куда формы сайта —
   POST /api/site-leads/public в LokomotivPos, так что лид попадает
   во вкладку оператора «Заявки с сайта», а не теряется.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var KB = w.LOKO_KB || [];
  if (!KB.length) return;

  var CFG = (w.LOKO && w.LOKO.contacts) || {};
  var LEADS_URL = 'https://app.lokomotivneva.ru/api/site-leads/public';
  var MIN_SCORE = 4;          // ниже этого порога считаем, что бот не понял
  var miss = 0;               // сколько вопросов подряд бот не понял

  /* --------------------------- разметка ----------------------------------- */
  var icon = function (name) {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><use href="/assets/sprite.svg#i-' + name + '"></use></svg>';
  };
  /* Крестика в спрайте сайта нет — рисуем тем же росчерком, что в промо-полосе. */
  var closeIcon = '<svg aria-hidden="true" viewBox="0 0 24 24">' +
    '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  var fab = d.createElement('button');
  fab.type = 'button';
  fab.className = 'helper-fab';
  fab.setAttribute('aria-label', 'Задать вопрос помощнику');
  fab.title = 'Задать вопрос';
  fab.innerHTML = '<span class="helper-fab__icon">' + icon('headset') + '</span><span class="helper-fab__label">Задать вопрос</span>';

  var panel = d.createElement('section');
  panel.className = 'helper';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Помощник «Локомотива»');
  panel.innerHTML =
    '<header class="helper__head">' +
      '<span class="helper__avatar">' + icon('headset') + '</span>' +
      '<span><span class="helper__title">Помощник «Локомотива»</span><br>' +
      '<span class="helper__sub">Отвечает сразу · менеджер на связи в рабочее время</span></span>' +
      '<button type="button" class="helper__close" aria-label="Закрыть помощника">' + closeIcon + '</button>' +
    '</header>' +
    '<div class="helper__log" id="helper-log" role="log" aria-live="polite"></div>' +
    '<div class="helper__chips" id="helper-chips"></div>' +
    /* Согласие на обработку персональных данных. Показывается только когда
       помощник просит телефон (leadMode) — в обычной беседе про сроки и
       документы никаких персональных данных не собирается, и чекбокс там
       был бы шумом. Галочка снята по умолчанию и проверяется перед отправкой:
       ст. 9 152-ФЗ требует, чтобы согласие было конкретным и однозначным. */
    '<label class="helper__consent" id="helper-consent" hidden>' +
      '<input type="checkbox" id="helper-consent-box">' +
      '<span>Согласен на обработку персональных данных — ' +
      '<a href="/privacy/" target="_blank" rel="noopener">политика</a></span>' +
    '</label>' +
    '<form class="helper__form" id="helper-form">' +
      '<input class="helper__input" id="helper-input" type="text" autocomplete="off" placeholder="Спросите о платеже, сроках, документах…">' +
      '<button class="helper__send" type="submit" aria-label="Отправить">' + icon('arrow-right') + '</button>' +
    '</form>';

  d.body.appendChild(fab);
  d.body.appendChild(panel);

  /* Кнопку «Написать в Telegram» добавляет main.js в тот же угол. Две круглые
     кнопки друг на друге — мусор, поэтому её прячем: Telegram и WhatsApp
     остаются внутри помощника, в ответе «Позвать менеджера». */
  var hideOldFab = function () {
    var old = d.querySelector('.fab-contact');
    if (old) old.style.display = 'none';
  };
  hideOldFab();
  setTimeout(hideOldFab, 400);
  setTimeout(hideOldFab, 1200);

  var log = panel.querySelector('#helper-log');
  var chips = panel.querySelector('#helper-chips');
  var form = panel.querySelector('#helper-form');
  var input = panel.querySelector('#helper-input');
  var consentBox = panel.querySelector('#helper-consent');
  var consentFlag = panel.querySelector('#helper-consent-box');

  /* Редакция политики, с которой человек соглашается. Уходит вместе с заявкой,
     чтобы потом было видно, какой именно документ он принимал. Меняя политику,
     менять и здесь — и в main.js, там та же константа. */
  var POLICY_VERSION = '2026-09-24';

  function showConsent(on) {
    consentBox.hidden = !on;
    if (on) consentFlag.checked = false;
  }

  /* ------------------------- вывод сообщений ------------------------------ */
  function bubble(kind, htmlText, links) {
    var el = d.createElement('div');
    el.className = 'msg msg--' + kind;
    el.innerHTML = htmlText;
    if (links && links.length) {
      var box = d.createElement('div');
      box.className = 'msg__links';
      links.forEach(function (l) {
        var a = d.createElement('a');
        a.href = l.h;
        a.textContent = l.t;
        if (l.h.indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener'; }
        box.appendChild(a);
      });
      el.appendChild(box);
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  var esc = function (s) { return String(s).replace(/[<>&]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]; }); };
  var paras = function (a) { return (Array.isArray(a) ? a : [a]).map(function (p) { return '<p>' + p + '</p>'; }).join(''); };

  /* Пауза «печатает…» — короткая, чтобы ответ не казался подставленным
     мгновенно, но и не заставлять ждать. */
  function botSay(htmlText, links, after) {
    var t = bubble('bot', '<span class="typing"><i></i><i></i><i></i></span>');
    setTimeout(function () {
      t.innerHTML = htmlText;
      if (links && links.length) {
        var box = d.createElement('div');
        box.className = 'msg__links';
        links.forEach(function (l) {
          var a = d.createElement('a');
          a.href = l.h; a.textContent = l.t;
          if (l.h.indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener'; }
          box.appendChild(a);
        });
        t.appendChild(box);
      }
      log.scrollTop = log.scrollHeight;
      if (after) after();
    }, 420);
  }

  /* ----------------------------- поиск ------------------------------------
     Сравниваем по первым пяти буквам слова: так «страхуете», «страхование»
     и «страховка» сходятся в одну тему, а «страна» — нет. Фразовые ключи
     («валютный контроль») ищем подстрокой в исходном вопросе. */
  function clean(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function words(s) {
    return clean(s).split(' ').filter(function (x) { return x.length > 2; });
  }
  function same(a, b) {
    var n = Math.min(a.length, b.length, 5);
    if (n < 3) return a === b;
    return a.slice(0, n) === b.slice(0, n);
  }

  function find(text) {
    var asked = words(text);
    var raw = clean(text);
    if (!asked.length) return [];

    return KB.map(function (topic) {
      var score = 0;
      var hitKeys = {};

      topic.keywords.forEach(function (key) {
        var k = clean(key);
        if (k.indexOf(' ') > -1) {                       // ключ-фраза
          if (raw.indexOf(k) > -1) { score += 7; hitKeys[k] = 1; }
          return;
        }
        asked.forEach(function (word) {
          if (same(word, k)) { score += 5; hitKeys[k] = 1; }
        });
      });

      /* Слова из самого вопроса темы весят меньше ключевых: они помогают
         выбрать между двумя похожими темами, но сами тему не назначают. */
      var title = words(topic.q);
      asked.forEach(function (word) {
        title.forEach(function (t) { if (same(word, t)) score += 1; });
      });

      /* Несколько разных ключевых слов подряд — почти наверняка эта тема. */
      var uniq = Object.keys(hitKeys).length;
      if (uniq > 1) score += (uniq - 1) * 3;

      return { topic: topic, score: score };
    }).filter(function (r) { return r.score >= MIN_SCORE; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  /* --------------------------- быстрые кнопки ----------------------------- */
  function showChips(list, withManager, withHome) {
    chips.innerHTML = '';
    /* Возврат к началу: без него после «Позвать менеджера» диалог упирался
       в тупик — списка вопросов больше не было (Тати, 16.09.2026). */
    if (withHome !== false) {
      var home = d.createElement('button');
      home.type = 'button';
      home.className = 'chip';
      home.textContent = '\u2190 Все вопросы';
      home.addEventListener('click', function () {
        leadMode = false;
        showConsent(false);
        input.placeholder = 'Спросите о платеже, сроках, документах\u2026';
        botSay('<p>Чем ещё помочь? Выберите вопрос или спросите своими словами.</p>', null, greetChips);
      });
      chips.appendChild(home);
    }
    list.forEach(function (topic) {
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = topic.q;
      b.addEventListener('click', function () {
        bubble('user', esc(topic.q));
        answer(topic);
      });
      chips.appendChild(b);
    });
    if (withManager !== false) {
      var m = d.createElement('button');
      m.type = 'button';
      m.className = 'chip chip--accent';
      m.textContent = 'Позвать менеджера';
      m.addEventListener('click', callManager);
      chips.appendChild(m);
    }
  }

  function topicById(id) {
    for (var i = 0; i < KB.length; i++) if (KB[i].id === id) return KB[i];
    return null;
  }

  function answer(topic, sure) {
    miss = 0;
    /* Когда совпадение слабое, честно говорим, что это догадка: хуже
       уверенного ответа не по делу ничего нет. */
    var lead = sure === false ? '<p>Похоже, вопрос об этом — если нет, позовите менеджера.</p>' : '';
    botSay(lead + paras(topic.a), topic.links, function () {
      /* Предлагаем соседние темы того же раздела — так разговор продолжается
         без угадывания формулировок. */
      var near = KB.filter(function (t) { return t.group === topic.group && t.id !== topic.id; }).slice(0, 3);
      showChips(near);
    });
  }

  /* ------------------------ передача менеджеру ---------------------------- */
  var leadMode = false;

  function callManager() {
    leadMode = true;
    var links = [];
    if (CFG.telegram) links.push({ t: 'Написать в Telegram', h: 'https://t.me/' + CFG.telegram });
    if (CFG.whatsapp) links.push({ t: 'WhatsApp', h: 'https://wa.me/' + CFG.whatsapp });
    links.push({ t: CFG.phoneHuman || '+7 (495) 10-80-100', h: 'tel:' + (CFG.phone || '+74951080100') });
    botSay('<p>Оставьте свой номер телефона — менеджер свяжется с вами в ближайшее время.</p>' +
           '<p>Или свяжитесь сразу:</p>', links, function () {
      input.placeholder = 'Ваш номер телефона';
      showConsent(true);
      input.focus();
      showChips([], false);      // остаётся только «← Все вопросы»
    });
  }

  function sendLead(text) {
    var payload = {
      name: 'Заявка из помощника',
      phone: text,
      /* Приём заявок требует e-mail, а помощник спрашивает только телефон.
         Ставим служебный адрес компании — это метка источника, а не выдуманный
         адрес клиента. Когда на сервере e-mail станет необязательным для
         source=site-helper, строку убрать. */
      email: 'helper@lokomotivneva.ru',
      message: 'Помощник на сайте: клиент оставил контакт — ' + text,
      page: location.pathname,
      source: 'site-helper',
      company: '',
      /* Отметка о согласии уходит вместе с заявкой: по 152-ФЗ оператор должен
         уметь доказать, что согласие было получено, а проверка галочки в
         браузере ничего не доказывает. Поля сохраняет панель заявок; пока она
         их не читает, они просто лежат в теле запроса и ничему не мешают. */
      consent: true,
      consent_at: new Date().toISOString(),
      consent_policy: POLICY_VERSION,
      consent_text: 'Согласен на обработку персональных данных (помощник на сайте)'
    };
    fetch(LEADS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('bad');
      botSay('<p>Передал менеджеру — он свяжется с вами в ближайшее время.</p><p>Пока можете посмотреть другие ответы.</p>', null, greetChips);
    }).catch(function () {
      var links = [];
      if (CFG.telegram) links.push({ t: 'Telegram', h: 'https://t.me/' + CFG.telegram });
      links.push({ t: CFG.phoneHuman || '+7 (495) 10-80-100', h: 'tel:' + (CFG.phone || '+74951080100') });
      botSay('<p>Не удалось отправить заявку автоматически. Напишите нам напрямую — ответим быстро.</p>', links, greetChips);
    });
    leadMode = false;
    showConsent(false);
    input.placeholder = 'Спросите о платеже, сроках, документах…';
  }

  /* --------------------------- диалог ------------------------------------- */
  function handle(text) {
    if (leadMode && !consentFlag.checked) {
      /* Номер не показываем в переписке и никуда не отправляем, пока галочки
         нет: иначе персональные данные уже обработаны без согласия. */
      botSay('<p>Чтобы передать номер менеджеру, нужно согласие на обработку персональных данных — отметьте галочку под перепиской.</p>');
      input.value = text;
      consentFlag.focus();
      return;
    }

    bubble('user', esc(text));
    if (leadMode) { sendLead(text); return; }

    var hits = find(text);
    if (hits.length) {
      /* score 6 и выше — прямое попадание в ключевые слова темы;
         ниже — отвечаем с оговоркой и сразу предлагаем менеджера. */
      answer(hits[0].topic, hits[0].score >= 5);
      return;
    }

    miss++;
    if (miss >= 2) { botSay('<p>Не нашёл ответа на этот вопрос.</p>', null, callManager); return; }
    botSay('<p>Не нашёл точного ответа. Попробуйте спросить иначе — например, «срок платежа в Китай» или «какие документы дадите». Или позовите менеджера, он ответит на любой вопрос.</p>',
      null, function () { showChips(KB.slice(0, 3)); });
  }

  function greetChips() {
    showChips([
      topicById('cost'), topicById('term'), topicById('need'),
      topicById('countries'), topicById('docs'), topicById('cabinet')
    ].filter(Boolean), true, false);
  }

  var started = false;
  function open() {
    d.documentElement.classList.add('helper-open');
    if (!started) {
      started = true;
      botSay('<p>Здравствуйте! Я помощник «Локомотива». Отвечу про сроки, стоимость, документы, направления и личный кабинет.</p><p>Спросите своими словами или выберите вопрос ниже.</p>', null, greetChips);
    }
    setTimeout(function () { input.focus(); }, 150);
  }
  function close() { d.documentElement.classList.remove('helper-open'); fab.focus(); }

  fab.addEventListener('click', open);
  panel.querySelector('.helper__close').addEventListener('click', close);
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && d.documentElement.classList.contains('helper-open')) close();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    handle(text);
  });
})(window, document);
