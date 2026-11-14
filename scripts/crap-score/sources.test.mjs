import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { isSource, ownedFiles, workspaceFiles } from './sources.mjs';

function repository(dir, files) {
  mkdirSync(dir, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'init');
  return git;
}

test('workspaceFiles lists checked-out submodule files and skips gitlinks that are not checked out', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crap-submodules-'));
  try {
    const git = repository(dir, { 'root.config.js': '', 'apps/a/project.json': '{}', 'apps/a/main.ts': '' });
    repository(path.join(dir, 'apps/private'), { 'lib/project.json': '{}', 'lib/index.ts': '', 'tools/guard.mjs': '' });
    git('add', 'apps/private');
    // A gitlink whose repository is not checked out leaves an empty directory.
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    git('update-index', '--add', '--cacheinfo', `160000,${commit},apps/absent`);
    mkdirSync(path.join(dir, 'apps/absent'));

    const { files, submodules } = workspaceFiles(dir);
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
