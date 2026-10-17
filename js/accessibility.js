// Keep the visible screen as the only interactive surface, including in a WebView.
(() => {
  const app = document.querySelector('.app');
  const overlays = [...document.querySelectorAll('.overlay-screen')];
  let previousOverlay = null;
  function syncScreens() {
    const active = overlays.find(el => el.classList.contains('active'));
    app.inert = !!active;
    overlays.forEach(el => { el.inert = el !== active; });
    if (active !== previousOverlay) {
      if (active) {
        const heading = document.getElementById(active.getAttribute('aria-labelledby'));
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
      else {
        const heading = app.querySelector('h1');
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      previousOverlay = active;
    }
  }
  const observer = new MutationObserver(syncScreens);
  overlays.forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['class'] }));
  document.querySelectorAll('.stat-pill').forEach(el => {
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }
    });
  });
  document.getElementById('mascotAvatar').addEventListener('click', event => {
    if (event.detail === 0) event.currentTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  document.addEventListener('keydown', event => {
    const active = overlays.find(el => el.classList.contains('active'));
    if (!active || event.key !== 'Tab') return;
    const buttons = [...active.querySelectorAll('button')].filter(el => !el.disabled && el.getClientRects().length);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  syncScreens();
})();
