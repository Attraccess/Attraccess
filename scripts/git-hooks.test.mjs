import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('precommit clears hook Git settings before tests use fixture repositories', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'git-hook-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = path.join(root, 'fixture');
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  execFileSync('git', ['init', '--quiet', fixture]);
  writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\ngit -C "$HOOK_FIXTURE_REPO" rev-parse --show-toplevel\n', {
    mode: 0o755,
  });
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  const result = spawnSync('bash', ['.husky/pre-commit'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      GIT_DIR: gitDir,
      GIT_WORK_TREE: process.cwd(),
      GIT_INDEX_FILE: path.join(gitDir, 'index'),
      HOOK_FIXTURE_REPO: fixture,
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(realpathSync(result.stdout.trim()), realpathSync(fixture));
});
