import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixtureGitEnv } from '../test-utils/git-env.mjs';
import { isSource, ownedFiles, workspaceFiles } from './sources.mjs';

const env = fixtureGitEnv();

function repository(dir, files) {
  mkdirSync(dir, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'commit.gpgsign', 'false');
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'init');
  return git;
}

test('workspaceFiles lists checked-out submodule files and skips gitlinks that are not checked out', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-submodules-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = repository(dir, { 'root.config.js': '', 'apps/a/project.json': '{}', 'apps/a/main.ts': '' });
  repository(path.join(dir, 'apps/private'), { 'lib/project.json': '{}', 'lib/index.ts': '', 'tools/guard.mjs': '' });
  git('add', 'apps/private');
  // A gitlink whose repository is not checked out leaves an empty directory.
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, env, encoding: 'utf8' }).trim();
  git('update-index', '--add', '--cacheinfo', `160000,${commit},apps/absent`);
  mkdirSync(path.join(dir, 'apps/absent'));

  const { files, submodules } = workspaceFiles(dir, env);
  assert.deepEqual(submodules.sort(), ['apps/absent', 'apps/private']);
  assert.deepEqual(files.sort(), [
    'apps/a/main.ts',
    'apps/a/project.json',
    'apps/private/lib/index.ts',
    'apps/private/lib/project.json',
    'apps/private/tools/guard.mjs',
    'root.config.js',
  ]);
  assert.deepEqual(ownedFiles('apps/private/lib', files, submodules).filter(isSource), ['apps/private/lib/index.ts']);
  // Files of a submodule that belong to no project stay out of the workspace root project.
  assert.deepEqual(ownedFiles('.', files, submodules).filter(isSource), ['root.config.js']);
});

test('workspaceFiles reads a submodule with its own index when GIT_INDEX_FILE names the outer one', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-submodules-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = repository(dir, { 'root.config.js': '' });
  const inner = repository(path.join(dir, 'apps/private'), { '.gitignore': '*.gen.ts\n' });
  // Tracked but ignored: listed only when the submodule's own index is read.
  writeFileSync(path.join(dir, 'apps/private/index.gen.ts'), '');
  inner('add', '--force', 'index.gen.ts');
  git('add', 'apps/private');

  // Git exports GIT_INDEX_FILE to hooks, e.g. the pre-commit hook of a linked worktree.
  const { files } = workspaceFiles(dir, { ...env, GIT_INDEX_FILE: path.join(dir, '.git', 'index') });
  assert.deepEqual(files.sort(), ['apps/private/.gitignore', 'apps/private/index.gen.ts', 'root.config.js']);
});
