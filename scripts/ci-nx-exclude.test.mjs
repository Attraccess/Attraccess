import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TARGETS, excludesFor } from './ci-nx-exclude.mjs';

const script = fileURLToPath(new URL('./ci-nx-exclude.mjs', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = (...args) => spawnSync('node', [script, ...args], { encoding: 'utf8' });

test('lint and typecheck only skip hardware projects', () => {
  assert.equal(excludesFor('lint'), 'tag:scope:hardware');
  assert.equal(excludesFor('typecheck'), 'tag:scope:hardware');
});

test('build also skips companion and plugins', () => {
  assert.equal(excludesFor('build'), 'tag:scope:hardware,tag:scope:companion,tag:type:plugin');
});

test('every entry is a tag a project actually carries', () => {
  const tags = new Set();
  for (const file of ['apps', 'libs'].flatMap((dir) => projectFiles(dir))) {
    for (const tag of JSON.parse(readFileSync(file, 'utf8')).tags ?? []) tags.add(`tag:${tag}`);
  }
  for (const target of TARGETS) {
    for (const entry of excludesFor(target).split(','))
      assert.ok(tags.has(entry), `${target}: no project has ${entry}`);
  }
});

test('rejects unknown targets', () => {
  assert.throws(() => excludesFor('test'), /Unknown target "test"/);
  assert.throws(() => excludesFor(undefined), /Unknown target/);
});

test('CLI prints the exclude list', () => {
  const result = cli('build');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${excludesFor('build')}\n`);
  assert.equal(result.stderr, '');
});

test('CLI fails on a bad or missing target without printing to stdout', () => {
  for (const args of [['nope'], []]) {
    const result = cli(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unknown target/);
  }
});

test('workflows read the shared list instead of hard-coding one', () => {
  for (const name of ['pull-requests', 'docker-nightly-latest', 'release', 'create-release']) {
    const workflow = readFileSync(`${root}.github/workflows/${name}.yml`, 'utf8');
    assert.doesNotMatch(workflow, /--exclude=['"]?tag:/, `${name}.yml hard-codes an exclude list`);
    assert.doesNotMatch(workflow, /--exclude="\$\(node/, `${name}.yml must assign the list before using it`);
    assert.match(workflow, /node scripts\/ci-nx-exclude\.mjs/, `${name}.yml does not use the shared list`);
  }
});

function projectFiles(dir) {
  const result = spawnSync('git', ['ls-files', '--', `${dir}/**/project.json`], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((file) => `${root}${file}`);
}
