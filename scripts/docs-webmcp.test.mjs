import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const webmcp = require('../docs/assets/webmcp.js');

const ORIGIN = 'https://docs.example.org';
const PATH_DESCRIPTION =
  'Docs page path such as "en/getting-started/overview.md" (language prefix "en/" or "de/", .md file)';
const EN_SIDEBAR =
  '- [Home](home.md)\n\n- **Guides**\n  - [Setup Guide](guides/setup.md)\n  - [Docs](https://example.org/a.md)\n';
const DE_SIDEBAR = '- [Startseite](home.md)\n\n- **Anleitungen**\n  - [Einrichtung](guides/setup.md)\n';
const PAGES = {
  'en/_sidebar.md': EN_SIDEBAR,
  'de/_sidebar.md': DE_SIDEBAR,
  'en/home.md': '# Home\n<!-- llms-description: Landing page. -->\n\nWelcome to the docs.\n',
  'en/guides/setup.md':
    '# Setup Guide\n<!-- llms-description: Installs things. -->\n\nInstall the reader with the wizard.\n',
  'de/home.md': '# Startseite\n\nWillkommen.\n',
  'de/guides/setup.md': '# Einrichtung\n\nInstallieren Sie den Leser.\n',
};

/** Builds the stubbed browser environment; docsBase is "/" (GitHub Pages) or "/docs/" (served by the API). */
function makeEnv({ docsBase = '/', language = 'en', storage = {}, modelContext, legacy } = {}) {
  const calls = { navigate: [], setLanguage: [], fetched: [], console: 0 };
  const env = {
    calls,
    storage,
    window: {
      AttraccessDocs: {
        docsBase,
        getLanguage: () => language,
        setLanguage: (lang, delay) => {
          calls.setLanguage.push([lang, delay]);
          return lang !== language;
        },
        navigate: (path, delay) => {
          calls.navigate.push([path, delay]);
          return { reloading: !path.startsWith(`${language}/`) };
        },
      },
    },
    document: modelContext ? { modelContext } : {},
    navigator: legacy ? { modelContext: legacy } : {},
    location: { origin: ORIGIN },
    localStorage: { getItem: (key) => (key in storage ? storage[key] : null) },
    AbortController,
    fetch: async (url) => {
      calls.fetched.push(url);
      const key = url.startsWith(ORIGIN + docsBase) ? url.slice((ORIGIN + docsBase).length) : null;
      const body = key === null ? undefined : PAGES[key];
      return { ok: body !== undefined, text: async () => body };
    },
  };
  return env;
}

function recorder() {
  const registered = [];
  return {
    registered,
    registerTool(tool, options) {
      registered.push({ tool, options });
      return Promise.resolve();
    },
  };
}

const toolsOf = (env) => Object.fromEntries(webmcp.createWebMcp(env).tools.map((tool) => [tool.name, tool]));
const run = async (env, name, input) => JSON.parse((await toolsOf(env)[name].execute(input)).content[0].text);

// ----- registration -----

test('does nothing without modelContext', () => {
  const env = makeEnv();
  const logged = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  Object.assign(console, {
    log: (...a) => logged.push(a),
    warn: (...a) => logged.push(a),
    error: (...a) => logged.push(a),
  });
  try {
    assert.equal(webmcp.createWebMcp(env).register(), false);
    assert.equal(webmcp.createWebMcp({ ...env, document: undefined, navigator: undefined }).register(), false);
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

test('registers all five tools with one shared signal via document.modelContext.registerTool', () => {
  const modelContext = recorder();
  assert.equal(webmcp.createWebMcp(makeEnv({ modelContext })).register(), true);
  const { registered } = modelContext;
  assert.deepEqual(
    registered.map((entry) => entry.tool.name),
    ['list_pages', 'get_page', 'search_docs', 'navigate_to', 'set_language'],
  );
  assert.ok(registered.every((entry) => entry.options.signal instanceof AbortSignal));
  assert.equal(new Set(registered.map((entry) => entry.options.signal)).size, 1);
  const hints = Object.fromEntries(registered.map((entry) => [entry.tool.name, entry.tool.annotations.readOnlyHint]));
  assert.deepEqual(hints, {
    list_pages: true,
    get_page: true,
    search_docs: true,
    navigate_to: false,
    set_language: false,
  });
  for (const { tool } of registered) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.match(tool.name, /^[A-Za-z0-9_.-]{1,128}$/);
    assert.ok(tool.description.length > 20);
    assert.equal(typeof tool.execute, 'function');
    assert.equal(tool.annotations.consequentialHint, undefined);
  }
  const optionalLanguage = { type: 'string', enum: ['de', 'en'], description: 'Default: the language shown now' };
  const path = { type: 'string', description: PATH_DESCRIPTION };
  const object = (properties, required) => ({
    type: 'object',
    properties,
    ...(required ? { required } : {}),
    additionalProperties: false,
  });
  assert.deepEqual(Object.fromEntries(registered.map(({ tool }) => [tool.name, [tool.title, tool.inputSchema]])), {
    list_pages: ['List documentation pages', object({ language: optionalLanguage })],
    get_page: ['Read a documentation page', object({ path }, ['path'])],
    search_docs: [
      'Search the documentation',
      object(
        {
          query: { type: 'string', minLength: 1, maxLength: 200, description: 'Words that must all appear' },
          language: optionalLanguage,
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10, description: 'Maximum results' },
        },
        ['query'],
      ),
    ],
    navigate_to: ['Open a documentation page', object({ path }, ['path'])],
    set_language: [
      'Switch the site language',
      object({ language: { type: 'string', enum: ['de', 'en'] } }, ['language']),
    ],
  });
});

test('falls back to navigator.modelContext.provideContext once with all tools', () => {
  const calls = [];
  const legacy = { provideContext: (context) => calls.push(context) };
  assert.equal(webmcp.createWebMcp(makeEnv({ legacy })).register(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tools.length, 5);
  const rejecting = { provideContext: () => Promise.reject(new Error('nope')) };
  assert.equal(webmcp.createWebMcp(makeEnv({ legacy: rejecting })).register(), true);
});

test('prefers document.modelContext over the legacy navigator.modelContext', () => {
  const modelContext = recorder();
  const legacy = { provideContext: () => assert.fail('legacy API must not be used') };
  assert.equal(webmcp.createWebMcp(makeEnv({ modelContext, legacy })).register(), true);
  assert.equal(modelContext.registered.length, 5);
});

test('swallows registerTool throws and rejections and reports unusable contexts', async () => {
  let attempts = 0;
  const throwing = {
    registerTool: () => {
      attempts += 1;
      throw new Error('boom');
    },
  };
  assert.equal(webmcp.createWebMcp(makeEnv({ modelContext: throwing })).register(), true);
  assert.equal(attempts, 5);
  const rejecting = { registerTool: () => Promise.reject(new Error('boom')) };
  assert.equal(webmcp.createWebMcp(makeEnv({ modelContext: rejecting })).register(), true);
  await new Promise((resolve) => setImmediate(resolve)); // an unhandled rejection would fail the run
  assert.equal(webmcp.createWebMcp(makeEnv({ modelContext: {} })).register(), false);
  const brokenEnv = makeEnv({ modelContext: recorder() });
  brokenEnv.AbortController = function () {
    throw new Error('no abort controller');
  };
  assert.equal(webmcp.createWebMcp(brokenEnv).register(), false);
  assert.equal(
    webmcp
      .createWebMcp(
        makeEnv({
          legacy: {
            provideContext: () => {
              throw new Error('x');
            },
          },
        }),
      )
      .register(),
    false,
  );
});

// ----- list_pages -----

for (const docsBase of ['/', '/docs/']) {
  test(`list_pages returns sidebar pages for both languages (docsBase ${docsBase})`, async () => {
    const env = makeEnv({ docsBase });
    const en = await run(env, 'list_pages');
    assert.equal(en.language, 'en');
    assert.deepEqual(en.pages, [
      { title: 'Home', section: '', path: 'en/home.md', url: `${ORIGIN}${docsBase}en/home.md` },
      {
        title: 'Setup Guide',
        section: 'Guides',
        path: 'en/guides/setup.md',
        url: `${ORIGIN}${docsBase}en/guides/setup.md`,
      },
    ]);
    const de = await run(env, 'list_pages', { language: 'de' });
    assert.equal(de.language, 'de');
    assert.equal(de.pages[1].title, 'Einrichtung');
    assert.equal(de.pages[1].section, 'Anleitungen');
  });
}

test('list_pages retries a sidebar that failed to load', async () => {
  const env = makeEnv();
  const originalFetch = env.fetch;
  let failures = 1;
  env.fetch = (url) => (failures-- > 0 ? Promise.reject(new Error('offline')) : originalFetch(url));
  const tools = toolsOf(env);
  await assert.rejects(() => tools.list_pages.execute({}), /Could not load the sidebar/);
  const result = JSON.parse((await tools.list_pages.execute({})).content[0].text);
  assert.equal(result.pages.length, 2);
  assert.deepEqual(env.calls.fetched, [`${ORIGIN}/en/_sidebar.md`]);
});

test('list_pages leaves out sidebar links that are not documentation page paths', async () => {
  const env = makeEnv();
  env.fetch = async () => ({
    ok: true,
    text: async () => '- [Good](good.md)\n- [Up](../../api/x.md)\n- [Colon](api/me:x.md)\n- [Hidden](_x.md)\n',
  });
  assert.deepEqual(
    (await run(env, 'list_pages')).pages.map((page) => page.path),
    ['en/good.md'],
  );
});

test('list_pages validates language, reports failed fetches and caches the sidebar', async () => {
  const env = makeEnv();
  await assert.rejects(() => toolsOf(env).list_pages.execute({ language: 'fr' }), /language must be one of: de, en/);
  await run(env, 'list_pages');
  const tools = toolsOf(env);
  await tools.list_pages.execute({});
  await tools.list_pages.execute(undefined);
  assert.equal(
    env.calls.fetched.filter((url) => url.endsWith('en/_sidebar.md')).length,
    2,
    'one fetch per tools instance',
  );
  const broken = makeEnv();
  broken.fetch = async () => {
    throw new Error('offline');
  };
  await assert.rejects(() => toolsOf(broken).list_pages.execute({}), /Could not load the sidebar for language en/);
  const missing = makeEnv();
  missing.fetch = async () => ({ ok: false });
  await assert.rejects(() => toolsOf(missing).list_pages.execute({}), /Could not load the sidebar/);
});

test('tools fail clearly when the docs API is not ready', async () => {
  const env = makeEnv();
  env.window.AttraccessDocs = undefined;
  await assert.rejects(() => toolsOf(env).list_pages.execute({}), /not ready/);
});

// ----- get_page -----

for (const docsBase of ['/', '/docs/']) {
  test(`get_page returns raw Markdown for every accepted path form (docsBase ${docsBase})`, async () => {
    const env = makeEnv({ docsBase });
    const tool = toolsOf(env).get_page;
    const forms = [
      'en/home.md',
      `/${docsBase === '/' ? '' : docsBase.slice(1)}en/home.md`,
      '/en/home.md',
      `${ORIGIN}${docsBase}en/home.md`,
      ` en/home.md `,
    ];
    for (const form of [...forms, 'en/home.md?x=1#top', `${ORIGIN}${docsBase}en/home.md?x=1`]) {
      const result = await tool.execute({ path: form });
      assert.deepEqual(Object.keys(result), ['content']);
      assert.equal(result.content[0].type, 'text');
      assert.equal(result.content[0].text, PAGES['en/home.md'], form);
      assert.equal(env.calls.fetched.at(-1), `${ORIGIN}${docsBase}en/home.md`, form);
    }
  });
}

test('get_page rejects paths outside the documentation pages', async () => {
  for (const docsBase of ['/', '/docs/']) {
    const env = makeEnv({ docsBase });
    const tool = toolsOf(env).get_page;
    const rejected = [
      undefined,
      '',
      '   ',
      42,
      'x'.repeat(501),
      'https://evil.example/en/home.md',
      '//evil.example/en/home.md',
      'javascript:alert(1)',
      'data:text/plain,hello',
      'en/../de/home.md',
      '../en/home.md',
      'en\\home.md',
      'en//home.md',
      `${ORIGIN}${docsBase}en//home.md`,
      'en/%2e%2e/home.md',
      'en/%5chome.md',
      'en/%zz.md',
      'fr/home.md',
      'home.md',
      'en/assets.js',
      'en/home',
      'en/_sidebar.md',
      'en/guides/_private.md',
      `${ORIGIN}/other/en/home.md`,
      '/etc/passwd.md',
      '/_media/logo.md',
      'en/home?.md',
      'EN/home.md',
      'en/home.MD',
      'en/%2fhome.md',
      'en/%5Fsidebar.md',
      'en/a%20b.md',
      'en/api/users/me:x.md',
      'en/.\t./de/home.md',
      'en/\n../de/home.md',
      'en/\t/x.md',
      'en/a\u0000.md',
      'en/%252e%252e/de/home.md',
      'en/home.html.md',
      'en/home.md.md',
    ];
    if (docsBase === '/docs/') rejected.push(`${ORIGIN}/en/home.md`);
    for (const path of rejected) {
      await assert.rejects(
        () => tool.execute({ path }),
        /(path must be|Invalid path|outside the documentation)/,
        `${docsBase}: ${String(path)}`,
      );
    }
    await assert.rejects(() => tool.execute(undefined), /path must be a non-empty string of at most 500 characters/);
    assert.deepEqual(env.calls.fetched, [], 'no rejected path is fetched');
  }
});

test('get_page reports a missing page and network failures as "Page not found"', async () => {
  const env = makeEnv();
  await assert.rejects(
    () => toolsOf(env).get_page.execute({ path: 'en/nope.md' }),
    /Page not found: en\/nope\.md\. Use list_pages/,
  );
  env.fetch = async () => {
    throw new Error('offline');
  };
  await assert.rejects(() => toolsOf(env).get_page.execute({ path: 'en/home.md' }), /Page not found: en\/home\.md/);
});

// ----- search_docs -----

const INDEX_KEY = 'docsify.search.index/attraccess-docs-en';
const indexValue = JSON.stringify({
  '/guides/setup': {
    '#/guides/setup': { slug: '#/guides/setup', title: 'Setup Guide', body: 'Install the reader.' },
    '#/guides/setup?id=wizard': {
      slug: '#/guides/setup?id=wizard',
      title: 'Wizard',
      body: 'The wizard installs everything quickly.',
    },
  },
  '/': { '#/': { slug: '#/', title: 'Home Page', body: '<!-- llms-description: Leaky. --> Wizard overview' } },
});

for (const docsBase of ['/', '/docs/']) {
  test(`search_docs uses the Docsify search index for the current language (docsBase ${docsBase})`, async () => {
    const env = makeEnv({ docsBase, storage: { [INDEX_KEY]: indexValue } });
    const result = await run(env, 'search_docs', { query: 'wizard' });
    assert.equal(result.language, 'en');
    assert.deepEqual(
      result.results.map((entry) => [entry.title, entry.path, entry.url]),
      [
        ['Setup Guide', 'en/guides/setup.md', `${ORIGIN}${docsBase}en/guides/setup.md`],
        ['Home Page', 'en/home.md', `${ORIGIN}${docsBase}en/home.md`],
      ],
    );
    assert.equal(result.results[1].snippet, 'Wizard overview');
    // Words from different sections of one page match together, as in the fetch-based search.
    const across = await run(env, 'search_docs', { query: 'reader quickly' });
    assert.deepEqual(
      across.results.map((entry) => entry.path),
      ['en/guides/setup.md'],
    );
    assert.deepEqual((await run(env, 'search_docs', { query: 'leaky' })).results, []);
    assert.equal(env.calls.fetched.length, 0, 'no page fetched when the index exists');
  });
}

test('search_docs falls back to fetching pages without an index, for another language or a broken index', async () => {
  for (const env of [
    makeEnv(),
    makeEnv({ storage: { [INDEX_KEY]: 'not json' } }),
    makeEnv({ storage: { [INDEX_KEY]: '{}' } }),
    makeEnv({ language: 'de', storage: { [INDEX_KEY]: indexValue } }),
  ]) {
    const language = 'en';
    const result = await run(env, 'search_docs', { query: 'INSTALL reader', language });
    assert.deepEqual(
      result.results.map((entry) => entry.path),
      ['en/guides/setup.md'],
    );
    assert.ok(!result.results[0].snippet.includes('llms-description'));
    assert.match(result.results[0].snippet, /Install the reader/);
  }
  const german = await run(makeEnv(), 'search_docs', { query: 'einrichtung', language: 'de' });
  assert.deepEqual(
    german.results.map((entry) => entry.path),
    ['de/guides/setup.md'],
  );
});

test('search_docs never matches the hidden description and fails when no page can be loaded', async () => {
  assert.deepEqual((await run(makeEnv(), 'search_docs', { query: 'landing' })).results, []);
  const env = makeEnv();
  const originalFetch = env.fetch;
  env.fetch = (url) => (url.endsWith('_sidebar.md') ? originalFetch(url) : Promise.reject(new Error('offline')));
  await assert.rejects(
    () => toolsOf(env).search_docs.execute({ query: 'setup' }),
    /Could not load any documentation page/,
  );
});

test('search_docs returns at most ten results by default', async () => {
  const env = makeEnv();
  const links = Array.from({ length: 12 }, (_, index) => `- [Page ${index}](p${index}.md)`).join('\n');
  env.fetch = async (url) => ({ ok: true, text: async () => (url.endsWith('_sidebar.md') ? links : 'needle') });
  assert.equal((await run(env, 'search_docs', { query: 'needle' })).results.length, 10);
});

test('search_docs under /docs/ builds URLs from the docs base and skips unreadable pages', async () => {
  const env = makeEnv({ docsBase: '/docs/' });
  const originalFetch = env.fetch;
  env.fetch = (url) => (url.endsWith('home.md') ? Promise.reject(new Error('offline')) : originalFetch(url));
  const result = await run(env, 'search_docs', { query: 'setup' });
  assert.equal(result.results[0].url, `${ORIGIN}/docs/en/guides/setup.md`);
  assert.equal(result.results.length, 1);
});

test('search_docs validates its input', async () => {
  const tool = toolsOf(makeEnv()).search_docs;
  for (const input of [undefined, {}, { query: '' }, { query: '   ' }, { query: 5 }, { query: 'x'.repeat(201) }]) {
    await assert.rejects(() => tool.execute(input), /query must be a string of 1-200 characters/);
  }
  for (const limit of [0, 21, 1.5, '3']) {
    await assert.rejects(() => tool.execute({ query: 'a', limit }), /limit must be an integer between 1 and 20/);
  }
  await assert.rejects(() => tool.execute({ query: 'a', language: 'xx' }), /language must be one of/);
});

test('search_docs caches fetched pages and respects limit', async () => {
  const env = makeEnv();
  const tools = toolsOf(env);
  await tools.search_docs.execute({ query: 'the' });
  const first = env.calls.fetched.length;
  const limited = JSON.parse((await tools.search_docs.execute({ query: 'the', limit: 1 })).content[0].text);
  assert.equal(limited.results.length, 1);
  assert.equal(env.calls.fetched.length, first);
});

test('search_docs fetches at most six pages in parallel', async () => {
  const env = makeEnv();
  const links = Array.from({ length: 20 }, (_, index) => `- [Page ${index}](p${index}.md)`).join('\n');
  let active = 0;
  let peak = 0;
  env.fetch = async (url) => {
    if (url.endsWith('_sidebar.md')) return { ok: true, text: async () => links };
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return { ok: true, text: async () => 'needle' };
  };
  const result = await run(env, 'search_docs', { query: 'needle', limit: 20 });
  assert.equal(result.results.length, 20);
  assert.equal(peak, 6);
});

// ----- navigate_to / set_language -----

for (const docsBase of ['/', '/docs/']) {
  test(`navigate_to opens same-language pages without reload and others with reload (docsBase ${docsBase})`, async () => {
    const env = makeEnv({ docsBase });
    assert.deepEqual(await run(env, 'navigate_to', { path: 'en/guides/setup.md' }), {
      path: 'en/guides/setup.md',
      language: 'en',
      reloading: false,
    });
    assert.deepEqual(await run(env, 'navigate_to', { path: `${docsBase}de/home.md` }), {
      path: 'de/home.md',
      language: 'de',
      reloading: true,
    });
    assert.deepEqual(env.calls.navigate, [
      ['en/guides/setup.md', 150],
      ['de/home.md', 150],
    ]);
    for (const path of ['https://evil.example/en/home.md', 'en/api/me:x.md']) {
      await assert.rejects(() => toolsOf(env).navigate_to.execute({ path }), /Invalid path|outside/);
    }
    await assert.rejects(() => toolsOf(env).navigate_to.execute(undefined), /path must be/);
    assert.equal(env.calls.navigate.length, 2);
  });

  test(`set_language reports changes and unchanged languages (docsBase ${docsBase})`, async () => {
    const env = makeEnv({ docsBase });
    assert.deepEqual(await run(env, 'set_language', { language: 'de' }), {
      language: 'de',
      changed: true,
      reloading: true,
    });
    assert.deepEqual(await run(env, 'set_language', { language: 'en' }), { language: 'en', changed: false });
    assert.deepEqual(env.calls.setLanguage, [
      ['de', 150],
      ['en', 150],
    ]);
    await assert.rejects(() => toolsOf(env).set_language.execute({ language: 'fr' }), /language must be one of/);
    await assert.rejects(() => toolsOf(env).set_language.execute(undefined), /language must be one of/);
  });
}

test('navigate_to reports no reload when the site API returns nothing', async () => {
  const env = makeEnv();
  env.window.AttraccessDocs.navigate = () => undefined;
  assert.equal((await run(env, 'navigate_to', { path: 'de/home.md' })).reloading, false);
});

// ----- browser start-up and the search filter -----

function docsifyStub() {
  const calls = [];
  const get = function (...args) {
    calls.push(args);
    return {
      then: (onSuccess, onError) => {
        if (args[0] === 'fail') onError('nope');
        else onSuccess(PAGES['en/home.md'] + '```md\n<!-- llms-description: example -->\n```\n', { url: args[0] });
      },
      abort: () => 'aborted',
    };
  };
  return { calls, docsify: { get } };
}

test('installSearchFilter hands the search plugin page text without description comments', () => {
  const { calls, docsify } = docsifyStub();
  const win = { Docsify: docsify };
  assert.equal(webmcp.installSearchFilter(win), true);
  assert.equal(webmcp.installSearchFilter(win), false, 'installed once');
  const received = [];
  const request = win.Docsify.get('en/home.md', true);
  request.then((...args) => received.push(args));
  assert.deepEqual(calls, [['en/home.md', true]]);
  assert.equal(received[0][0], '# Home\n\nWelcome to the docs.\n```md\n<!-- llms-description: example -->\n```\n');
  assert.deepEqual(received[0][1], { url: 'en/home.md' }, 'extra callback arguments are passed on');
  assert.equal(request.abort(), 'aborted');
  const errors = [];
  win.Docsify.get('fail').then(assert.fail, (error) => errors.push(error));
  assert.deepEqual(errors, ['nope']);
  assert.equal(webmcp.installSearchFilter({}), false);
  assert.equal(webmcp.installSearchFilter({ Docsify: {} }), false);
});

function browserWindow({ modelContext, docsify } = {}) {
  const env = makeEnv({ modelContext });
  return {
    ...env.window,
    $docsify: docsify,
    document: env.document,
    navigator: {},
    location: env.location,
    localStorage: env.localStorage,
    fetch: env.fetch,
    AbortController,
    Docsify: docsifyStub().docsify,
  };
}

test('start registers the tools and adds the search filter as a Docsify plugin', () => {
  const modelContext = recorder();
  const existing = () => {};
  const win = browserWindow({ modelContext, docsify: { plugins: [existing] } });
  assert.equal(webmcp.start(win), true);
  assert.equal(modelContext.registered.length, 5);
  assert.equal(win.$docsify.plugins.length, 2);
  assert.equal(win.$docsify.plugins[0], existing);
  win.$docsify.plugins[1]();
  assert.equal(win.Docsify.get.withoutDescriptions, true);
  const bare = browserWindow({ docsify: {} });
  assert.equal(webmcp.start(bare), false);
  assert.equal(bare.$docsify.plugins.length, 1);
  assert.equal(webmcp.start(browserWindow()), false);
});

test('loading the script in a browser registers the tools and never throws', () => {
  const modulePath = require.resolve('../docs/assets/webmcp.js');
  const load = (win) => {
    globalThis.window = win;
    globalThis.document = win.document;
    delete require.cache[modulePath];
    try {
      require(modulePath);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
      delete require.cache[modulePath];
    }
  };
  const modelContext = recorder();
  load(browserWindow({ modelContext, docsify: {} }));
  assert.equal(modelContext.registered.length, 5);
  const broken = browserWindow({ modelContext: recorder() });
  broken.fetch = undefined;
  assert.doesNotThrow(() => load(broken));
});

// ----- pure helpers -----

test('parseSidebar handles groups, ungrouped links, anchors and non-page links', () => {
  const markdown = [
    '- [Top](top.md)',
    '- **Group A**',
    '  - [One](a/one.md)',
    '  * [Two](./a/two.md#intro)',
    '  - [Ext](https://example.org/x.md)',
    '  - [Image](a/img.png)',
    '  - [Anchor](#local)',
    '  - [Proto](//cdn.example.org/y.md)',
    '  - [Titled](a/titled.md "Tip")',
    "  - [Options](a/options.md ':target=_blank')",
    '  - **Nested**',
    '    1. [Deep](a/deep.md)',
    '  - [Three](a/three.md)',
    '- [Back to top level](other.md)',
    '',
    'not a list item',
    '',
  ].join('\r\n');
  assert.deepEqual(webmcp.parseSidebar(markdown), [
    { title: 'Top', section: '', href: 'top.md' },
    { title: 'One', section: 'Group A', href: 'a/one.md' },
    { title: 'Two', section: 'Group A', href: 'a/two.md' },
    { title: 'Titled', section: 'Group A', href: 'a/titled.md' },
    { title: 'Options', section: 'Group A', href: 'a/options.md' },
    { title: 'Deep', section: 'Nested', href: 'a/deep.md' },
    { title: 'Three', section: 'Group A', href: 'a/three.md' },
    { title: 'Back to top level', section: '', href: 'other.md' },
  ]);
});

test('description helpers find, ignore code samples and strip comments', () => {
  const page =
    '# T\n<!-- llms-description:  Hello world. -->\n\nText `<!-- llms-description: inline -->`\n\n   ```md\n<!-- llms-description: sample -->\n   ```\n';
  assert.deepEqual(webmcp.findDescriptions(page), ['Hello world.']);
  assert.deepEqual(webmcp.findDescriptions('# T\n<!-- llms-description: a\nb -->'), ['a\nb']);
  const examples = [
    '`` <!-- llms-description: double --> ``',
    '````md\n```\n<!-- llms-description: inner -->\n```\n````',
    '~~~\n<!-- llms-description: tilde -->\n~~~',
  ].join('\n\n');
  assert.deepEqual(webmcp.findDescriptions(`# T\n<!-- llms-description: Real. -->\n${examples}\n`), ['Real.']);
  assert.equal(webmcp.stripDescriptions('# T\n<!-- llms-description: x -->\nBody'), '# T\nBody');
  assert.equal(webmcp.stripDescriptions(`# T\n${examples}`), `# T\n${examples}`, 'code examples stay');
  assert.equal(
    webmcp.withoutCode('A `b` C\n```\nx\n```\n<!-- llms-description: d -->'),
    'A  C\n\n<!-- llms-description: d -->',
  );
});

test('searchItems ranks title matches first, requires all terms and builds snippets', () => {
  const items = [
    { title: 'Intro', path: 'en/a.md', body: 'The wizard guides you through setup.' },
    { title: 'Wizard', path: 'en/b.md', body: 'Short.' },
    { title: 'Other', path: 'en/c.md', body: 'Nothing here' },
    { title: 'Wizard again', path: 'en/b.md', body: 'wizard wizard' },
    { title: 'Long', path: 'en/d.md', body: `${'filler '.repeat(60)}wizard ${'tail '.repeat(60)}` },
  ];
  const results = webmcp.searchItems(items, 'Wizard', 10);
  assert.deepEqual(
    results.map((entry) => entry.path),
    ['en/b.md', 'en/a.md', 'en/d.md'],
  );
  assert.equal(webmcp.searchItems(items, 'wizard setup', 10).length, 1);
  assert.equal(webmcp.searchItems(items, 'wizard', 1).length, 1);
  const long = results[2].snippet;
  assert.ok(long.startsWith('…') && long.endsWith('…') && long.includes('wizard'));
  assert.ok(long.length <= 202);
  assert.equal(webmcp.makeSnippet('no match at all', ['zzz']), 'no match at all');
});

test('slugToPath and flattenSearchIndex map Docsify slugs to page paths', () => {
  assert.equal(webmcp.slugToPath('#/', 'de'), 'de/home.md');
  assert.equal(webmcp.slugToPath('#/a/b?id=x', 'en'), 'en/a/b.md');
  assert.equal(webmcp.slugToPath('/a/b/', 'en'), 'en/a/b.md');
  const items = webmcp.flattenSearchIndex(
    JSON.stringify({
      '/a': { k: { title: 'T', body: 'B' }, 'k?id=s': { slug: '#/k?id=s', title: 'Section' } },
      '/empty': {},
      '/bad': { '#/api/me:x': { title: 'Bad', body: 'x' } },
      '/untitled': { '#/u': { body: 'U' } },
    }),
    'en',
  );
  assert.deepEqual(items, [
    { title: 'T', body: 'B\nSection\n', path: 'en/k.md' },
    { title: '', body: 'U', path: 'en/u.md' },
  ]);
  assert.deepEqual(webmcp.flattenSearchIndex('null', 'en'), []);
  assert.deepEqual(webmcp.flattenSearchIndex(JSON.stringify({ '/n': null }), 'en'), []);
});

test('isPagePath accepts only language-prefixed .md page paths', () => {
  for (const path of ['en/home.md', 'de/a.b/c-d_e.md', 'en/2024/x.md'])
    assert.equal(webmcp.isPagePath(path), true, path);
  for (const path of [
    'en/a.html.md',
    'en/a.md.md',
    'fr/a.md',
    'en/_a.md',
    'en/.a.md',
    'en/a/../b.md',
    'en/a:b.md',
    'en/a%2fb.md',
    'en/a.MD',
    'en//a.md',
  ])
    assert.equal(webmcp.isPagePath(path), false, path);
});

test('pageTitle returns the first H1 outside code', () => {
  assert.equal(webmcp.pageTitle('```sh\n# comment\n```\n# Backup & Restore ##\n## Later'), 'Backup & Restore');
  assert.equal(webmcp.pageTitle('No heading'), '');
});

test('fetch-based search titles results with the page H1, like the Docsify index', async () => {
  const env = makeEnv();
  const bodies = { '_sidebar.md': '- [Overview](um.md)\n- [Untitled](u.md)\n', 'um.md': '# User Management\nRoles.\n' };
  env.fetch = async (url) => ({ ok: true, text: async () => bodies[url.split('/').pop()] ?? 'Just roles.\n' });
  const result = await run(env, 'search_docs', { query: 'roles' });
  assert.deepEqual(
    result.results.map((entry) => entry.title),
    ['User Management', 'Untitled'],
  );
  const titled = await run(env, 'search_docs', { query: 'user management' });
  assert.equal(titled.results[0].title, 'User Management');
});
