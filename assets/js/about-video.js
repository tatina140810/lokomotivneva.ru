// Видео «О нас»: по клику на обложку подставляем плеер YouTube (без cookie-трекинга).
// До клика плеер не грузится — первый экран открывается так же быстро (Тати 2026-10-06).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-yt-id]');
  if (!btn) return;
  const id = btn.getAttribute('data-yt-id');
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
  f.title = 'Видео о компании «Локомотив»';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  btn.replaceWith(f);
});
