// Видео «О нас»: по клику на обложку подставляем плеер YouTube.
// Домен youtube.com, а не youtube-nocookie.com: через «режим без cookie» YouTube отвечал
// «Video unavailable» для этого ролика (Тати 2026-10-15). Плеер грузится только по клику.
// До клика плеер не грузится — первый экран открывается так же быстро (Тати 2026-10-06).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-yt-id]');
  if (!btn) return;
  const id = btn.getAttribute('data-yt-id');
  const f = document.createElement('iframe');
  f.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
  f.title = 'Видео о компании «Локомотив»';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  btn.replaceWith(f);
});
