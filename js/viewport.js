// Keep viewport-dependent layout usable when a WebView reports a zero CSS viewport.
(() => {
  const visualViewport = window.visualViewport;
  const validHeight = height => Number.isFinite(height) && height > 0;

  function updateViewportHeight() {
    const visualHeight = visualViewport && visualViewport.height;
    const height = validHeight(visualHeight) ? visualHeight : window.innerHeight;
    if (validHeight(height)) {
      document.documentElement.style.setProperty('--viewport-height', `${height}px`);
    }
  }

  window.addEventListener('load', updateViewportHeight);
  window.addEventListener('pageshow', updateViewportHeight);
  window.addEventListener('resize', updateViewportHeight);
  if (visualViewport && typeof visualViewport.addEventListener === 'function') {
    visualViewport.addEventListener('resize', updateViewportHeight);
  }
  updateViewportHeight();
})();
