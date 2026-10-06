/* График динамики визитов для /stat/: четыре линии — те же группы, что карточки над ним:
   Яндекс, Telegram (реклама), прямые заходы и другие каналы (Тати 2026-09-28; раньше
   было две — Яндекс и «всё остальное»). Если сервер старый и отдаёт только yandex/other,
   рисуем две линии, как раньше.
   Рисуем инлайн-SVG без библиотек: страница внутренняя, тянуть ради одного графика
   стороннюю зависимость незачем.

   Правила, которым следует этот график:
   — одна вертикальная шкала на обе линии (две шкалы в одних осях врут о пропорциях);
   — цвет никогда не единственный признак: рядом с линией стоит подпись серии;
   — при наведении — вертикальная направляющая и подсказка с обоими числами, иначе
     по линии нельзя снять точное значение за день. */
(function (w, d) {
  'use strict';
  var C = { grid: '#E3E7EE', ink: '#55637A', ink3: '#8A94A6' };
  var SERIES_FULL = [
    { key: 'yandex', label: 'Из Яндекса', color: '#E0342B' },
    { key: 'telegram', label: 'Из Telegram', color: '#1E7FD8' },
    { key: 'youtube', label: 'С YouTube', color: '#E67E22' },
    { key: 'direct', label: 'Прямые заходы', color: '#2E9E44', dash: '6 4' },
    { key: 'rest', label: 'Другие каналы', color: '#8E44AD' },
  ];
  var SERIES_OLD = [
    { key: 'yandex', label: 'Из Яндекса', color: '#B8860B' },
    { key: 'other', label: 'Из других каналов', color: '#2F6FA8' },
  ];
  function dot(color) { return '<i class="dot" style="background:' + color + '"></i>'; }
  var W = 1000, H = 300, PAD = { t: 16, r: 54, b: 28, l: 44 };

  function fmtDay(iso) {
    var dt = new Date(iso);
    return dt.getDate() + ' ' + ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][dt.getMonth()];
  }
  function el(tag, attrs) {
    var e = d.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* rows: [{ day, yandex, telegram, direct, rest }] (или старое { day, yandex, other }) */
  w.renderStatChart = function (host, rows) {
    host.textContent = '';
    if (!rows || rows.length === 0) {
      host.innerHTML = '<p class="empty">За выбранный период данных ещё нет.</p>';
      return;
    }
    var SERIES = rows[0].telegram != null ? SERIES_FULL : SERIES_OLD;

    var legend = d.createElement('div');
    legend.className = 'chart__legend';
    legend.innerHTML = SERIES.map(function (s) { return '<span>' + dot(s.color) + s.label + '</span>'; }).join('');
    host.appendChild(legend);

    var box = d.createElement('div');
    box.className = 'chart';
    host.appendChild(box);

    var max = 0;
    rows.forEach(function (r) { SERIES.forEach(function (s) { max = Math.max(max, r[s.key] || 0); }); });
    /* Пустой период не должен рисовать шкалу 0…0 — ось схлопнется в линию. */
    max = Math.max(max, 4);
    var top = Math.ceil(max / 4) * 4;                       // круглый потолок шкалы

    var innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
    var x = function (i) { return PAD.l + (rows.length === 1 ? innerW / 2 : (innerW * i) / (rows.length - 1)); };
    var y = function (v) { return PAD.t + innerH - (innerH * v) / top; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Визиты по дням: ' + SERIES.map(function (s) { return s.label.toLowerCase(); }).join(', ') });

    // Сетка и подписи шкалы — намеренно бледные: это фон, а не данные.
    for (var s = 0; s <= 4; s++) {
      var v = (top / 4) * s, yy = y(v);
      svg.appendChild(el('line', { x1: PAD.l, x2: W - PAD.r, y1: yy, y2: yy, stroke: C.grid, 'stroke-width': 1 }));
      var lbl = el('text', { x: PAD.l - 10, y: yy + 4, 'text-anchor': 'end', fill: C.ink3, 'font-size': 12 });
      lbl.textContent = String(Math.round(v));
      svg.appendChild(lbl);
    }

    // Даты по оси: подписываем не каждую, иначе на 90 днях подписи слипнутся.
    // Последнюю дату ставим всегда, но если она села вплотную к предыдущей —
    // предыдущую убираем: две налезающие подписи читаются как одно слово.
    var step = Math.max(1, Math.ceil(rows.length / 8));
    var marks = [];
    rows.forEach(function (_, i) { if (i % step === 0) marks.push(i); });
    var last = rows.length - 1;
    if (marks[marks.length - 1] !== last) {
      var MIN_GAP = 80;                                  // в единицах viewBox
      if (x(last) - x(marks[marks.length - 1]) < MIN_GAP) marks.pop();
      marks.push(last);
    }
    marks.forEach(function (i) {
      var t = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', fill: C.ink3, 'font-size': 12 });
      t.textContent = fmtDay(rows[i].day);
      svg.appendChild(t);
    });

    function line(s) {
      var pts = rows.map(function (r, i) { return x(i) + ',' + y(r[s.key] || 0); }).join(' ');
      svg.appendChild(el('polyline', {
        points: pts, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-dasharray': s.dash,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
    }
    // Яндекс рисуем последним — он главный, его линия сверху остальных.
    SERIES.slice().reverse().forEach(line);

    /* Прямые подписи у последних точек: серию видно, не сверяясь с легендой и не
       полагаясь на цвет. Когда линии сходятся, подписи налезают друг на друга —
       разводим их по вертикали, сохраняя порядок значений. */
    var tail = rows[rows.length - 1];
    var labels = SERIES.map(function (s) { return { v: tail[s.key] || 0, color: s.color }; })
      .sort(function (a, b) { return y(a.v) - y(b.v); });
    var MIN_DY = 15;
    labels.forEach(function (lab, i) {
      lab.yy = y(lab.v) + 4;
      if (i > 0 && lab.yy - labels[i - 1].yy < MIN_DY) lab.yy = labels[i - 1].yy + MIN_DY;
    });
    labels.forEach(function (lab) {
      var t = el('text', { x: W - PAD.r + 8, y: lab.yy, fill: lab.color, 'font-size': 12, 'font-weight': 600 });
      t.textContent = String(lab.v);
      svg.appendChild(t);
    });

    // Слой наведения: направляющая, точки и подсказка.
    var guide = el('line', { y1: PAD.t, y2: PAD.t + innerH, stroke: C.ink3, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
    svg.appendChild(guide);
    var dots = SERIES.map(function (s) {
      var c = el('circle', { r: 5, fill: s.color, stroke: '#fff', 'stroke-width': 2, opacity: 0 });
      svg.appendChild(c);
      return c;
    });

    var hit = el('rect', { x: PAD.l, y: PAD.t, width: innerW, height: innerH, fill: 'transparent', style: 'cursor:crosshair' });
    svg.appendChild(hit);
    box.appendChild(svg);

    var tip = d.createElement('div');
    tip.className = 'tip';
    box.appendChild(tip);

    function show(ev) {
      var r = svg.getBoundingClientRect();
      var px = ((ev.clientX - r.left) / r.width) * W;
      var i = 0, best = Infinity;
      rows.forEach(function (_, k) {
        var dist = Math.abs(x(k) - px);
        if (dist < best) { best = dist; i = k; }
      });
      var row = rows[i];
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1);
      SERIES.forEach(function (s, k) {
        dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(row[s.key] || 0)); dots[k].setAttribute('opacity', 1);
      });
      tip.innerHTML = '<div style="margin-bottom:4px">' + fmtDay(row.day) + '</div>'
        + SERIES.map(function (s) { return '<div class="tip__row">' + dot(s.color) + s.label + ': <b>' + (row[s.key] || 0) + '</b></div>'; }).join('');
      tip.style.opacity = 1;
      var leftPct = (x(i) / W) * 100;
      tip.style.left = leftPct + '%';
      tip.style.top = '4px';
      // У правого края подсказка уезжала бы за пределы карточки.
      tip.style.transform = leftPct > 62 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)';
    }
    function hide() {
      guide.setAttribute('opacity', 0);
      dots.forEach(function (c) { c.setAttribute('opacity', 0); });
      tip.style.opacity = 0;
    }
    hit.addEventListener('mousemove', show);
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchstart', function (e) { if (e.touches[0]) show(e.touches[0]); }, { passive: true });
    hit.addEventListener('touchmove', function (e) { if (e.touches[0]) show(e.touches[0]); }, { passive: true });
  };
})(window, document);
