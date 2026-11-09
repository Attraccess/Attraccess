import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

import { excludesFor } from './ci-nx-exclude.mjs';

test('lint and typecheck only skip hardware projects', () => {
  assert.equal(excludesFor('lint'), 'tag:scope:hardware');
  assert.equal(excludesFor('typecheck'), 'tag:scope:hardware');
});

test('build also skips companion and plugins', () => {
  assert.equal(excludesFor('build'), 'tag:scope:hardware,tag:scope:companion,tag:type:plugin');
});

test('rejects unknown targets', () => {
  assert.throws(() => excludesFor('test'), /Unknown target "test"/);
  assert.throws(() => excludesFor(undefined), /Unknown target/);
});

test('CLI prints the exclude list and fails on a bad target', () => {
  const script = new URL('./ci-nx-exclude.mjs', import.meta.url).pathname;
  assert.equal(execFileSync('node', [script, 'build'], { encoding: 'utf8' }).trim(), excludesFor('build'));
  assert.throws(() => execFileSync('node', [script, 'nope'], { stdio: 'pipe' }));
});
