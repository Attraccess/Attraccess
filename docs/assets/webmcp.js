// ===== WebMCP: read-only docs tools for in-browser AI agents (experimental) =====
// Classic script, no dependencies. Registers tools only when the browser exposes WebMCP
// (document.modelContext, or navigator.modelContext in older drafts). Never throws, never logs.
// It also keeps the hidden llms-description comments out of the Docsify search index.
// The pure helpers are exported via module.exports so Node (tests, scripts/generate-llms-txt.mjs)
// parses sidebars and description comments exactly like the browser does.
(function () {
  'use strict';

  var LANGUAGES = ['de', 'en'];
  var SEARCH_INDEX_PREFIX = 'docsify.search.index/attraccess-docs-';
  var FETCH_CONCURRENCY = 6;
  var SNIPPET_LENGTH = 200;
  var RELOAD_DELAY_MS = 150;
  var MAX_PATH_LENGTH = 500;
  var BULLET = '^(\\s*)(?:[-*+]|\\d+[.)])\\s+';
  // Optional Docsify link title or options: [Title](page.md "tip") or [Title](page.md ':target=_blank')
  var SIDEBAR_LINK = new RegExp(BULLET + '\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+(?:"[^"]*"|\'[^\']*\'))?\\)\\s*$');
  var SIDEBAR_GROUP = new RegExp(BULLET + '\\*\\*(.+?)\\*\\*\\s*$');
  // Allow list for page paths: "<lang>/<folders>/<name>.md". Folders hold letters, digits, ".", "_" and "-"
  // and start with a letter or digit; the file name has no "." (Docsify would load "a.html.md" as "a.html").
  // Rules out "..", "_sidebar.md", "%" escapes and ":" (Docsify treats routes with ":" as absolute URLs).
  var PAGE_PATH = /^(de|en)\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9_-]*\.md$/;
  // A fenced code block, an inline code span, or a description comment (group 4). Code is matched first,
  // so comments shown as examples inside code are never treated as descriptions.
  var CODE_OR_DESCRIPTION =
    /^[ \t]*(`{3,})[^\n]*\n[\s\S]*?^[ \t]*\1`*[ \t]*\r?$|^[ \t]*(~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2~*[ \t]*\r?$|(`+)[^\n]*?\3|<!--\s*llms-description:([\s\S]*?)-->[ \t]*\r?\n?/gm;

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

  // Docsify sidebar markdown -> [{ title, section, href }]. Bold-only list items start a section that
  // holds the more deeply indented links below it; external, non-.md and anchor links are skipped.
  function parseSidebar(markdown) {
    var groups = [];
    var entries = [];
    function closeGroups(indent) {
      while (groups.length && groups[groups.length - 1].indent >= indent) groups.pop();
    }
    String(markdown)
      .split(/\r?\n/)
      .forEach(function (line) {
        var group = SIDEBAR_GROUP.exec(line);
        var link = SIDEBAR_LINK.exec(line);
        if (group) {
          closeGroups(group[1].length);
          groups.push({ indent: group[1].length, name: group[2].trim() });
        } else if (link && isPageLink(link[3])) {
          closeGroups(link[1].length);
          var section = groups.length ? groups[groups.length - 1].name : '';
          entries.push({ title: link[2].trim(), section: section, href: normalizeHref(link[3]) });
        }
      });
    return entries;
  }

  // Rewrites code and description comments: keep(match, description) gets description undefined for code.
  function mapCodeAndDescriptions(markdown, keep) {
    return String(markdown).replace(CODE_OR_DESCRIPTION, function (match, fence, tildes, ticks, text) {
      return keep(match, text);
    });
  }

  // The page without code blocks and code spans (description comments stay).
  function withoutCode(markdown) {
    return mapCodeAndDescriptions(markdown, function (match, description) {
      return description === undefined ? '' : match;
    });
  }

  // All llms-description comment texts (trimmed) found in a page, ignoring code examples.
  function findDescriptions(markdown) {
    var found = [];
    mapCodeAndDescriptions(markdown, function (match, description) {
      if (description !== undefined) found.push(description.trim());
      return match;
    });
    return found;
  }

  // The page without its description comments; examples inside code stay.
  function stripDescriptions(markdown) {
    return mapCodeAndDescriptions(markdown, function (match, description) {
      return description === undefined ? match : '';
    });
  }

  function isPagePath(path) {
    return PAGE_PATH.test(path);
  }

  // The first H1 of a page, the title Docsify's search index uses too.
  function pageTitle(markdown) {
    var heading = /^#[ \t]+(.+?)[ \t#]*$/m.exec(withoutCode(markdown));
    return heading ? heading[1] : '';
  }

  function collapse(text) {
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function makeSnippet(body, terms) {
    var text = collapse(body);
    var lower = text.toLowerCase();
    var first = Infinity;
    terms.forEach(function (term) {
      if (lower.indexOf(term) >= 0) first = Math.min(first, lower.indexOf(term));
    });
    var start = first === Infinity ? 0 : Math.max(0, first - 60);
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

  // items: [{ title, path, body }] -> best matches first (title matches above body matches),
  // one result per path, ties keep input order. Hidden description comments are never searched.
  function searchItems(items, query, limit) {
    var terms = collapse(query).toLowerCase().split(' ');
    var seen = {};
    return items
      .map(function (item, index) {
        var visible = { title: item.title, path: item.path, body: stripDescriptions(item.body || '') };
        return { item: visible, index: index, score: scoreItem(visible, terms) };
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
        return { title: item.title, path: item.path, snippet: makeSnippet(item.body || item.title, terms) };
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

  // Turns the localStorage value of the Docsify search plugin ({ page: { slug: { slug, title, body } } },
  // one entry per heading) into one item per page, so results match the fetch-based search: the page
  // title comes from its first entry (the H1) and the body joins all sections.
  function flattenSearchIndex(raw, language) {
    var index = JSON.parse(raw);
    var items = [];
    Object.keys(index || {}).forEach(function (page) {
      var entries = Object.keys(index[page] || {}).map(function (key) {
        return Object.assign({ slug: key }, index[page][key]);
      });
      if (!entries.length) return;
      var path = slugToPath(entries[0].slug, language);
      var body = entries
        .map(function (entry, position) {
          return (position ? (entry.title || '') + '\n' : '') + (entry.body || '');
        })
        .join('\n');
      if (isPagePath(path)) items.push({ title: entries[0].title || '', body: body, path: path });
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
      if (!api) throw new Error('The docs site is not ready yet; try again in a moment');
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

    function invalidPath(raw) {
      return new Error('Invalid path (no "..", "//", backslashes, control characters or bad %-encoding): ' + raw);
    }

    // Rejects inputs whose text could mean something other than what the URL parser resolves.
    function checkPathText(raw) {
      var decoded;
      try {
        decoded = decodeURIComponent(raw);
      } catch (e) {
        throw invalidPath(raw);
      }
      var withoutScheme = decoded.replace(/^https?:\/\//i, '');
      var unsafe =
        /[\u0000-\u001f\u007f\\]/.test(decoded) ||
        withoutScheme.indexOf('//') >= 0 ||
        /(^|\/)\.\.(\/|$)/.test(withoutScheme);
      if (unsafe) throw invalidPath(raw);
    }

    // Accepts "en/x.md", "/en/x.md" or a same-origin URL under the docs base. Returns { language, path, url }.
    function resolvePath(input) {
      if (typeof input !== 'string' || !input.trim() || input.length > MAX_PATH_LENGTH)
        throw new Error('path must be a non-empty string of at most ' + MAX_PATH_LENGTH + ' characters');
      var base = docs().docsBase;
      var raw = input.trim();
      checkPathText(raw);
      var relative = /^\/(?!\/)/.test(raw) && raw.indexOf(base) !== 0 ? raw.slice(1) : raw;
      var url = new URL(relative, loc.origin + base);
      var rest = url.pathname.slice(base.length);
      if (url.origin !== loc.origin || url.pathname.indexOf(base) !== 0 || !isPagePath(rest))
        throw new Error(
          'Path is outside the documentation pages (expected e.g. en/getting-started/overview.md): ' + raw,
        );
      return { language: rest.split('/')[0], path: rest, url: loc.origin + url.pathname };
    }

    function loadSidebar(language) {
      return cachedText(
        absoluteUrl(language + '/_sidebar.md'),
        'Could not load the sidebar for language ' + language,
      ).then(function (markdown) {
        return parseSidebar(markdown)
          .map(function (entry) {
            var path = language + '/' + entry.href;
            return { title: entry.title, section: entry.section, path: path, url: absoluteUrl(path) };
          })
          .filter(function (page) {
            return isPagePath(page.path);
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
              results[index] = { title: pageTitle(text) || pages[index].title, path: pages[index].path, body: text };
            },
            function () {}, // an unreadable page is left out
          )
          .then(worker);
      }
      var workers = [];
      for (var i = 0; i < Math.min(FETCH_CONCURRENCY, pages.length); i++) workers.push(worker());
      return Promise.all(workers).then(function () {
        var loaded = results.filter(Boolean);
        if (pages.length && !loaded.length) throw new Error('Could not load any documentation page');
        return loaded;
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
      return fetchText(target.url, 'Page not found: ' + target.path + '. Use list_pages to get valid paths.').then(
        textResult,
      );
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
      var result = docs().navigate(target.path, RELOAD_DELAY_MS);
      var reloading = Boolean(result && result.reloading);
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
    var optionalLanguageProperty = { type: 'string', enum: LANGUAGES, description: 'Default: the language shown now' };
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
            language: optionalLanguageProperty,
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
            query: { type: 'string', minLength: 1, maxLength: 200, description: 'Words that must all appear' },
            language: optionalLanguageProperty,
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 10, description: 'Maximum results' },
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
          'Shows a documentation page in the browser. Paths come from list_pages or search_docs. A page in the other language switches the site language and reloads the page shortly after this result (reloading: true); the tools are then registered again.',
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
          'Switches the docs site between German (de) and English (en). If the language changes, the page reloads shortly after this result and the tools are registered again; wait before calling another tool.',
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

    return { tools: tools, register: register };
  }

  // Docsify's search plugin loads pages through window.Docsify.get and indexes their raw text, which
  // would include the hidden description comments. Wraps get so the plugin receives the text without them.
  function installSearchFilter(win) {
    var docsify = win.Docsify;
    if (!docsify || typeof docsify.get !== 'function' || docsify.get.withoutDescriptions) return false;
    var originalGet = docsify.get;
    function get() {
      var request = originalGet.apply(this, arguments);
      return {
        then: function (onSuccess, onError) {
          return request.then(function (text) {
            var args = Array.prototype.slice.call(arguments);
            if (typeof text === 'string') args[0] = stripDescriptions(text);
            return onSuccess.apply(this, args);
          }, onError);
        },
        abort: request.abort,
      };
    }
    get.withoutDescriptions = true;
    docsify.get = get;
    return true;
  }

  // Runs in the browser: adds the search filter as a Docsify plugin and registers the WebMCP tools.
  function start(win) {
    var config = win.$docsify;
    if (config) {
      config.plugins = (config.plugins || []).concat(function () {
        installSearchFilter(win);
      });
    }
    return createWebMcp({
      window: win,
      document: win.document,
      navigator: win.navigator,
      location: win.location,
      localStorage: win.localStorage,
      fetch: win.fetch.bind(win),
      AbortController: win.AbortController,
    }).register();
  }

  var api = {
    parseSidebar: parseSidebar,
    withoutCode: withoutCode,
    findDescriptions: findDescriptions,
    stripDescriptions: stripDescriptions,
    isPagePath: isPagePath,
    pageTitle: pageTitle,
    searchItems: searchItems,
    makeSnippet: makeSnippet,
    slugToPath: slugToPath,
    flattenSearchIndex: flattenSearchIndex,
    createWebMcp: createWebMcp,
    installSearchFilter: installSearchFilter,
    start: start,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      start(window);
    } catch (e) {
      // WebMCP is optional; stay silent
    }
  }
})();
