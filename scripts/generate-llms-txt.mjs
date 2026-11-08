#!/usr/bin/env node
// Generates docs/llms.txt (https://llmstxt.org) from the docs sidebars.
// Every page linked from a sidebar needs one `<!-- llms-description: ... -->` comment below its H1.
//
//   node scripts/generate-llms-txt.mjs          write docs/llms.txt
//   node scripts/generate-llms-txt.mjs --check  fail if a page is missing its description or llms.txt is stale
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
// The same sidebar parser the browser uses, so llms.txt and the WebMCP tools cannot disagree.
const { parseSidebar, findDescriptions } = require(path.join(defaultRoot, 'docs/assets/webmcp.js'));

export const MAX_DESCRIPTION_LENGTH = 200;
export const FIX_COMMAND = 'node scripts/generate-llms-txt.mjs';

const LANGUAGES = [
  { code: 'en', label: 'English', home: 'Home' },
  { code: 'de', label: 'Deutsch', home: 'Startseite' },
];

const SUMMARY =
  'Attraccess is source-available machine access control and resource management software for industry, R&D and universities. ' +
  'It is self-hosted and combines Attractap RFID readers, flows, billing and plugins.';

const INTRO = (baseUrl) =>
  `The documentation pages are plain Markdown files. English pages live under ${baseUrl}/en/, German pages under ${baseUrl}/de/. ` +
  `The documentation site is ${baseUrl}/.`;

function descriptionProblem(markdown) {
  const found = findDescriptions(markdown);
  if (found.length !== 1) {
    return `has ${found.length} llms-description comments (exactly one is required, directly below the H1)`;
  }
  const [text] = found;
  if (!text) return 'has an empty llms-description';
  if (/[\r\n]/.test(text)) return 'has a multi-line llms-description (keep it on one line)';
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    return `has an llms-description of ${text.length} characters (maximum ${MAX_DESCRIPTION_LENGTH})`;
  }
  return null;
}

function readPage(docsDir, language, entry, problems) {
  const relative = `docs/${language}/${entry.href}`;
  const file = path.join(docsDir, language, entry.href);
  if (!fs.existsSync(file)) {
    problems.push(`${relative}: linked from docs/${language}/_sidebar.md but the file does not exist`);
    return null;
  }
  const markdown = fs.readFileSync(file, 'utf8');
  const problem = descriptionProblem(markdown);
  if (problem) {
    problems.push(
      `${relative}: ${problem}. Add \`<!-- llms-description: <one sentence in ${language === 'de' ? 'German' : 'English'}> -->\` below the first H1.`,
    );
    return null;
  }
  return findDescriptions(markdown)[0];
}

function renderLanguage(docsDir, baseUrl, language, problems) {
  const sidebarFile = path.join(docsDir, language.code, '_sidebar.md');
  const entries = parseSidebar(fs.readFileSync(sidebarFile, 'utf8'));
  const sections = [];
  for (const entry of entries) {
    const heading = entry.section ? `${language.label}: ${entry.section}` : language.label;
    let section = sections.find((candidate) => candidate.heading === heading);
    if (!section) {
      section = { heading, lines: [] };
      sections.push(section);
    }
    const description = readPage(docsDir, language.code, entry, problems);
    const url = `${baseUrl}/${language.code}/${entry.href}`;
    section.lines.push(`- [${entry.title}](${url}): ${description ?? ''}`);
  }
  return sections.map((section) => `## ${section.heading}\n${section.lines.join('\n')}`);
}

/** Returns { output, problems } for the docs folder at `root`. */
export function generate(root = defaultRoot) {
  const docsDir = path.join(root, 'docs');
  const cname = fs.readFileSync(path.join(docsDir, 'CNAME'), 'utf8').trim();
  const baseUrl = `https://${cname}`;
  const problems = [];
  const sections = LANGUAGES.flatMap((language) => renderLanguage(docsDir, baseUrl, language, problems));
  const output = ['# Attraccess', `> ${SUMMARY}`, INTRO(baseUrl), ...sections].join('\n\n') + '\n';
  return { output, problems };
}

/** Returns the list of problems that make `--check` fail (empty when everything is fine). */
export function check(root = defaultRoot) {
  const { output, problems } = generate(root);
  if (problems.length) return problems;
  const file = path.join(root, 'docs/llms.txt');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return current === output
    ? []
    : ['docs/llms.txt is missing or out of date with the docs sidebars and page descriptions'];
}

function main(rawArgs) {
  // --root=<dir> points at another checkout (used by the tests)
  const rootArg = rawArgs.find((arg) => arg.startsWith('--root='));
  const root = rootArg ? path.resolve(rootArg.slice('--root='.length)) : defaultRoot;
  const args = rawArgs.filter((arg) => arg !== rootArg);
  if (args.some((arg) => arg !== '--check')) {
    console.error('Usage: node scripts/generate-llms-txt.mjs [--check]');
    return 1;
  }
  if (args.includes('--check')) {
    const problems = check(root);
    if (!problems.length) {
      console.log('docs/llms.txt is up to date.');
      return 0;
    }
    console.error(`llms.txt check failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    console.error(`\nFix the pages above, then run \`${FIX_COMMAND}\` and commit docs/llms.txt.`);
    return 1;
  }
  const { output, problems } = generate(root);
  if (problems.length) {
    console.error(`Cannot generate llms.txt:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    return 1;
  }
  fs.writeFileSync(path.join(root, 'docs/llms.txt'), output);
  console.log('Wrote docs/llms.txt');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
