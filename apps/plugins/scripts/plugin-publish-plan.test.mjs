import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';

import { isNewerPublished, planPublish, readChannelState } from './plugin-publish-plan.mjs';

let repo;
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const commit = (file, message) => {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), message);
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message);
  return git('rev-parse', 'HEAD');
};

const gitApi = () => ({
  hasCommit: (c) => {
    try {
      git('cat-file', '-e', `${c}^{commit}`);
      return true;
    } catch {
      return false;
    }
  },
  isAncestor: (a, b) => {
    try {
      git('merge-base', '--is-ancestor', a, b);
      return true;
    } catch {
      return false;
    }
  },
});

// Stand-in for nx: the SDK lib affects every plugin, plugin dirs affect themselves.
const affectedSince = (head) => (base) => {
  const files = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
  const set = new Set();
  for (const f of files) {
    if (f.startsWith('libs/sdk/')) ['plugin-a', 'plugin-b'].forEach((p) => set.add(p));
    if (f.startsWith('apps/a/')) set.add('plugin-a');
    if (f.startsWith('apps/b/')) set.add('plugin-b');
  }
  return set;
};

const projects = [
  { project: 'plugin-a', name: '@x/plugin-a' },
  { project: 'plugin-b', name: '@x/plugin-b' },
];

const plan = (head, states) =>
  Object.fromEntries(
    planPublish({
      projects,
      head,
      readState: (name) => states[name] ?? null,
      git: gitApi(),
      affectedSince: affectedSince(head),
    }).map((p) => [p.project, p]),
  );

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'plan-'));
  git('init', '-q', '-b', 'main');
});
after(() => rmSync(repo, { recursive: true, force: true }));

test('catches up a plugin change from a failed run at a later unrelated commit, based on the last published commit', () => {
  const a = commit('README', 'A');
  commit('apps/a/src.ts', 'B plugin-a change, its run failed so nothing was published');
  const c = commit('apps/other/x.ts', 'C unrelated');
  const result = plan(c, {
    '@x/plugin-a': { version: '1.0.0-nightly.1.1', commit: a },
    '@x/plugin-b': { version: '1.0.0-nightly.1.1', commit: a },
  });
  assert.equal(result['plugin-a'].publish, true);
  assert.equal(result['plugin-a'].base, a);
  assert.equal(result['plugin-b'].publish, false);
  assert.match(result['plugin-b'].reason, /unchanged/);
});

test('plans every plugin when a shared SDK lib changed', () => {
  const base = git('rev-parse', 'HEAD');
  const head = commit('libs/sdk/index.ts', 'sdk change');
  const result = plan(head, {
    '@x/plugin-a': { version: '1', commit: base },
    '@x/plugin-b': { version: '1', commit: base },
  });
  assert.equal(result['plugin-a'].publish, true);
  assert.equal(result['plugin-b'].publish, true);
});

test('skips plugins with no change since the last published commit', () => {
  const g = git('rev-parse', 'HEAD');
  const head = commit('docs/readme.md', 'docs only');
  const result = plan(head, { '@x/plugin-a': { version: '1', commit: g } });
  assert.equal(result['plugin-a'].publish, false);
});

test('publishes when the package is missing or has no recorded commit', () => {
  const head = git('rev-parse', 'HEAD');
  const result = plan(head, { '@x/plugin-b': { version: '1.0.0', commit: null } });
  assert.equal(result['plugin-a'].publish, true);
  assert.match(result['plugin-a'].reason, /not on npm/);
  assert.equal(result['plugin-b'].publish, true);
  assert.match(result['plugin-b'].reason, /no recorded commit/);
});

test('skips when the published commit is newer than HEAD (an older run finishing late)', () => {
  const older = git('rev-parse', 'HEAD');
  const newer = commit('apps/a/more.ts', 'newer plugin-a change');
  const result = plan(older, { '@x/plugin-a': { version: '1', commit: newer } });
  assert.equal(result['plugin-a'].publish, false);
  assert.match(result['plugin-a'].reason, /newer commit already published/);
  assert.equal(isNewerPublished({ head: older, commit: newer, git: gitApi() }), true);
  assert.equal(isNewerPublished({ head: newer, commit: older, git: gitApi() }), false);
  assert.equal(isNewerPublished({ head: newer, commit: null, git: gitApi() }), false);
});

test('skips when the published commit is HEAD (rerun)', () => {
  const head = git('rev-parse', 'HEAD');
  const result = plan(head, { '@x/plugin-a': { version: '1', commit: head } });
  assert.equal(result['plugin-a'].publish, false);
  assert.match(result['plugin-a'].reason, /already published/);
});

test('publishes when the recorded commit is not in local history', () => {
  const head = git('rev-parse', 'HEAD');
  const result = plan(head, { '@x/plugin-a': { version: '1', commit: 'f'.repeat(40) } });
  assert.equal(result['plugin-a'].publish, true);
  assert.match(result['plugin-a'].reason, /not in local history/);
});

test('publishes when HEAD and the recorded commit diverged', () => {
  const fork = git('rev-parse', 'HEAD');
  git('checkout', '-q', '-b', 'side');
  const side = commit('apps/b/side.ts', 'side');
  git('checkout', '-q', 'main');
  const head = commit('apps/b/main.ts', 'main');
  const result = plan(head, { '@x/plugin-a': { version: '1', commit: side } });
  assert.equal(result['plugin-a'].publish, true);
  assert.match(result['plugin-a'].reason, /diverged/);
  assert.notEqual(fork, head);
});

test('release channel treats a nightly latest as never released', () => {
  const view = (spec, field) => {
    if (field === 'dist-tags.latest') return '0.1.0-nightly.925.2';
    throw new Error(`unexpected npm view ${spec} ${field}`);
  };
  assert.deepEqual(readChannelState('@x/plugin-a', 'latest', view), { version: '0.1.0-nightly.925.2', commit: null });
  const head = git('rev-parse', 'HEAD');
  const result = plan(head, { '@x/plugin-a': readChannelState('@x/plugin-a', 'latest', view) });
  assert.equal(result['plugin-a'].publish, true);
});

test('reads the recorded commit from gitHead, then attraccess.publishedCommit', () => {
  const tagged = (field) => (spec, key) => {
    if (key === 'dist-tags.next') return '1.0.0-nightly.5.1';
    return key === field ? 'abc' : null;
  };
  assert.equal(readChannelState('p', 'next', tagged('gitHead')).commit, 'abc');
  assert.equal(readChannelState('p', 'next', tagged('attraccess.publishedCommit')).commit, 'abc');
  assert.equal(
    readChannelState('p', 'next', () => null),
    null,
  );
});
