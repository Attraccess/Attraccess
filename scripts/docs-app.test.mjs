import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, test } from 'node:test';

const require = createRequire(import.meta.url);
const appPath = require.resolve('../docs/assets/app.js');
const GLOBALS = ['window', 'document', 'localStorage', 'navigator'];
const originalGlobals = Object.fromEntries(
  GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);

// app.js reads the browser globals at load time and again in its event handlers, so the stubs stay
// installed until the test ends.
afterEach(() => {
  for (const name of GLOBALS) {
    if (originalGlobals[name]) Object.defineProperty(globalThis, name, originalGlobals[name]);
    else delete globalThis[name];
  }
});

function element(attributes = {}) {
  const listeners = {};
  return {
    attributes,
    listeners,
    textContent: '',
    classList: { toggle: (name, on) => (attributes[`class:${name}`] = on) },
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    setAttribute: (name, value) => (attributes[name] = value),
    addEventListener: (type, listener) => (listeners[type] = listener),
  };
}

/** Loads docs/assets/app.js with a stubbed browser and returns the stubs and what it recorded. */
function loadApp({ stored = {}, hash = '', pathname = '/', browserLanguage = 'en-US' } = {}) {
  const storage = { ...stored };
  const calls = { replace: [], pushState: [], timers: [], reloads: 0 };
  const links = [element({ 'data-lang': 'de' }), element({ 'data-lang': 'en' })];
  const switcher = element();
  const toggle = element();
  const root = element();
  const location = {
    hash,
    pathname,
    replace: (url) => calls.replace.push(url),
    reload: () => (calls.reloads += 1),
  };
  const window = {
    location,
    history: { pushState: (state, title, url) => calls.pushState.push(url) },
    setTimeout: (callback, delay) => calls.timers.push({ callback, delay }),
  };
  const globals = {
    window,
    localStorage: {
      getItem: (key) => (key in storage ? storage[key] : null),
      setItem: (key, value) => (storage[key] = String(value)),
    },
    navigator: { language: browserLanguage },
    document: {
      documentElement: root,
      querySelectorAll: () => links,
      getElementById: (id) => ({ langSwitcher: switcher, themeToggle: toggle })[id],
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  delete require.cache[appPath];
  require(appPath);
  delete require.cache[appPath];
  const runTimers = () => calls.timers.splice(0).forEach((timer) => timer.callback());
  return { window, location, storage, calls, links, switcher, toggle, root, runTimers, api: window.AttraccessDocs };
}

test('picks the stored language, else the browser language, and builds the Docsify config', () => {
  const stored = loadApp({ stored: { 'attraccess-docs-lang': 'de' }, pathname: '/docs' });
  assert.equal(stored.api.getLanguage(), 'de');
  assert.equal(stored.api.docsBase, '/docs/');
  assert.equal(stored.window.$docsify.basePath, '/docs/de/');
  assert.equal(stored.window.$docsify.search.namespace, 'attraccess-docs-de');
  assert.equal(loadApp({ browserLanguage: 'de-AT' }).api.getLanguage(), 'de');
  const english = loadApp({ stored: { 'attraccess-docs-lang': 'fr' } });
  assert.equal(english.api.getLanguage(), 'en');
  assert.equal(english.storage['attraccess-docs-lang'], 'en');
  assert.equal(english.window.$docsify.basePath, '/en/');
});

test('a "#/<lang>/..." hash switches the language and strips the prefix', () => {
  const app = loadApp({
    stored: { 'attraccess-docs-lang': 'de' },
    hash: '#/en/getting-started/overview',
    pathname: '/docs/',
  });
  assert.equal(app.api.getLanguage(), 'en');
  assert.equal(app.storage['attraccess-docs-lang'], 'en');
  assert.deepEqual(app.calls.replace, ['/docs/#/getting-started/overview']);
  assert.deepEqual(loadApp({ hash: '#/de' }).calls.replace, ['/#/']);
  assert.deepEqual(loadApp({ hash: '#/guides/de' }).calls.replace, []);
});

test('setLanguage stores another language and reloads after the delay', () => {
  const app = loadApp();
  assert.equal(app.api.setLanguage('en', 0), false);
  assert.equal(app.api.setLanguage('fr', 0), false);
  assert.deepEqual(app.calls.timers, []);
  assert.equal(app.api.setLanguage('de', 150), true);
  assert.equal(app.storage['attraccess-docs-lang'], 'de');
  assert.equal(app.calls.timers[0].delay, 150);
  assert.equal(app.calls.reloads, 0, 'the reload waits for the timer');
  app.runTimers();
  assert.equal(app.calls.reloads, 1);
  app.api.setLanguage('de');
  assert.equal(app.calls.timers[0].delay, 0);
});

test('navigate opens same-language pages by hash and other-language pages with a reload', () => {
  const app = loadApp({ pathname: '/docs/' });
  assert.deepEqual(app.api.navigate('en/getting-started/overview.md', 150), { reloading: false });
  assert.equal(app.location.hash, '#/getting-started/overview');
  assert.deepEqual(app.api.navigate('en/home.md'), { reloading: false });
  assert.equal(app.location.hash, '#/');
  assert.deepEqual(app.calls.pushState, []);

  assert.deepEqual(app.api.navigate('de/setup/first-time-setup.md', 150), { reloading: true });
  assert.equal(app.location.hash, '#/', 'the hash is not set, so Docsify does not route under the old language');
  assert.deepEqual(app.calls.pushState, ['/docs/#/de/setup/first-time-setup']);
  assert.equal(app.storage['attraccess-docs-lang'], 'de');
  assert.equal(app.calls.timers[0].delay, 150);
  app.api.navigate('de/home.md', 150);
  assert.equal(app.calls.pushState[1], '/docs/#/de/');

  for (const path of ['xx/a.md', 'en/a', 'en/../a.md', 'en/api/me:x.md', 'en/_sidebar.md', 'en//a.md', undefined]) {
    assert.throws(() => app.api.navigate(path), /Not a documentation page path/, String(path));
  }
});

test('the language switcher, its highlight and the theme toggle work', () => {
  const app = loadApp({ stored: { 'attraccess-docs-theme': 'dark' } });
  assert.deepEqual(
    app.links.map((link) => link.attributes['class:active']),
    [false, true],
  );
  const plugin = app.window.$docsify.plugins[0];
  let doneEach;
  plugin({ doneEach: (callback) => (doneEach = callback) });
  doneEach();

  let prevented = 0;
  const click = (target) => app.switcher.listeners.click({ preventDefault: () => (prevented += 1), target });
  click({ closest: () => null });
  click({ closest: () => app.links[1] });
  assert.deepEqual(app.calls.timers, [], 'clicking the active language does nothing');
  click(app.links[0]);
  assert.equal(prevented, 3);
  assert.equal(app.storage['attraccess-docs-lang'], 'de');
  assert.equal(app.calls.timers[0].delay, 0);

  assert.equal(app.root.attributes['data-theme'], 'dark');
  assert.equal(app.toggle.textContent, '☀️');
  app.toggle.listeners.click();
  assert.equal(app.root.attributes['data-theme'], 'light');
  assert.equal(app.storage['attraccess-docs-theme'], 'light');
  assert.equal(app.toggle.textContent, '🌙');
  assert.equal(app.toggle.attributes['aria-pressed'], 'false');
  app.toggle.listeners.click();
  assert.equal(app.root.attributes['data-theme'], 'dark');
});
