/* shell.js — casca comum do EDG Tracker: tema, sidebar e toast.
   Exposto em window.EDG para as telas. Busca, criar e sino: workspace.js. */
(function () {
  'use strict';

  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');

  // 'auto' segue o sistema (escolha da Settings); o botão do topo grava o explícito
  var mql = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  function storedTheme() {
    try { return localStorage.getItem('efin-theme') || 'dark'; } catch (e) { return 'dark'; }
  }
  function applyTheme(pref) {
    var t = pref === 'auto' ? (mql && mql.matches ? 'light' : 'dark') : pref;
    root.classList.remove('dark', 'light');
    root.classList.add(t);
    if (meta) meta.setAttribute('content', t === 'dark' ? '#05080A' : '#F3F4F0');
    try { localStorage.setItem('efin-theme', pref); } catch (e) {}
  }
  applyTheme(storedTheme());
  if (mql && mql.addEventListener) {
    mql.addEventListener('change', function () { if (storedTheme() === 'auto') applyTheme('auto'); });
  }

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.classList.contains('dark') ? 'light' : 'dark');
    });
  }

  // ---------------------------------------------------------------- sidebar
  var toggle = document.getElementById('sbToggle');
  var backdrop = document.getElementById('sbBackdrop');

  function setSidebar(open) {
    document.body.classList.toggle('sb-open', open);
    if (backdrop) backdrop.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toggle) toggle.addEventListener('click', function () { setSidebar(!document.body.classList.contains('sb-open')); });
  if (backdrop) backdrop.addEventListener('click', function () { setSidebar(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setSidebar(false); });

  // ------------------------------------------------------------------ toast
  var toastTimer;
  function toast(msg, ok) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('ok', !!ok);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ok ? 2800 : 6000);
  }

  window.EDG = { toast: toast, setTheme: applyTheme, themePref: storedTheme, setSidebar: setSidebar };
})();
