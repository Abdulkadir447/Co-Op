// Co-op website — light/dark toggle, mirroring the app's theme switch.
// The palettes live in styles.css ([data-theme="dark"]) and match
// frontend/src/theme/dark.ts.
(function () {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const stored = localStorage.getItem('coop-theme');
  if (stored) root.setAttribute('data-theme', stored);

  if (btn) {
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('coop-theme', next);
    });
  }
})();
