import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  FIX_COMMAND,
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  STALE_PROBLEM,
  check,
  generate,
} from './generate-llms-txt.mjs';

const script = 'scripts/generate-llms-txt.mjs';
const DESCRIPTION = 'Explains how the fixture page works and what it contains.';

function page(title, description = DESCRIPTION) {
  return `# ${title}\n<!-- llms-description: ${description} -->\n\nBody\n`;
}

const fixtures = [];
after(() => fixtures.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

// Minimal docs tree: one ungrouped and one grouped page per language.
function makeFixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llms-txt-'));
  fixtures.push(root);
  const files = {
    'docs/CNAME': 'docs.example.org\n',
    'docs/en/_sidebar.md':
      '- [Home](home.md)\n\n- **Guides**\n  - [Setup](guides/setup.md)\n  - [Site](https://example.org/x.md)\n',
    'docs/de/_sidebar.md': '- [Startseite](home.md)\n\n- **Anleitungen**\n  - [Einrichtung](guides/setup.md)\n',
    'docs/en/home.md': page('Home'),
    'docs/en/guides/setup.md': page('Setup'),
    'docs/de/home.md': page('Startseite'),
    'docs/de/guides/setup.md': page('Einrichtung'),
    ...overrides,
  };
  for (const [file, content] of Object.entries(files)) {
    if (content === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

function makeFixtureWithLlms(overrides) {
  const root = makeFixture(overrides);
  fs.writeFileSync(path.join(root, 'docs/llms.txt'), generate(root).output);
  return root;
}

test('committed docs/llms.txt is up to date and every sidebar page has a description', () => {
  const result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /up to date/);
});

test('rejects unsupported arguments', () => {
  const result = spawnSync(process.execPath, [script, '--unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node scripts\/generate-llms-txt.mjs/);
});

test('generates llmstxt.org output: English before German, groups in sidebar order, external links skipped', () => {
  const { output, problems } = generate(makeFixture());
  assert.deepEqual(problems, []);
  assert.equal(
    output,
    [
      '# Attraccess',
      '',
      '> Attraccess is source-available machine access control and resource management software for industry, R&D and universities. It is self-hosted and combines Attractap RFID readers, flows, billing and plugins.',
      '',
      'The documentation pages are plain Markdown files. English pages live under https://docs.example.org/en/, German pages under https://docs.example.org/de/. The documentation site is https://docs.example.org/.',
      '',
      '## English',
      `- [Home](https://docs.example.org/en/home.md): ${DESCRIPTION}`,
      '',
      '## English: Guides',
      `- [Setup](https://docs.example.org/en/guides/setup.md): ${DESCRIPTION}`,
      '',
      '## Deutsch',
      `- [Startseite](https://docs.example.org/de/home.md): ${DESCRIPTION}`,
      '',
      '## Deutsch: Anleitungen',
      `- [Einrichtung](https://docs.example.org/de/guides/setup.md): ${DESCRIPTION}`,
      '',
    ].join('\n'),
  );
});

test('keeps the sidebar order when a heading comes back, and uses the innermost group', () => {
  const root = makeFixture({
    'docs/en/_sidebar.md':
      '- [Home](home.md)\n- **Guides**\n  - [Setup](guides/setup.md)\n  - **Deep**\n    - [More](more.md)\n- [Last](last.md)\n',
    'docs/en/more.md': page('More'),
    'docs/en/last.md': page('Last'),
  });
  const { output, problems } = generate(root);
  assert.deepEqual(problems, []);
  const english = output.slice(output.indexOf('## English'), output.indexOf('## Deutsch'));
  assert.deepEqual(
    english
      .split('\n')
      .filter((line) => line.startsWith('## ') || line.startsWith('- ['))
      .map((line) => line.split('](')[0]),
    ['## English', '- [Home', '## English: Guides', '- [Setup', '## English: Deep', '- [More', '## English', '- [Last'],
  );
});

test('--check passes for a fresh fixture', () => {
  assert.deepEqual(check(makeFixtureWithLlms()), []);
});

test('reports a sidebar link to a missing file', () => {
  const root = makeFixtureWithLlms();
  fs.rmSync(path.join(root, 'docs/en/guides/setup.md'));
  assert.match(check(root).join('\n'), /docs\/en\/guides\/setup\.md: .*does not exist/);
});

test('reports a page without a description', () => {
  const root = makeFixtureWithLlms();
  fs.writeFileSync(path.join(root, 'docs/de/guides/setup.md'), '# Einrichtung\n\nText\n');
  const problems = check(root).join('\n');
  assert.match(
    problems,
    /docs\/de\/guides\/setup\.md: has no llms-description comment\. Add `<!-- llms-description: <one sentence in German> -->` directly below the first H1/,
  );
});

test('reports a page with two descriptions', () => {
  const root = makeFixtureWithLlms();
  fs.appendFileSync(path.join(root, 'docs/en/home.md'), `<!-- llms-description: ${DESCRIPTION} -->\n`);
  assert.match(check(root).join('\n'), /docs\/en\/home\.md: has 2 llms-description comments\. Keep exactly one/);
});

test('ignores description comments shown inside code examples', () => {
  const example =
    '\n```md\n<!-- llms-description: Example only. -->\n```\n\nUse `<!-- llms-description: inline -->` or `` <!-- llms-description: double --> `` too.\n';
  const root = makeFixtureWithLlms({ 'docs/en/home.md': page('Home') + example });
  assert.deepEqual(check(root), []);
});

test('reports empty, multi-line and too long descriptions', () => {
  const root = makeFixtureWithLlms();
  fs.writeFileSync(path.join(root, 'docs/en/home.md'), '# Home\n<!-- llms-description:   -->\n');
  fs.writeFileSync(
    path.join(root, 'docs/en/guides/setup.md'),
    '# Setup\n<!-- llms-description: first line\nsecond line -->\n',
  );
  fs.writeFileSync(path.join(root, 'docs/de/home.md'), page('Startseite', 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1)));
  fs.writeFileSync(
    path.join(root, 'docs/de/guides/setup.md'),
    page('Einrichtung', 'x'.repeat(MIN_DESCRIPTION_LENGTH - 1)),
  );
  const problems = check(root).join('\n');
  assert.match(problems, /docs\/en\/home\.md: has an empty llms-description\. Write one sentence/);
  assert.match(
    problems,
    /docs\/en\/guides\/setup\.md: has a multi-line llms-description\. Put the sentence on one line/,
  );
  assert.match(problems, /docs\/de\/home\.md: has an llms-description of 201 characters\. Write 20-200 characters/);
  assert.match(problems, /docs\/de\/guides\/setup\.md: has an llms-description of 19 characters/);
});

test('accepts descriptions of exactly 20 and 200 characters', () => {
  const root = makeFixtureWithLlms({
    'docs/en/home.md': page('Home', 'x'.repeat(MIN_DESCRIPTION_LENGTH)),
    'docs/de/home.md': page('Startseite', 'x'.repeat(MAX_DESCRIPTION_LENGTH)),
  });
  assert.deepEqual(check(root), []);
});

test('requires the description directly below the first H1, allowing one blank line', () => {
  const comment = `<!-- llms-description: ${DESCRIPTION} -->`;
  const root = makeFixtureWithLlms({
    'docs/en/home.md': `# Home\n\n${comment}\n\nBody\n`,
    'docs/de/home.md': `\`\`\`sh\n# not a heading\n\`\`\`\n# Startseite\n${comment}\n`,
  });
  assert.deepEqual(check(root), []);
  for (const [file, content] of [
    ['docs/en/home.md', `# Home\n\nIntro first.\n\n${comment}\n`],
    ['docs/en/home.md', `${comment}\n# Home\n`],
    ['docs/en/home.md', `No heading at all.\n${comment}\n`],
  ]) {
    fs.writeFileSync(path.join(root, file), content);
    assert.match(
      check(root).join('\n'),
      /docs\/en\/home\.md: has its llms-description in the wrong place\. Move it directly below the first H1/,
      content,
    );
  }
});

test('reports a missing or stale llms.txt', () => {
  const root = makeFixtureWithLlms();
  fs.writeFileSync(path.join(root, 'docs/en/home.md'), page('Home', 'A changed description for the home page.'));
  assert.deepEqual(check(root), [STALE_PROBLEM]);
  assert.match(STALE_PROBLEM, /docs\/llms\.txt is missing or out of date\. Run `node scripts\/generate-llms-txt\.mjs`/);
  fs.rmSync(path.join(root, 'docs/llms.txt'));
  assert.deepEqual(check(root), [STALE_PROBLEM]);
});

test('the CLI fails with the files and the fix command, then regenerates llms.txt', () => {
  const root = makeFixtureWithLlms();
  fs.writeFileSync(path.join(root, 'docs/en/home.md'), '# Home\n');
  const failing = spawnSync(process.execPath, [script, '--check', `--root=${root}`], { encoding: 'utf8' });
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /docs\/en\/home\.md/);
  assert.ok(failing.stderr.includes(`Fix the pages above, then run \`${FIX_COMMAND}\``));
  const llms = fs.readFileSync(path.join(root, 'docs/llms.txt'), 'utf8');
  const refused = spawnSync(process.execPath, [script, `--root=${root}`], { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Cannot generate llms\.txt:\n {2}- docs\/en\/home\.md: has no llms-description comment/);
  assert.equal(fs.readFileSync(path.join(root, 'docs/llms.txt'), 'utf8'), llms, 'llms.txt is left alone');

  fs.writeFileSync(path.join(root, 'docs/en/home.md'), page('Home'));
  fs.writeFileSync(path.join(root, 'docs/llms.txt'), 'stale\n');
  const stale = spawnSync(process.execPath, [script, '--check', `--root=${root}`], { encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.ok(stale.stderr.includes(STALE_PROBLEM));
  assert.ok(!stale.stderr.includes('Fix the pages above'), 'no pages to fix when only llms.txt is stale');
  const written = spawnSync(process.execPath, [script, `--root=${root}`], { encoding: 'utf8' });
  assert.equal(written.status, 0, written.stderr);
  assert.equal(spawnSync(process.execPath, [script, '--check', `--root=${root}`], { encoding: 'utf8' }).status, 0);
});
