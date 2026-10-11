import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixtureGitEnv } from './test-utils/git-env.mjs';

function repository(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'git-hook-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = fixtureGitEnv();
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '.git/hooks');
  return { root, env, git };
}

test('precommit validates the temporary index used by git commit --only', (t) => {
  const { root, env, git } = repository(t);
  writeFileSync(path.join(root, 'good.ts'), '// baseline\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'baseline');
  writeFileSync(path.join(root, 'unrelated.ts'), '// line\n'.repeat(601));
  git('add', 'unrelated.ts');
  writeFileSync(path.join(root, 'unrelated.ts'), '// smaller working copy\n');
  writeFileSync(path.join(root, 'good.ts'), '// changed\n');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nnode "$HOOK_FILE_SIZE_SCRIPT" --staged\n', { mode: 0o755 });
  const hook = path.join(root, '.git/hooks/pre-commit');
  copyFileSync('.husky/pre-commit', hook);
  writeFileSync(hook, '#!/bin/sh\n' + readFileSync(hook, 'utf8'), { mode: 0o755 });
  const result = spawnSync('git', ['commit', '--quiet', '--only', 'good.ts', '-m', 'selected file'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...env,
      PATH: bin + path.delimiter + process.env.PATH,
      HOOK_FILE_SIZE_SCRIPT: path.resolve('scripts/check-file-size.mjs'),
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git('show', 'HEAD:good.ts'), '// changed');
  assert.equal(git('diff', '--cached', '--name-only'), 'unrelated.ts');
});

test('fixture subprocesses ignore parent hook Git settings without changing them', (t) => {
  const parent = repository(t);
  const fixture = repository(t);
  const inherited = {
    ...process.env,
    GIT_DIR: path.join(parent.root, '.git'),
    GIT_WORK_TREE: parent.root,
    GIT_INDEX_FILE: path.join(parent.root, '.git/temporary-index'),
    FIXTURE_MARKER: 'preserved',
  };
  const env = fixtureGitEnv(inherited);
  assert.equal(env.FIXTURE_MARKER, 'preserved');
  assert.equal(inherited.GIT_INDEX_FILE, path.join(parent.root, '.git/temporary-index'));
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: fixture.root, env, encoding: 'utf8' });
  assert.equal(realpathSync(root.trim()), realpathSync(fixture.root));
});
