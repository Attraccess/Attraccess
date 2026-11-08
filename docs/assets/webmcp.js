// ===== WebMCP: read-only docs tools for in-browser AI agents (experimental) =====
// Classic script, no dependencies. Does nothing unless the browser exposes WebMCP
// (document.modelContext, or navigator.modelContext in older drafts). Never throws, never logs.
// The pure helpers are exported via module.exports so Node (tests, scripts/generate-llms-txt.mjs)
// parses sidebars exactly like the browser does.
(function () {
  'use strict';

  var LANGUAGES = ['de', 'en'];
  var SEARCH_INDEX_PREFIX = 'docsify.search.index/attraccess-docs-';
  var FETCH_CONCURRENCY = 6;
  var SNIPPET_LENGTH = 200;
  var RELOAD_DELAY_MS = 150;
  var SIDEBAR_LINK = /^\s*[-*+]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*$/;
  var SIDEBAR_GROUP = /^\s*[-*+]\s+\*\*(.+?)\*\*\s*$/;
  var DESCRIPTION_COMMENT = /<!--\s*llms-description:([\s\S]*?)-->[ \t]*\r?\n?/g;

  // ----- Pure helpers -----

  function isPageLink(href) {
    var target = href.split('#')[0].split('?')[0];
    return !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(target) && /\.md$/.test(target);
  }

  function normalizeHref(href) {
    return href
      .split('#')[0]
      .split('?')[0]
      .replace(/^\.?\//, '');
  }

  // Docsify sidebar markdown -> [{ title, section, href }]. Bold-only list items start a section;
  // unindented links reset to the plain (empty) section. External, non-.md and anchor links are skipped.
  function parseSidebar(markdown) {
    var section = '';
    var entries = [];
    String(markdown)
      .split(/\r?\n/)
      .forEach(function (line) {
        var group = SIDEBAR_GROUP.exec(line);
        var link = SIDEBAR_LINK.exec(line);
        if (group) {
          section = group[1].trim();
        } else if (link && isPageLink(link[2])) {
          if (!/^\s/.test(line)) section = '';
          entries.push({ title: link[1].trim(), section: section, href: normalizeHref(link[2]) });
        }
      });
    return entries;
  }

  // Comment texts shown as examples in code blocks or code spans are not descriptions.
  function withoutCode(markdown) {
    return String(markdown)
      .replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '')
      .replace(/`[^`\n]*`/g, '');
  }

  // All llms-description comment texts (trimmed) found in a page, ignoring code examples.
  function findDescriptions(markdown) {
    var found = [];
    var match;
    var pattern = new RegExp(DESCRIPTION_COMMENT.source, 'g');
    var text = withoutCode(markdown);
    while ((match = pattern.exec(text))) found.push(match[1].trim());
    return found;
  }

  function stripDescriptions(markdown) {
    return String(markdown).replace(DESCRIPTION_COMMENT, '');
  }

  function collapse(text) {
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function makeSnippet(body, terms) {
    var text = collapse(body);
    var lower = text.toLowerCase();
    var positions = terms
      .map(function (term) {
        return lower.indexOf(term);
      })
      .filter(function (index) {
        return index >= 0;
      });
    var start = positions.length ? Math.max(0, Math.min.apply(null, positions) - 60) : 0;
    var end = start + SNIPPET_LENGTH;
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  function scoreItem(item, terms) {
    var title = String(item.title || '').toLowerCase();
    var haystack = title + '\n' + String(item.body || '').toLowerCase();
    var matches = terms.every(function (term) {
      return haystack.indexOf(term) >= 0;
    });
    if (!matches) return 0;
    var titleHits = terms.filter(function (term) {
      return title.indexOf(term) >= 0;
    }).length;
    return titleHits ? 100 + titleHits : 1;
  }

  // items: [{ title, path, url, body }] -> best matches first (title matches above body matches),
  // one result per path, ties keep input order.
  function searchItems(items, query, limit) {
    var terms = collapse(query).toLowerCase().split(' ');
    var seen = {};
    return items
      .map(function (item, index) {
        return { item: item, index: index, score: scoreItem(item, terms) };
      })
      .filter(function (entry) {
        return entry.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score || a.index - b.index;
      })
      .filter(function (entry) {
        var fresh = !seen[entry.item.path];
        seen[entry.item.path] = true;
        return fresh;
      })
      .slice(0, limit)
      .map(function (entry) {
        var item = entry.item;
        var body = stripDescriptions(item.body || '');
        return { title: item.title, path: item.path, url: item.url, snippet: makeSnippet(body || item.title, terms) };
      });
  }

  // Docsify search index slug ("#/getting-started/overview?id=x") -> "en/getting-started/overview.md"
  function slugToPath(slug, language) {
    var route = String(slug)
      .replace(/^#?\/?/, '')
      .split('?')[0]
      .replace(/\/$/, '');
    return language + '/' + (route || 'home') + '.md';
  }

  // Flattens the localStorage value of the Docsify search plugin ({ page: { slug: { slug, title, body } } }).
  function flattenSearchIndex(raw, language) {
    var index = JSON.parse(raw);
    var items = [];
    Object.keys(index || {}).forEach(function (page) {
      Object.keys(index[page]).forEach(function (key) {
        var entry = index[page][key];
        items.push({ title: entry.title, body: entry.body, path: slugToPath(entry.slug || key, language) });
      });
    });
    return items;
  }

  function textResult(text) {
    return { content: [{ type: 'text', text: text }] };
  }

  function jsonResult(value) {
    return textResult(JSON.stringify(value, null, 2));
  }

  function assertLanguage(language) {
    if (LANGUAGES.indexOf(language) === -1) throw new Error('language must be one of: ' + LANGUAGES.join(', '));
    return language;
  }

  // ----- Browser adapter -----

  function createWebMcp(env) {
    var win = env.window;
    var loc = env.location;
    var pageCache = {};

    function docs() {
      var api = win.AttraccessDocs;
      if (!api) throw new Error('The docs site is not ready yet');
      return api;
    }

    function optionalLanguage(language) {
      return language === undefined ? docs().getLanguage() : assertLanguage(language);
    }

    function fetchText(url, failure) {
      return env.fetch(url).then(
        function (response) {
          if (!response.ok) throw new Error(failure);
          return response.text();
        },
        function () {
          throw new Error(failure);
        },
      );
    }

    function cachedText(url, failure) {
      if (!pageCache[url]) {
        pageCache[url] = fetchText(url, failure);
        pageCache[url].catch(function () {
          delete pageCache[url];
        });
      }
      return pageCache[url];
    }

    function absoluteUrl(path) {
      return loc.origin + docs().docsBase + path;
    }

    // Accepts "en/x.md", "/en/x.md" or a same-origin URL under the docs base. Returns { language, path, url }.
    function resolvePath(input) {
      if (typeof input !== 'string' || !input.trim() || input.length > 500)
        throw new Error('path must be a non-empty string');
      var base = docs().docsBase;
      var raw = input.trim();
      var decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch (e) {
        throw new Error('Invalid path: ' + raw);
      }
      var withoutScheme = decoded.replace(/^https?:\/\//i, '');
      if (/\\/.test(decoded) || withoutScheme.indexOf('//') >= 0 || /(^|\/)\.\.(\/|$)/.test(withoutScheme)) {
        throw new Error('Invalid path: ' + raw);
      }
      var relative = /^\/(?!\/)/.test(raw) && raw.indexOf(base) !== 0 ? raw.slice(1) : raw;
      var url = new URL(relative, loc.origin + base);
      var rest = url.pathname.slice(base.length);
      var language = rest.split('/')[0];
      var invalid =
        url.origin !== loc.origin ||
        url.pathname.indexOf(base) !== 0 ||
        LANGUAGES.indexOf(language) === -1 ||
        !/\.md$/.test(rest) ||
        /(^|\/)_/.test(rest);
      if (invalid)
        throw new Error(
          'Path is outside the documentation pages (expected e.g. en/getting-started/overview.md): ' + raw,
        );
      return { language: language, path: rest, url: loc.origin + url.pathname };
    }

    function loadSidebar(language) {
      return cachedText(
        absoluteUrl(language + '/_sidebar.md'),
        'Could not load the sidebar for language ' + language,
      ).then(function (markdown) {
        return parseSidebar(markdown).map(function (entry) {
          var path = language + '/' + entry.href;
          return { title: entry.title, section: entry.section, path: path, url: absoluteUrl(path) };
        });
      });
    }

    function loadBodies(pages) {
      var results = new Array(pages.length);
      var next = 0;
      function worker() {
        if (next >= pages.length) return Promise.resolve();
        var index = next++;
        return cachedText(pages[index].url, 'page not found')
          .then(
            function (text) {
              results[index] = {
                title: pages[index].title,
                path: pages[index].path,
                url: pages[index].url,
                body: text,
              };
            },
            function () {
              results[index] = null;
            },
          )
          .then(worker);
      }
      var workers = [];
      for (var i = 0; i < Math.min(FETCH_CONCURRENCY, pages.length); i++) workers.push(worker());
      return Promise.all(workers).then(function () {
        return results.filter(Boolean);
      });
    }

    function readIndexItems(language) {
      try {
        if (language !== docs().getLanguage()) return null;
        var raw = env.localStorage.getItem(SEARCH_INDEX_PREFIX + language);
        var items = raw ? flattenSearchIndex(raw, language) : [];
        return items.length ? items : null;
      } catch (e) {
        return null;
      }
    }

    function searchItemsFor(language) {
      var indexed = readIndexItems(language);
      if (indexed) return Promise.resolve(indexed);
      return loadSidebar(language).then(loadBodies);
    }

    function withUrls(results) {
      return results.map(function (result) {
        return { title: result.title, path: result.path, url: absoluteUrl(result.path), snippet: result.snippet };
      });
    }

    function listPages(input) {
      var language = optionalLanguage((input || {}).language);
      return loadSidebar(language).then(function (pages) {
        return jsonResult({ language: language, pages: pages });
      });
    }

    function getPage(input) {
      var target = resolvePath((input || {}).path);
      return fetchText(target.url, 'Page not found: ' + target.path).then(textResult);
    }

    function validateQuery(input) {
      var query = typeof input.query === 'string' ? collapse(input.query) : '';
      if (!query || query.length > 200) throw new Error('query must be a string of 1-200 characters');
      var limit = input.limit === undefined ? 10 : input.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 20)
        throw new Error('limit must be an integer between 1 and 20');
      return { query: query, limit: limit };
    }

    function searchDocs(input) {
      var args = input || {};
      var checked = validateQuery(args);
      var language = optionalLanguage(args.language);
      return searchItemsFor(language).then(function (items) {
        return jsonResult({ language: language, results: withUrls(searchItems(items, checked.query, checked.limit)) });
      });
    }

    function navigateTo(input) {
      var target = resolvePath((input || {}).path);
      var reloading = target.language !== docs().getLanguage();
      docs().navigate(target.path);
      return Promise.resolve(jsonResult({ path: target.path, language: target.language, reloading: reloading }));
    }

    function setLanguage(input) {
      var language = assertLanguage((input || {}).language);
      var changed = docs().setLanguage(language, RELOAD_DELAY_MS) === true;
      return Promise.resolve(
        jsonResult(
          changed ? { language: language, changed: true, reloading: true } : { language: language, changed: false },
        ),
      );
    }

    // Every tool call settles as a promise: invalid input rejects instead of throwing synchronously.
    function asyncTool(fn) {
      return function (input) {
        return new Promise(function (resolve) {
          resolve(fn(input));
        });
      };
    }

    var languageProperty = { type: 'string', enum: LANGUAGES };
    var pathProperty = {
      type: 'string',
      description: 'Docs page path such as "en/getting-started/overview.md" (language prefix "en/" or "de/", .md file)',
    };

    var tools = [
      {
        name: 'list_pages',
        title: 'List documentation pages',
        description:
          'Lists all Attraccess documentation pages (title, section, path, URL) from the sidebar of one language.',
        inputSchema: {
          type: 'object',
          properties: {
            language: Object.assign(
              { description: 'Defaults to the language currently shown on the site' },
              languageProperty,
            ),
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: asyncTool(listPages),
      },
      {
        name: 'get_page',
        title: 'Read a documentation page',
        description: 'Returns the raw Markdown of one documentation page. Use list_pages or search_docs to find paths.',
        inputSchema: {
          type: 'object',
          properties: { path: pathProperty },
          required: ['path'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: asyncTool(getPage),
      },
      {
        name: 'search_docs',
        title: 'Search the documentation',
        description:
          'Full-text search over the documentation pages; all words must match. Title matches rank first. Returns titles, paths and snippets.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 200 },
            language: Object.assign(
              { description: 'Defaults to the language currently shown on the site' },
              languageProperty,
            ),
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
          required: ['query'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: asyncTool(searchDocs),
      },
      {
        name: 'navigate_to',
        title: 'Open a documentation page',
        description:
          'Shows a documentation page in the browser. Switches the site language (and reloads) when the page is in the other language.',
        inputSchema: {
          type: 'object',
          properties: { path: pathProperty },
          required: ['path'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: asyncTool(navigateTo),
      },
      {
        name: 'set_language',
        title: 'Switch the site language',
        description:
          'Switches the docs site between German (de) and English (en). The page reloads, so tools are registered again afterwards.',
        inputSchema: {
          type: 'object',
          properties: { language: languageProperty },
          required: ['language'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: asyncTool(setLanguage),
      },
    ];

    function registerOne(modelContext, tool, signal) {
      var result = modelContext.registerTool(tool, { signal: signal });
      if (result && typeof result.catch === 'function') result.catch(function () {});
    }

    // Current WebMCP: document.modelContext.registerTool; older drafts: navigator.modelContext (provideContext).
    function register() {
      try {
        var modelContext = (env.document && env.document.modelContext) || (env.navigator && env.navigator.modelContext);
        if (!modelContext) return false;
        if (typeof modelContext.registerTool === 'function') {
          var controller = new env.AbortController();
          tools.forEach(function (tool) {
            try {
              registerOne(modelContext, tool, controller.signal);
            } catch (e) {
              // a failing registration must not stop the other tools
            }
          });
          return true;
        }
        if (typeof modelContext.provideContext === 'function') {
          var maybe = modelContext.provideContext({ tools: tools });
          if (maybe && typeof maybe.catch === 'function') maybe.catch(function () {});
          return true;
        }
      } catch (e) {
        // WebMCP is optional; stay silent
      }
      return false;
    }

    return { tools: tools, register: register, resolvePath: resolvePath };
  }

  var api = {
    parseSidebar: parseSidebar,
    findDescriptions: findDescriptions,
    stripDescriptions: stripDescriptions,
    searchItems: searchItems,
    makeSnippet: makeSnippet,
    slugToPath: slugToPath,
    flattenSearchIndex: flattenSearchIndex,
    createWebMcp: createWebMcp,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      createWebMcp({
        window: window,
        document: document,
        navigator: window.navigator,
        location: window.location,
        localStorage: window.localStorage,
        fetch: window.fetch.bind(window),
        AbortController: window.AbortController,
      }).register();
    } catch (e) {
      // WebMCP is optional; stay silent
    }
  }
})();
