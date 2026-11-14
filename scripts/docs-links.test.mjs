import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const LANGUAGES = ['en', 'de'];
const FENCE = /^\s*(```|~~~)/;

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

/** Lines outside fenced code blocks, with their 1-based numbers. */
function proseLines(file) {
  let inFence = false;
  const lines = [];
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
      } else if (!inFence) {
        lines.push({ line, number: index + 1 });
      }
    });
  return lines;
}

/** Docsify heading ids: letters and digits kept, spaces become "-", and an id that starts with a digit gets "_". */
function docsifyId(heading) {
  const text = heading
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim()
    .toLowerCase();
  const id = text
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
    .replace(/-+/g, '-');
  return /^\d/.test(id) ? `_${id}` : id;
}

const anchorCache = new Map();
function anchorsOf(file) {
  if (!anchorCache.has(file)) {
    const ids = new Set();
    for (const { line } of proseLines(file)) {
      const heading = line.match(/^#{1,6}\s+(.*?)\s*$/);
      if (heading) ids.add(docsifyId(heading[1]));
    }
    anchorCache.set(file, ids);
  }
  return anchorCache.get(file);
}

/** Internal markdown links of a line: [text](target.md#anchor), with inline code removed. */
function internalLinks(line) {
  const links = [];
  for (const match of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (!/^(https?:|mailto:|#\/)/.test(match[1])) links.push(match[1]);
  }
  return links;
}

/** Docsify resolves links from the language root, unless they start with "." (then from the page's folder). */
function resolveTarget(file, languageRoot, pathPart) {
  if (pathPart === '') return file;
  if (pathPart.startsWith('.')) return path.resolve(path.dirname(file), pathPart);
  return path.join(languageRoot, pathPart.replace(/^\//, ''));
}

function linkProblem(file, languageRoot, link) {
  const [pathPart, anchor] = link.split('#');
  const target = resolveTarget(file, languageRoot, pathPart);
  if (!fs.existsSync(target)) return `${link} (missing file)`;
  if (anchor && target.endsWith('.md') && !anchorsOf(target).has(anchor)) {
    return `${link} (no heading with that docsify id; ids that start with a digit need a "_" prefix)`;
  }
  return null;
}

test('every internal docs link points at an existing page and heading', () => {
  const problems = [];
  for (const language of LANGUAGES) {
    const languageRoot = path.join(DOCS, language);
    for (const file of markdownFiles(languageRoot)) {
      for (const { line, number } of proseLines(file)) {
        for (const link of internalLinks(line)) {
          const problem = linkProblem(file, languageRoot, link);
          if (problem) problems.push(`${path.relative(DOCS, file)}:${number} ${problem}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('docsifyId follows the docsify slug rules', () => {
  assert.equal(docsifyId('4. Replace a controller'), '_4-replace-a-controller');
  assert.equal(docsifyId('Betrieb mit einer Instanz'), 'betrieb-mit-einer-instanz');
  assert.equal(docsifyId('E/A-Pfade und `Host`-Zugriff'), 'ea-pfade-und-host-zugriff');
});
