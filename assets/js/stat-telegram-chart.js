/* График раздела «Telegram Ads» (Тати 2026-10-13): расход по дням — столбики (₽ по курсу
   переводов), показы и клики — линии, у каждой своя шкала (подписан максимум). Дни — как в
   CSV Telegram Ads, по UTC. Данные — telegram.daily из /api/site-analytics/summary. */
(function (w) {
  'use strict';
  var nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('ru-RU');
  function dmy(iso) { var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function dm(iso) { var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1]; }

  w.telegramChart = function (daily) {
    if (!daily.length) return '<p class="t-sub">За период расхода из CSV нет — загрузите выгрузку Telegram Ads.</p>';
    var W = 640, H = 200, top = 16, bottom = 22, left = 6, right = 6;
    var plotH = H - top - bottom;
    var step = (W - left - right) / daily.length;
    var bw = Math.max(4, Math.min(28, step - 6));
    var max = function (k) { return daily.reduce(function (m, x) { return Math.max(m, x[k] || 0); }, 0) || 1; };
    // Клики есть не всегда: в дневном отчёте Reports их нет — линия только по дням, где загружены.
    var hasClk = daily.some(function (x) { return x.clicks != null; });
    var mRub = max('rub'), mImp = max('impressions'), mClk = max('clicks');
    var every = Math.ceil(daily.length / 12);
    var cx = function (i) { return left + i * step + step / 2; };
    var y = function (v, m) { return top + plotH - (v / m) * plotH; };
    var line = function (k, m) {
      return daily.map(function (x, i) { return x[k] == null ? null : cx(i).toFixed(1) + ',' + y(x[k], m).toFixed(1); })
        .filter(Boolean).join(' ');
    };
    var dots = function (k, m, cls) {
      return daily.map(function (x, i) {
        if (x[k] == null) return '';
        return '<circle cx="' + cx(i).toFixed(1) + '" cy="' + y(x[k], m).toFixed(1) + '" r="2.5" class="' + cls + '"/>';
      }).join('');
    };
    var bars = daily.map(function (x, i) {
      var h = (x.rub / mRub) * plotH;
      return '<rect x="' + (cx(i) - bw / 2).toFixed(1) + '" y="' + (top + plotH - h).toFixed(1) + '" width="' + bw.toFixed(1)
        + '" height="' + h.toFixed(1) + '" rx="2" class="tgc__bar"><title>' + dmy(x.day) + ' (UTC): ' + nf.format(x.eur) + ' € = '
        + nf0.format(Math.round(x.rub)) + ' ₽; показы ' + nf0.format(x.impressions) + ', клики ' + (x.clicks == null ? 'не загружены' : nf0.format(x.clicks))
        + '</title></rect>'
        + (i % every === 0 ? '<text x="' + cx(i).toFixed(1) + '" y="' + (H - 6) + '" font-size="10" text-anchor="middle" fill="currentColor">'
          + dm(x.day) + '</text>' : '');
    }).join('');
    return '<div class="tgc__legend"><span><i class="tgc__sw tgc__sw--bar"></i>Расход, ₽ (макс. ' + nf0.format(Math.round(mRub)) + ')</span>'
      + '<span><i class="tgc__sw tgc__sw--imp"></i>Показы (макс. ' + nf0.format(mImp) + ')</span>'
      + '<span><i class="tgc__sw tgc__sw--clk"></i>' + (hasClk ? 'Клики (макс. ' + nf0.format(mClk) + ')' : 'Клики не загружены') + '</span>'
      + '<span class="t-sub">дни — по UTC, как в CSV Telegram Ads</span></div>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tgchart" role="img" aria-label="Расход, показы и клики Telegram по дням">'
      + '<line x1="0" y1="' + (top + plotH) + '" x2="' + W + '" y2="' + (top + plotH) + '" stroke="var(--line)"/>' + bars
      + (daily.length > 1 ? '<polyline points="' + line('impressions', mImp) + '" class="tgc__imp"/>'
        + (hasClk ? '<polyline points="' + line('clicks', mClk) + '" class="tgc__clk"/>' : '') : '')
      + dots('impressions', mImp, 'tgc__dimp') + (hasClk ? dots('clicks', mClk, 'tgc__dclk') : '') + '</svg>';
  };
})(window);
