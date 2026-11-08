import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { check, generate } from './generate-llms-txt.mjs';

const script = 'scripts/generate-llms-txt.mjs';
const DESCRIPTION = 'Explains how the fixture page works and what it contains.';

function page(title, description = DESCRIPTION) {
  return `# ${title}\n<!-- llms-description: ${description} -->\n\nBody\n`;
}

// Minimal docs tree: one ungrouped and one grouped page per language.
function makeFixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llms-txt-'));
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
      output.split('\n')[2],
      '',
      output.split('\n')[4],
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
  assert.match(output.split('\n')[2], /^> /);
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
  assert.match(problems, /docs\/de\/guides\/setup\.md: has 0 llms-description comments/);
  assert.match(problems, /German/);
});

test('reports a page with two descriptions', () => {
  const root = makeFixtureWithLlms();
  fs.appendFileSync(path.join(root, 'docs/en/home.md'), `<!-- llms-description: ${DESCRIPTION} -->\n`);
  assert.match(check(root).join('\n'), /docs\/en\/home\.md: has 2 llms-description comments/);
});

test('ignores description comments shown inside code examples', () => {
  const example =
    '\n```md\n<!-- llms-description: Example only. -->\n```\n\nUse `<!-- llms-description: inline -->` too.\n';
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
  fs.writeFileSync(path.join(root, 'docs/de/home.md'), page('Startseite', 'x'.repeat(201)));
  const problems = check(root).join('\n');
  assert.match(problems, /docs\/en\/home\.md: has an empty llms-description/);
  assert.match(problems, /docs\/en\/guides\/setup\.md: has a multi-line llms-description/);
  assert.match(problems, /docs\/de\/home\.md: has an llms-description of 201 characters \(maximum 200\)/);
});

test('reports a missing or stale llms.txt', () => {
  const root = makeFixtureWithLlms();
  fs.writeFileSync(path.join(root, 'docs/en/home.md'), page('Home', 'A changed description for the home page.'));
  assert.match(check(root).join('\n'), /docs\/llms\.txt is missing or out of date/);
  fs.rmSync(path.join(root, 'docs/llms.txt'));
  assert.match(check(root).join('\n'), /docs\/llms\.txt is missing or out of date/);
});

test('the CLI fails with the files and the fix command, then regenerates llms.txt', () => {
  const root = makeFixtureWithLlms();
  fs.writeFileSync(path.join(root, 'docs/en/home.md'), '# Home\n');
  const failing = spawnSync(process.execPath, [script, '--check', `--root=${root}`], { encoding: 'utf8' });
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /docs\/en\/home\.md/);
  assert.match(failing.stderr, /node scripts\/generate-llms-txt\.mjs/);
  assert.equal(spawnSync(process.execPath, [script, `--root=${root}`], { encoding: 'utf8' }).status, 1);

  fs.writeFileSync(path.join(root, 'docs/en/home.md'), page('Home'));
  fs.writeFileSync(path.join(root, 'docs/llms.txt'), 'stale\n');
  assert.equal(spawnSync(process.execPath, [script, '--check', `--root=${root}`], { encoding: 'utf8' }).status, 1);
  const written = spawnSync(process.execPath, [script, `--root=${root}`], { encoding: 'utf8' });
  assert.equal(written.status, 0, written.stderr);
  assert.equal(spawnSync(process.execPath, [script, '--check', `--root=${root}`], { encoding: 'utf8' }).status, 0);
});
