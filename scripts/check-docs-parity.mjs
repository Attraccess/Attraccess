/* eslint-disable no-console -- Documentation check diagnostics are intentional. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

function pages(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pages(path, root);
    return entry.name.endsWith('.md') ? [relative(root, path)] : [];
  });
}

// Compare content structure, not translated words. Ignore code contents and
// localized heading fragments; examples and translation accuracy need review.
function structure(markdown) {
  const sections = [[]];
  let fence = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      sections.at(-1).push(`code:${marker[2].trim()}`);
    } else if (/^#{1,6} /.test(line)) {
      sections.push([line.match(/^#+/)[0]]);
    } else if (/^\s*\|/.test(line)) {
      sections.at(-1).push('table-row');
    } else if (/^\s*[-*] /.test(line)) {
      sections.at(-1).push('bullet');
    } else if (/^\s*\d+\. /.test(line)) {
      sections.at(-1).push('numbered-item');
    }
  }
  if (fence) throw new Error('Unclosed code fence');
  return sections;
}

function links(markdown) {
  return [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1].split('#')[0]);
}

function navigation(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.replace(/\[[^\]]+\]/g, '[label]').replace(/\*\*.+?\*\*/g, '**group**'));
}

const english = pages(join(docsRoot, 'en')).sort();
const german = pages(join(docsRoot, 'de')).sort();
const failures = [];
for (const page of new Set([...english, ...german])) {
  if (!english.includes(page) || !german.includes(page)) {
    failures.push(`${page}: missing ${english.includes(page) ? 'German' : 'English'} translation`);
    continue;
  }
  const en = readFileSync(join(docsRoot, 'en', page), 'utf8');
  const de = readFileSync(join(docsRoot, 'de', page), 'utf8');
  for (const [language, markdown] of [
    ['en', en],
    ['de', de],
  ]) {
    for (const target of links(markdown)) {
      if (!target.endsWith('.md') || /^(?:https?:|mailto:)/.test(target)) continue;
      // Docsify's default routing resolves page links from the language root.
      if (!existsSync(join(docsRoot, language, target))) failures.push(`${language}/${page}: missing page ${target}`);
    }
  }
  for (const [name, compare] of [
    ['section, list, table or code-example structure', structure],
    ['link destinations or order', links],
    ...(page === '_sidebar.md' ? [['navigation hierarchy', navigation]] : []),
  ]) {
    try {
      if (JSON.stringify(compare(en)) !== JSON.stringify(compare(de))) failures.push(`${page}: different ${name}`);
    } catch (error) {
      failures.push(`${page}: ${error.message}`);
    }
  }
}

if (failures.length) {
  console.error('English and German documentation must be translated replicas:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Documentation parity passed: ${english.length} translated page pairs with matching navigation and structure.`,
  );
}
