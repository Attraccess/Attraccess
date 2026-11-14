import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkPrivateSubmodule } from './check-private-submodule.mjs';
import { fixtureGitEnv } from './test-utils/git-env.mjs';

const script = fileURLToPath(new URL('./check-private-submodule.mjs', import.meta.url));
const gitmodules = (extra = '\tupdate = none\n', url = 'https://github.com/example/private.git') =>
  `[submodule "apps/cesentry"]\n\tpath = apps/cesentry\n\turl = ${url}\n${extra}`;

function repository(t, { modules = gitmodules(), gitlink = true } = {}) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'private-submodule-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = fixtureGitEnv();
  const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--quiet');
  writeFileSync(path.join(cwd, '.gitmodules'), modules);
  git('add', '.gitmodules');
  // Any commit id works: the submodule is never fetched.
  if (gitlink)
    git('update-index', '--add', '--cacheinfo', '160000,0123456789abcdef0123456789abcdef01234567,apps/cesentry');
  const add = (file) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), 'content\n');
    git('add', '--force', file);
  };
  return { cwd, git, add };
}

test('accepts a single gitlink with update = none and an HTTPS url', (t) => {
  const { cwd } = repository(t);
  assert.deepEqual(checkPrivateSubmodule(cwd), []);
  const result = spawnSync(process.execPath, [script], { cwd, env: fixtureGitEnv(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects files committed under the submodule path', (t) => {
  const { cwd, git, add } = repository(t, { gitlink: false });
  add('apps/cesentry/README.md');
  assert.match(checkPrivateSubmodule(cwd).join('\n'), /exactly one submodule pointer.*1 entry/s);
  git('update-index', '--add', '--cacheinfo', '160000,0123456789abcdef0123456789abcdef01234567,apps/cesentry2');
  add('apps/cesentry/other.ts');
  assert.match(checkPrivateSubmodule(cwd).join('\n'), /2 entries/);
});

test('rejects a missing gitlink', (t) => {
  const { cwd } = repository(t, { gitlink: false });
  assert.match(checkPrivateSubmodule(cwd).join('\n'), /0 entries/);
  const result = spawnSync(process.execPath, [script], { cwd, env: fixtureGitEnv(), encoding: 'utf8' });
  assert.equal(result.status, 1);
});

test('requires update = none', (t) => {
  for (const extra of ['', '\tupdate = checkout\n']) {
    const { cwd } = repository(t, { modules: gitmodules(extra) });
    assert.match(checkPrivateSubmodule(cwd).join('\n'), /update = none/);
  }
});

test('requires an HTTPS url and a declaration', (t) => {
  assert.match(
    checkPrivateSubmodule(
      repository(t, { modules: gitmodules(undefined, 'git@github.com:example/private.git') }).cwd,
    ).join('\n'),
    /HTTPS url/,
  );
  const problems = checkPrivateSubmodule(repository(t, { modules: '' }).cwd).join('\n');
  assert.match(problems, /must declare/);
  assert.match(problems, /update = none/);
});

test('the CI clone step fails when the clone fails, even after skipping the submodule', (t) => {
  const require = createRequire(import.meta.url);
  const { parse } = createRequire(path.join(path.dirname(require.resolve('nx/package.json')), 'package.json'))('yaml');
  const workflow = parse(
    readFileSync(fileURLToPath(new URL('../.github/workflows/pull-requests.yml', import.meta.url)), 'utf8'),
  );
  const step = workflow.jobs['lint-and-typecheck'].steps.find((s) => s.name?.startsWith('Clone with submodules'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'private-submodule-step-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // A git that prints the skip notice but then fails the clone.
  writeFileSync(
    path.join(dir, 'git'),
    `#!/bin/sh\necho "Skipping submodule 'apps/cesentry'"\n[ "$1" = --version ] || exit 1\n`,
    {
      mode: 0o755,
    },
  );
  // GitHub runs `run:` blocks without an explicit shell as `bash -e {0}`.
  const result = spawnSync('bash', ['-e', '-c', step.run], {
    cwd: dir,
    env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, RUNNER_TEMP: dir },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, result.stdout);
});
