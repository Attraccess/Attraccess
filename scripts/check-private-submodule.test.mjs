import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkPrivateSubmodule, SUBMODULE_URL } from './check-private-submodule.mjs';
import { fixtureGitEnv } from './test-utils/git-env.mjs';

const script = fileURLToPath(new URL('./check-private-submodule.mjs', import.meta.url));
const gitmodules = (extra = '\tupdate = none\n', url = SUBMODULE_URL) =>
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

test('accepts a single gitlink with update = none and the repository url', (t) => {
  const { cwd } = repository(t);
  assert.deepEqual(checkPrivateSubmodule(cwd), []);
  const result = spawnSync(process.execPath, [script], { cwd, env: fixtureGitEnv(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  // From a subdirectory too: paths are resolved from the repository root.
  mkdirSync(path.join(cwd, 'scripts'));
  assert.deepEqual(checkPrivateSubmodule(path.join(cwd, 'scripts')), []);
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
  assert.match(checkPrivateSubmodule(cwd).join('\n'), /pointer apps\/cesentry \(mode 160000\) is missing/);
  const result = spawnSync(process.execPath, [script], { cwd, env: fixtureGitEnv(), encoding: 'utf8' });
  assert.equal(result.status, 1);
});

test('rejects a nested gitlink in place of the pointer', (t) => {
  const { cwd, git } = repository(t, { gitlink: false });
  git('update-index', '--add', '--cacheinfo', '160000,0123456789abcdef0123456789abcdef01234567,apps/cesentry/inner');
  assert.match(checkPrivateSubmodule(cwd).join('\n'), /exactly one submodule pointer.*1 entry/s);
});

test('requires update = none', (t) => {
  for (const extra of ['', '\tupdate = checkout\n', '\tupdate = none\n\tupdate = checkout\n']) {
    const { cwd } = repository(t, { modules: gitmodules(extra) });
    assert.match(checkPrivateSubmodule(cwd).join('\n'), /update = none/);
  }
});

test('requires the repository url and a declaration', (t) => {
  for (const url of ['git@github.com:Attraccess/cesentry.git', 'https://github.com/someone-else/cesentry.git']) {
    const problems = checkPrivateSubmodule(repository(t, { modules: gitmodules(undefined, url) }).cwd);
    assert.match(problems.join('\n'), /exactly url = https:\/\/github\.com\/Attraccess\/cesentry\.git/);
  }
  const problems = checkPrivateSubmodule(repository(t, { modules: '' }).cwd).join('\n');
  assert.match(problems, /must declare/);
  assert.match(problems, /update = none/);
  const otherPath = gitmodules().replace('path = apps/cesentry', 'path = apps/other');
  assert.match(checkPrivateSubmodule(repository(t, { modules: otherPath }).cwd).join('\n'), /must declare/);
});

test('rejects any other submodule', (t) => {
  const { cwd, git } = repository(t);
  git('update-index', '--add', '--cacheinfo', '160000,0123456789abcdef0123456789abcdef01234567,vendor/other');
  assert.match(checkPrivateSubmodule(cwd).join('\n'), /the only submodule; the index also has:\n {2}vendor\/other\n/);
  const other = `${gitmodules()}[submodule "vendor/other"]\n\tpath = vendor/other\n\turl = https://example.invalid/x.git\n`;
  const problems = checkPrivateSubmodule(repository(t, { modules: other }).cwd);
  assert.deepEqual(problems, [
    '.gitmodules may only declare [submodule "apps/cesentry"]; remove submodule.vendor/other.path, ' +
      'submodule.vendor/other.url. See CONTRIBUTING.md, "Private submodule".',
  ]);
});

const workflowsDir = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
function workflow(name) {
  const require = createRequire(import.meta.url);
  const { parse } = createRequire(path.join(path.dirname(require.resolve('nx/package.json')), 'package.json'))('yaml');
  return parse(readFileSync(path.join(workflowsDir, name), 'utf8'));
}

test('PR and merge-queue CI run the pointer check', () => {
  const pullRequests = workflow('pull-requests.yml');
  assert.ok('merge_group' in pullRequests.on);
  const runs = pullRequests.jobs['lint-and-typecheck'].steps.map((step) => step.run);
  assert.ok(runs.includes('node scripts/check-private-submodule.mjs'));
});

test('no workflow checks out submodules', () => {
  for (const file of readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name))) {
    for (const [id, job] of Object.entries(workflow(file).jobs ?? {}))
      for (const step of job.steps ?? [])
        if (String(step.uses).startsWith('actions/checkout'))
          assert.ok([undefined, false, 'false'].includes(step.with?.submodules), `${file} ${id}`);
  }
});

function runCloneStep(t, gitScript) {
  const step = workflow('pull-requests.yml').jobs['lint-and-typecheck'].steps.find((s) =>
    s.name?.startsWith('Clone with submodules'),
  );
  const dir = mkdtempSync(path.join(os.tmpdir(), 'private-submodule-step-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'git'), `#!/bin/sh\n${gitScript}`, { mode: 0o755 });
  // GitHub runs `run:` blocks without an explicit shell as `bash -e {0}`.
  return spawnSync('bash', ['-e', '-c', step.run], {
    cwd: dir,
    env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, RUNNER_TEMP: dir },
    encoding: 'utf8',
  });
}

test('the CI clone step fails when the clone fails, even after skipping the submodule', (t) => {
  // A git that prints the skip notice but then fails the clone.
  const result = runCloneStep(t, `echo "Skipping submodule 'apps/cesentry'"\n[ "$1" = --version ] || exit 1\n`);
  assert.notEqual(result.status, 0, result.stdout);
});

test('the CI clone step fails when the clone has no submodule directory', (t) => {
  // A git that prints the skip notice and creates the clone without apps/cesentry.
  const result = runCloneStep(
    t,
    `echo "Skipping submodule 'apps/cesentry'"\n[ "$1" = --version ] && exit 0\nfor last; do :; done\nmkdir -p "$last"\n`,
  );
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stdout, /::error::/);
});
