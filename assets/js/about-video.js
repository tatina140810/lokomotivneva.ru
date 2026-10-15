// Видео «О нас»: по клику на обложку подставляем плеер Rutube.
// Rutube, а не YouTube (Тати 2026-10-15): YouTube в России замедлен — ролик не грузился.
// До клика плеер не грузится — первый экран открывается так же быстро (Тати 2026-10-06).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-rutube-id]');
  if (!btn) return;
  const id = btn.getAttribute('data-rutube-id');
  const f = document.createElement('iframe');
  f.src = `https://rutube.ru/play/embed/${encodeURIComponent(id)}?autoplay=1`;
  f.title = 'Видео о компании «Локомотив»';
  f.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen; screen-wake-lock';
  f.allowFullscreen = true;
  btn.replaceWith(f);
});
