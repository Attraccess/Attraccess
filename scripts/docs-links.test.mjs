import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Checks internal links in docs/<lang>/ the way the docs site (docsify 4.13.1, hash routing, relativePath off)
// resolves them. Not handled, because the docs do not use them: setext headings, headings inside blockquotes or
// lists, reference-style links, raw <a href> links, links split across lines and percent-encoded anchors.

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const LANGUAGES = ['en', 'de'];

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

/** Lines outside fenced code blocks, with their 1-based numbers. A fence closes only with its own bare marker. */
function proseLines(text) {
  let fence = null;
  const lines = [];
  text.split('\n').forEach((line, index) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      const bare = /^\s*(`{3,}|~{3,})\s*$/.test(line);
      if (bare && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (marker) {
      fence = marker;
    } else {
      lines.push({ line, number: index + 1 });
    }
  });
  return lines;
}

const escapeHtml = (text) =>
  text
    .replace(/&(?!#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Rough marked inline rendering of a heading: escaped text, markup turned into tags. */
function headingHtml(heading) {
  const parts = heading.split(/(`[^`]*`)/);
  return parts
    .map((part) => {
      if (/^`[^`]*`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return escapeHtml(part.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|\W)__(.+?)__(?!\w)/g, '$1<strong>$2</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/(^|\W)_(.+?)_(?!\w)/g, '$1<em>$2</em>');
    })
    .join('');
}

/** docsify 4.13.1 slugify: lowercases A-Z only, strips tags and ASCII punctuation, "_" before a leading digit. */
function slugify(html) {
  let text = html.trim().replace(/[A-Z]+/g, (s) => s.toLowerCase());
  // Strip tags until nothing changes, so a removal can never assemble a new tag.
  for (let previous = ''; previous !== text; ) {
    previous = text;
    text = text.replace(/<[^>]+>/g, '');
  }
  return text
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s/g, '-')
    .replace(/-+/g, '-')
    .replace(/^(\d)/, '_$1');
}

/** Heading ids of one page in order; repeated slugs get "-1", "-2", … like docsify. */
function headingIds(text) {
  const counts = new Map();
  const ids = [];
  for (const { line } of proseLines(text)) {
    const heading = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)?.[1];
    if (heading === undefined) continue;
    const explicitId = heading.match(/:id=([\w%-]+)/)?.[1];
    const source = heading
      .replace(/:id=[\w%-]+/, '')
      .replace(/<!-- \{docsify-ignore(-all)?\} -->|\{docsify-ignore(-all)?\}/g, '');
    const slug = slugify(explicitId ?? headingHtml(source));
    const count = counts.has(slug) ? counts.get(slug) + 1 : 0;
    counts.set(slug, count);
    ids.push(count ? `${slug}-${count}` : slug);
  }
  return ids;
}

const anchorCache = new Map();
function anchorsOf(file) {
  if (!anchorCache.has(file)) anchorCache.set(file, new Set(headingIds(fs.readFileSync(file, 'utf8'))));
  return anchorCache.get(file);
}

/** Internal links of a line, with inline code removed: { image, target }. Links docsify does not compile are skipped. */
function internalLinks(line) {
  const links = [];
  const pattern = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+("[^"]*"|'[^']*'))?\)/g;
  for (const [, bang, target, title = ''] of line.replace(/`[^`]*`/g, '').matchAll(pattern)) {
    if (/^(https?:|mailto:|#\/)/.test(target) || /:(ignore|include)\b/.test(title)) continue;
    links.push({ image: bang === '!', target });
  }
  return links;
}

function linkProblem(file, languageRoot, { image, target }) {
  const [pathPart, anchor] = target.split('#');
  if (image) {
    // Images are resolved from the page's folder.
    return fs.existsSync(path.resolve(path.dirname(file), pathPart)) ? null : `${target} (missing image)`;
  }
  if (pathPart.startsWith('.')) {
    // relativePath is off: "../x.md" becomes "#/../x", which leaves the language root.
    return `${target} (relative page link; write it from the language root, e.g. plugins/x.md)`;
  }
  const page = pathPart === '' ? file : path.join(languageRoot, pathPart.replace(/^\//, ''));
  if (!fs.existsSync(page)) return `${target} (missing file)`;
  if (anchor && page.endsWith('.md') && !anchorsOf(page).has(anchor)) {
    return `${target} (no heading with that docsify id)`;
  }
  return null;
}

test('every internal docs link points at an existing page and heading', () => {
  const problems = [];
  for (const language of LANGUAGES) {
    const languageRoot = path.join(DOCS, language);
    for (const file of markdownFiles(languageRoot)) {
      for (const { line, number } of proseLines(fs.readFileSync(file, 'utf8'))) {
        for (const link of internalLinks(line)) {
          const problem = linkProblem(file, languageRoot, link);
          if (problem) problems.push(`${path.relative(DOCS, file)}:${number} ${problem}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('heading ids follow docsify slug rules', () => {
  const ids = headingIds(
    [
      '# 4. Replace a controller',
      '## Betrieb mit einer Instanz',
      '## E/A-Pfade und `Host`-Zugriff',
      '## Änderungen & Tests',
      "## Operator's **view**",
      '## Setup',
      '## Setup',
      '```md',
      '## Not a heading',
      '~~~',
      '## Still not a heading',
      '```',
      '## Custom :id=my-anchor',
      '## Ignored {docsify-ignore}',
      '## http_requests_total and _emphasis_',
      '## A &amp; B',
      '```js title',
      '## Inside a fence with an info string',
      '```',
    ].join('\n'),
  );
  assert.deepEqual(ids, [
    '_4-replace-a-controller',
    'betrieb-mit-einer-instanz',
    'ea-pfade-und-host-zugriff',
    'Änderungen-amp-tests',
    'operator39s-view',
    'setup',
    'setup-1',
    'my-anchor',
    'ignored',
    'http_requests_total-and-emphasis',
    'a-amp-b',
  ]);
});

test('relative page links are rejected, relative images are resolved from the page folder', () => {
  const file = path.join(DOCS, 'en', 'attractap', 'using-the-reader.md');
  const root = path.join(DOCS, 'en');
  assert.match(linkProblem(file, root, { image: false, target: '../settings/security.md' }), /relative page link/);
  assert.equal(linkProblem(file, root, { image: false, target: 'settings/security.md' }), null);
  assert.match(linkProblem(file, root, { image: true, target: '../missing.png' }), /missing image/);
});

test('links with a single-quoted title are checked, :ignore links are skipped', () => {
  assert.deepEqual(internalLinks("[a](x.md#c 'title') and [b](y.md ':ignore')"), [{ image: false, target: 'x.md#c' }]);
});
