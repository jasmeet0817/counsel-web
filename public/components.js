(async () => {
  async function loadPartial(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    const res = await fetch(url);
    const html = await res.text();
    el.outerHTML = html;
  }

  await Promise.all([
    loadPartial('site-header', '/partials/site-header.html'),
    loadPartial('site-footer', '/partials/site-footer.html'),
  ]);

  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.site-nav a').forEach(a => {
    const href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === path) {
      a.setAttribute('aria-current', 'page');
    }
  });
})();
