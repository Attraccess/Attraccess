// ===== i18n: language detected from localStorage or browser =====
var currentLang = (function () {
  var stored = localStorage.getItem('attraccess-docs-lang');
  if (stored === 'de' || stored === 'en') return stored;
  var browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
  return browserLang.startsWith('de') ? 'de' : 'en';
})();
localStorage.setItem('attraccess-docs-lang', currentLang);

// Strip language prefix from hash if present (basePath handles language routing)
(function () {
  var hash = window.location.hash || '';
  var match = hash.match(/^#\/(de|en)(\/.*)?$/);
  if (match) {
    currentLang = match[1];
    localStorage.setItem('attraccess-docs-lang', currentLang);
    var rest = match[2] || '/';
    window.location.replace(window.location.pathname + '#' + rest);
  }
})();

// ===== Dark Mode — set on html element so :root CSS variables work =====
var savedTheme = localStorage.getItem('attraccess-docs-theme');
var theme = savedTheme === 'dark' ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);

// ===== Resolve base path: works at site root (GitHub Pages) and under /docs/ (Docker) =====
var docsBase = (function () {
  var path = window.location.pathname;
  if (path.charAt(path.length - 1) !== '/') path += '/';
  return path;
})();

// ===== Docsify Configuration =====
window.$docsify = {
  name: '<img src="' + docsBase + '_media/logo.png" alt="Logo" width="28"> Attraccess',
  repo: 'https://github.com/Attraccess/Attraccess',
  homepage: 'home.md',
  loadSidebar: '_sidebar.md',
  loadNavbar: false,
  coverpage: 'coverpage.md',
  onlyCover: false,
  subMaxLevel: 3,
  auto2top: true,
  basePath: docsBase + currentLang + '/',
  search: {
    maxAge: 86400000,
    paths: 'auto',
    placeholder: currentLang === 'de' ? 'Suchen...' : 'Search...',
    noData: currentLang === 'de' ? 'Keine Ergebnisse' : 'No results',
    depth: 4,
    hideOtherSidebarContent: false,
    namespace: 'attraccess-docs-' + currentLang,
  },
  pagination: {
    previousText: currentLang === 'de' ? 'Zurück' : 'Previous',
    nextText: currentLang === 'de' ? 'Weiter' : 'Next',
    crossChapter: true,
    crossChapterText: true,
  },
  copyCode: {
    buttonText: currentLang === 'de' ? 'Kopieren' : 'Copy',
    errorText: currentLang === 'de' ? 'Fehler' : 'Error',
    successText: currentLang === 'de' ? 'Kopiert!' : 'Copied!',
  },
  themeable: {
    readyTransition: true,
    responsiveTables: true,
  },
  tabs: {
    persist: true,
    sync: true,
    theme: 'classic',
  },
  routerMode: 'hash',
  plugins: [
    function (hook, vm) {
      hook.doneEach(function () {
        updateLangSwitcher();
      });
    },
  ],
};

// ===== Language Switching =====
function updateLangSwitcher() {
  var links = document.querySelectorAll('.lang-switcher a');
  links.forEach(function (link) {
    link.classList.toggle('active', link.getAttribute('data-lang') === currentLang);
  });
}
updateLangSwitcher();

document.getElementById('langSwitcher').addEventListener('click', function (e) {
  e.preventDefault();
  var langEl = e.target.closest ? e.target.closest('a[data-lang]') : e.target;
  var lang = langEl ? langEl.getAttribute('data-lang') : null;
  if (!lang || lang === currentLang) return;
  localStorage.setItem('attraccess-docs-lang', lang);
  window.location.reload();
});

// ===== Theme Toggle — set on html element =====
var toggleBtn = document.getElementById('themeToggle');
toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
toggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
toggleBtn.setAttribute('aria-label', currentLang === 'de' ? 'Farbmodus wechseln' : 'Toggle color mode');

toggleBtn.addEventListener('click', function () {
  var current = document.documentElement.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('attraccess-docs-theme', next);
  toggleBtn.textContent = next === 'dark' ? '☀️' : '🌙';
  toggleBtn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
});
