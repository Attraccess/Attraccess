import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';

import {
  DEFAULT_PUSH_ATTEMPTS,
  ReleaseError,
  createGit,
  githubReleaseClient,
  isPrerelease,
  optionsFromEnv,
  releaseCommitMessage,
  runRelease,
  setOutputs,
} from './create-release.mjs';
import { fixtureGitEnv } from './test-utils/git-env.mjs';

const MESSAGE = 'chore(release): {version} [skip ci]';
// The developer's global config may sign commits or set hooks; the fixtures must not depend on it.
const env = { ...fixtureGitEnv(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const sh = (cwd, ...args) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function clone(root, remote, name) {
  const dir = path.join(root, name);
  sh(root, 'clone', '--quiet', remote, dir);
  sh(dir, 'config', 'user.name', name);
  sh(dir, 'config', 'user.email', `${name}@example.com`);
  return dir;
}

function commitFile(dir, file, content, message) {
  writeFileSync(path.join(dir, file), content);
  sh(dir, 'add', file);
  sh(dir, 'commit', '--quiet', '-m', message);
}

/** A bare `origin` with release v1.0.0 on main, the CI checkout `ci` and a `dev` clone that merges PRs. */
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'create-release-'));
  roots.push(root);
  const remote = path.join(root, 'origin.git');
  sh(root, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  const seed = clone(root, remote, 'seed');
  commitFile(seed, 'package.json', JSON.stringify({ version: '1.0.0' }), 'chore(release): 1.0.0 [skip ci]');
  sh(seed, 'tag', '--annotate', 'v1.0.0', '--message', 'v1.0.0');
  commitFile(seed, 'a.txt', 'a', 'feat: before the release run');
  sh(seed, 'push', '--quiet', '--follow-tags', 'origin', 'main');
  const ci = clone(root, remote, 'ci');
  const dev = clone(root, remote, 'dev');
  let merged = 0;
  const mergePr = (subject = `fix: merged during the run ${++merged}`) => {
    sh(dev, 'pull', '--quiet', '--rebase', 'origin', 'main');
    commitFile(dev, `pr-${merged}-${Date.now()}.txt`, subject, subject);
    sh(dev, 'push', '--quiet', 'origin', 'main');
    return subject;
  };
  return { root, remote, ci, dev, git: createGit({ cwd: ci, env }), mergePr };
}

/** Stands in for nx: bumps package.json, writes CHANGELOG.md from the previous tag to HEAD and stages both. */
function fakePrepare(dir, { beforeCommit = () => undefined } = {}) {
  const calls = [];
  const prepare = async ({ specifier, dryRun }) => {
    calls.push({ specifier, dryRun });
    const version = specifier === 'patch' ? '1.0.1' : specifier;
    const previous = sh(dir, 'describe', '--tags', '--abbrev=0');
    const changelog = `## ${version}\n${sh(dir, 'log', '--format=- %s', `${previous}..HEAD`)}\n`;
    if (!dryRun) {
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
      writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
      sh(dir, 'add', 'package.json', 'CHANGELOG.md');
    }
    beforeCommit(calls.length);
    return { version, changelog };
  };
  return { prepare, calls };
}

function githubStub() {
  const releases = [];
  return { releases, create: async (release) => releases.push(release) && `https://example.test/${release.tag}` };
}

const remoteRef = (f, ref) => sh(f.root, '--git-dir', f.remote, 'rev-parse', '--verify', '--quiet', ref);
const remoteHasRef = (f, ref) => {
  try {
    remoteRef(f, ref);
    return true;
  } catch {
    return false;
  }
};

function release(f, prepare, github, extra = {}) {
  return runRelease({
    git: f.git,
    prepare,
    createGithubRelease: github.create,
    specifier: 'patch',
    messageTemplate: MESSAGE,
    log: () => undefined,
    ...extra,
  });
}

test('pushes the release commit and tag and creates the GitHub release on the first try', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare } = fakePrepare(f.ci);
  // The release commit and push skip the workspace's hooks, which would re-run every check in CI.
  for (const hook of ['pre-commit', 'commit-msg', 'pre-push']) {
    writeFileSync(path.join(f.ci, '.git', 'hooks', hook), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }

  const result = await release(f, prepare, github);

  assert.equal(result.attempts, 1);
  assert.equal(remoteRef(f, 'refs/heads/main'), result.sha);
  assert.equal(remoteRef(f, 'refs/tags/v1.0.1^{commit}'), result.sha);
  assert.equal(sh(f.ci, 'log', '-1', '--format=%s', result.sha), 'chore(release): 1.0.1 [skip ci]');
  assert.equal(sh(f.ci, 'cat-file', '-t', 'v1.0.1'), 'tag', 'annotated like nx release');
  assert.deepEqual(github.releases, [{ version: '1.0.1', tag: 'v1.0.1', body: result.changelog, sha: result.sha }]);
});

test('re-creates the release on the moved branch with the exact version and pushes again', async () => {
  const f = fixture();
  const github = githubStub();
  let subject;
  const { prepare, calls } = fakePrepare(f.ci, { beforeCommit: (n) => n === 1 && (subject = f.mergePr()) });
  const logs = [];

  const result = await release(f, prepare, github, { specifier: 'patch', log: (line) => logs.push(line) });

  const moved = sh(f.dev, 'rev-parse', 'HEAD');
  assert.equal(result.attempts, 2);
  assert.deepEqual(
    calls.map((c) => c.specifier),
    ['patch', '1.0.1'],
  );
  assert.equal(remoteRef(f, 'refs/heads/main'), result.sha);
  assert.equal(sh(f.ci, 'rev-parse', `${result.sha}^`), moved, 'release commit sits on the moved main');
  assert.equal(remoteRef(f, 'refs/tags/v1.0.1^{commit}'), result.sha);
  assert.match(sh(f.ci, 'show', `${result.sha}:CHANGELOG.md`), new RegExp(subject));
  assert.match(result.changelog, new RegExp(subject));
  assert.deepEqual(github.releases, [{ version: '1.0.1', tag: 'v1.0.1', body: result.changelog, sha: result.sha }]);
  assert.ok(
    logs.some((line) => line.includes(`main moved, re-creating release commit on ${moved.slice(0, 7)} (attempt 2/5)`)),
  );
  assert.ok(
    logs.some((line) => line.includes(subject)),
    'logs the commits picked up',
  );
});

test('gives up after the attempt limit while main keeps moving, without pushing anything', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare, calls } = fakePrepare(f.ci, { beforeCommit: () => f.mergePr() });

  await assert.rejects(
    release(f, prepare, github, { maxAttempts: 3 }),
    /main kept moving: 3 push attempts .* Nothing was pushed; re-run Create Release/,
  );

  assert.equal(calls.length, 3);
  assert.equal(remoteRef(f, 'refs/heads/main'), sh(f.dev, 'rev-parse', 'HEAD'));
  assert.equal(remoteHasRef(f, 'refs/tags/v1.0.1'), false);
  assert.deepEqual(github.releases, []);
});

test('stops when another release landed on main meanwhile', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare, calls } = fakePrepare(f.ci, {
    beforeCommit: () => {
      sh(f.dev, 'pull', '--quiet', 'origin', 'main');
      commitFile(f.dev, 'package.json', JSON.stringify({ version: '1.0.1' }), 'chore(release): 1.0.1 [skip ci]');
      sh(f.dev, 'push', '--quiet', 'origin', 'main');
    },
  });

  // On the last attempt too: re-running would not help, so the cause must not read "main kept moving".
  await assert.rejects(
    release(f, prepare, github, { maxAttempts: 1 }),
    /Another release landed .*version 1\.0\.1, this run started from 1\.0\.0.*Nothing was pushed/,
  );

  assert.equal(calls.length, 1);
  assert.equal(remoteRef(f, 'refs/heads/main'), sh(f.dev, 'rev-parse', 'HEAD'));
  assert.equal(remoteHasRef(f, 'refs/tags/v1.0.1'), false);
  assert.deepEqual(github.releases, []);
});

test('stops when the release tag already exists on the remote', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare } = fakePrepare(f.ci, {
    beforeCommit: () => {
      f.mergePr();
      sh(f.dev, 'tag', '--annotate', 'v1.0.1', '--message', 'v1.0.1');
      sh(f.dev, 'push', '--quiet', 'origin', 'v1.0.1');
    },
  });

  await assert.rejects(release(f, prepare, github), /Tag v1\.0\.1 already exists on origin.*Nothing was pushed/);

  assert.equal(remoteRef(f, 'refs/heads/main'), sh(f.dev, 'rev-parse', 'HEAD'));
  assert.equal(remoteRef(f, 'refs/tags/v1.0.1^{commit}'), sh(f.dev, 'rev-parse', 'HEAD'));
  assert.deepEqual(github.releases, []);
});

test('stops before committing when the version was released already', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare, calls } = fakePrepare(f.ci);
  const head = sh(f.ci, 'rev-parse', 'HEAD');

  await assert.rejects(
    release(f, prepare, github, { specifier: '1.0.0' }),
    /: Tag v1\.0\.0 already exists; not creating it again\. Nothing was pushed\.$/,
  );
  assert.equal(calls.length, 1);
  assert.equal(sh(f.ci, 'rev-parse', 'HEAD'), head);
  assert.equal(remoteRef(f, 'refs/heads/main'), head);
  assert.deepEqual(github.releases, []);
});

test('does not retry a push that fails for another reason than main moving', async () => {
  const f = fixture();
  const github = githubStub();
  // main moved too, so only the kind of failure keeps the run from retrying.
  const { prepare, calls } = fakePrepare(f.ci, { beforeCommit: (n) => n === 1 && f.mergePr() });
  sh(f.ci, 'remote', 'set-url', '--push', 'origin', path.join(f.root, 'missing.git'));
  const logs = [];

  await assert.rejects(release(f, prepare, github, { log: (line) => logs.push(line) }), (error) => {
    assert.ok(error instanceof ReleaseError);
    assert.match(
      error.message,
      /Pushing v1\.0\.1 failed; not retrying\. If v1\.0\.1 reached origin anyway.*missing\.git/s,
    );
    assert.match(error.message, /publish-only and specifier 1\.0\.1/);
    return true;
  });
  assert.equal(calls.length, 1);
  assert.equal(logs.filter((line) => line.startsWith('Pushing ')).length, 1);
  assert.deepEqual(github.releases, []);
});

test('does not retry a rule or hook rejection after main moved', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare, calls } = fakePrepare(f.ci, { beforeCommit: (n) => n === 1 && f.mergePr() });
  const hook = path.join(f.remote, 'hooks', 'pre-receive');
  // Installed after the PR merged, so it refuses only the release push.
  const decline = () =>
    writeFileSync(hook, '#!/bin/sh\necho "push declined due to repository rule violations" >&2\nexit 1\n', {
      mode: 0o755,
    });
  const logs = [];

  await assert.rejects(
    release(f, prepare, github, {
      log: (line) => {
        logs.push(line);
        if (line.includes('re-creating')) decline();
      },
    }),
    /Pushing v1\.0\.1 was rejected; not retrying\. Nothing was pushed\.\n.*repository rule violations/s,
  );
  assert.equal(calls.length, 2);
  assert.equal(remoteRef(f, 'refs/heads/main'), sh(f.dev, 'rev-parse', 'HEAD'));
  assert.equal(remoteHasRef(f, 'refs/tags/v1.0.1'), false);
  assert.deepEqual(github.releases, []);
});

test('does not retry a rejection when main did not move', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare, calls } = fakePrepare(f.ci);
  const hook = path.join(f.remote, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "push declined due to repository rule violations" >&2\nexit 1\n', {
    mode: 0o755,
  });

  await assert.rejects(
    release(f, prepare, github),
    /Pushing v1\.0\.1 was rejected; not retrying\. Nothing was pushed\.\n.*remote rejected/s,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(github.releases, []);
});

test('refuses to re-create the release over uncommitted changes', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare } = fakePrepare(f.ci, { beforeCommit: () => f.mergePr() });
  // Something edits the checkout after the release commit; a reset would throw that away.
  const log = (line) => line.startsWith('Pushing ') && writeFileSync(path.join(f.ci, 'a.txt'), 'edited by a build');

  await assert.rejects(
    release(f, prepare, github, { log }),
    /uncommitted changes; not re-creating v1\.0\.1\. Nothing was pushed/,
  );
  assert.equal(readFileSync(path.join(f.ci, 'a.txt'), 'utf8'), 'edited by a build');
  assert.equal(remoteRef(f, 'refs/heads/main'), sh(f.dev, 'rev-parse', 'HEAD'));
  assert.deepEqual(github.releases, []);
});

test('refuses to commit changes the prepare step did not stage', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare: inner } = fakePrepare(f.ci);
  const prepare = async (args) => {
    writeFileSync(path.join(f.ci, 'a.txt'), 'changed but not staged');
    return inner(args);
  };
  const head = sh(f.ci, 'rev-parse', 'HEAD');

  await assert.rejects(release(f, prepare, github), /Preparing v1\.0\.1 left unstaged changes.*Nothing was pushed/);
  assert.equal(sh(f.ci, 'rev-parse', 'HEAD'), head);
  assert.equal(remoteRef(f, 'refs/heads/main'), head);
  assert.deepEqual(github.releases, []);
});

test('stops when nx resolves a different version on the new base', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare: inner } = fakePrepare(f.ci, { beforeCommit: (n) => n === 1 && f.mergePr() });
  const prepare = async (args) => ({ ...(await inner(args)), ...(args.specifier !== 'patch' && { version: '1.0.2' }) });

  await assert.rejects(release(f, prepare, github), /resolved 1\.0\.2 instead of 1\.0\.1\. Nothing was pushed/);
  assert.equal(remoteRef(f, 'refs/heads/main'), sh(f.dev, 'rev-parse', 'HEAD'));
  assert.deepEqual(github.releases, []);
});

test('reports a pushed tag whose GitHub release could not be created', async () => {
  const f = fixture();
  const { prepare } = fakePrepare(f.ci);
  const failing = { create: async () => Promise.reject(new Error('GitHub answered 502')) };

  await assert.rejects(
    release(f, prepare, failing),
    /v1\.0\.1 is pushed \([0-9a-f]{40}\), but creating its GitHub release failed: GitHub answered 502\nCreate the GitHub release for v1\.0\.1 so release\.yml runs, then run Create Release with publish-only and specifier 1\.0\.1\./,
  );
  assert.equal(remoteHasRef(f, 'refs/tags/v1.0.1'), true);
});

test('a dry run prepares the release and describes the rest without writing anything', async () => {
  const f = fixture();
  const github = githubStub();
  const { prepare, calls } = fakePrepare(f.ci);
  const head = sh(f.ci, 'rev-parse', 'HEAD');
  const logs = [];

  const result = await release(f, prepare, github, { dryRun: true, log: (line) => logs.push(line) });

  assert.deepEqual(calls, [{ specifier: 'patch', dryRun: true }]);
  assert.equal(result.tag, 'v1.0.1');
  assert.equal(sh(f.ci, 'rev-parse', 'HEAD'), head);
  assert.equal(sh(f.ci, 'tag', '--list', 'v1.0.1'), '');
  assert.equal(remoteRef(f, 'refs/heads/main'), head);
  assert.deepEqual(github.releases, []);
  assert.match(logs.join('\n'), /would commit "chore\(release\): 1\.0\.1 \[skip ci\]" and tag v1\.0\.1/);
  assert.match(logs.join('\n'), /would push HEAD to origin main and v1\.0\.1 atomically \(up to 5 attempts/);
  assert.match(logs.join('\n'), /would create GitHub release v1\.0\.1 \(prerelease: false, make_latest: legacy\)/);
});

test('refuses to release from a detached HEAD', async () => {
  const f = fixture();
  sh(f.ci, 'checkout', '--quiet', '--detach');
  const { prepare, calls } = fakePrepare(f.ci);

  await assert.rejects(release(f, prepare, githubStub()), /HEAD is detached/);
  assert.equal(calls.length, 0);
});

test('creates the GitHub release with the fields nx release used', async () => {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init: { ...init, body: JSON.parse(init.body) } });
    return { ok: true, json: async () => ({ html_url: 'https://github.com/o/r/releases/tag/v2.0.0-beta.1' }) };
  };
  const create = githubReleaseClient({ token: 't', repository: 'o/r', fetch });

  const url = await create({ version: '2.0.0-beta.1', tag: 'v2.0.0-beta.1', body: 'notes', sha: 'abc' });

  assert.equal(url, 'https://github.com/o/r/releases/tag/v2.0.0-beta.1');
  assert.equal(requests[0].url, 'https://api.github.com/repos/o/r/releases');
  assert.equal(requests[0].init.headers.authorization, 'Bearer t');
  assert.deepEqual(requests[0].init.body, {
    tag_name: 'v2.0.0-beta.1',
    name: 'v2.0.0-beta.1',
    body: 'notes',
    prerelease: true,
    make_latest: 'legacy',
    target_commitish: 'abc',
  });
});

test('surfaces a GitHub API error', async () => {
  const fetch = async () => ({ ok: false, status: 422, text: async () => 'already_exists' });
  const create = githubReleaseClient({ token: 't', repository: 'o/r', apiUrl: 'https://ghe.test/api/v3', fetch });

  await assert.rejects(
    create({ version: '1.0.0', tag: 'v1.0.0', body: '', sha: 'abc' }),
    /GitHub answered 422: already_exists/,
  );
});

test('reads the workflow inputs from the environment', () => {
  const full = { SPECIFIER: 'minor', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' };
  assert.deepEqual(
    { ...optionsFromEnv(full), createGithubRelease: undefined },
    { specifier: 'minor', dryRun: false, maxAttempts: DEFAULT_PUSH_ATTEMPTS, createGithubRelease: undefined },
  );
  assert.equal(optionsFromEnv({ ...full, RELEASE_PUSH_ATTEMPTS: '2' }).maxAttempts, 2);
  assert.equal(optionsFromEnv({ SPECIFIER: 'patch', DRY_RUN: 'true' }).dryRun, true, 'a dry run needs no token');
  assert.throws(() => optionsFromEnv({}), /SPECIFIER is required/);
  assert.throws(
    () => optionsFromEnv({ SPECIFIER: 'patch', DRY_RUN: 'false' }),
    /GITHUB_TOKEN and GITHUB_REPOSITORY are required/,
  );
  for (const attempts of ['0', 'abc', '2.5']) {
    assert.throws(() => optionsFromEnv({ ...full, RELEASE_PUSH_ATTEMPTS: attempts }), /positive integer/);
  }
});

test('writes the version and pushed commit as step outputs', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'create-release-'));
  roots.push(root);
  const file = path.join(root, 'output');
  setOutputs({ version: '1.0.1', sha: 'abc' }, file);
  setOutputs({ version: '1.0.2', dryRun: true }, file);
  setOutputs({ version: '1.0.3', sha: 'def' }, undefined);
  assert.equal(readFileSync(file, 'utf8'), 'version=1.0.1\nsha=abc\nversion=1.0.2\nsha=\n');
});

test('formats the commit message and recognises prereleases', () => {
  assert.equal(releaseCommitMessage(MESSAGE, '1.2.3'), 'chore(release): 1.2.3 [skip ci]');
  assert.equal(isPrerelease('1.11.0-beta.0'), true);
  assert.equal(isPrerelease('1.11.0'), false);
  assert.equal(isPrerelease('1.11.0+build.1'), false);
});
