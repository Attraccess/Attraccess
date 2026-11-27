import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { caseCollisions } from './check-case-collisions.mjs';
import { fixtureGitEnv } from './test-utils/git-env.mjs';

const script = fileURLToPath(new URL('./check-case-collisions.mjs', import.meta.url));

test('an extensionless import that matches two files only by case is a collision', () => {
  assert.deepEqual(caseCollisions(['src/RangeSuggestions.tsx', 'src/rangeSuggestions.ts', 'src/other.ts']), [
    ['src/RangeSuggestions', 'src/rangeSuggestions'],
  ]);
});

test('paths and folders that differ only by case collide', () => {
  assert.deepEqual(caseCollisions(['README.md', 'readme.md']), [['README.md', 'readme.md']]);
  assert.deepEqual(caseCollisions(['Docs/a.md', 'docs/b.md']), [['Docs/', 'docs/']]);
});

test('one module in two languages and different names pass', () => {
  assert.deepEqual(caseCollisions(['src/index.ts', 'src/index.tsx', 'src/Card.tsx', 'src/buildCard.ts']), []);
});

test('the CLI fails on a staged pair and names both paths', (t) => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'case-collisions-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = fixtureGitEnv();
  const git = (...args) => execFileSync('git', args, { cwd, env, stdio: 'pipe' });
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
  git('init', '--quiet');
  mkdirSync(path.join(cwd, 'src'));
  writeFileSync(path.join(cwd, 'src/Card.tsx'), 'export {};\n');
  git('add', '.');
  assert.equal(run('--staged').status, 0);

  writeFileSync(path.join(cwd, 'src/card.ts'), 'export {};\n');
  const untracked = run();
  assert.equal(untracked.status, 1, untracked.stdout + untracked.stderr);
  assert.equal(run('--staged').status, 0);

  git('add', '.');
  const staged = run('--staged');
  assert.equal(staged.status, 1);
  assert.match(staged.stderr, /src\/Card, src\/card/);
});
