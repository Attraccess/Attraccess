import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  affectedSince,
  asCommit,
  assertChannel,
  channelVersion,
  formatPlan,
  isNewerPublished,
  parseArgs,
  planPublish,
  readChannelState,
  summarizePlan,
  versionExistsMessage,
  writeOutputs,
} from './plugin-publish-plan.mjs';

// Each test gets its own repository with one root commit, so tests don't depend on each other's order.
let repo;
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const commit = (file, message) => {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), message);
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message);
  return git('rev-parse', 'HEAD');
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'plan-'));
  git('init', '-q', '-b', 'main');
  commit('README', 'root');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

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
const affectedStub = (head) => (base) => {
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
      affectedSince: affectedStub(head),
    }).map((p) => [p.project, p]),
  );

test('catches up a plugin change from a failed run at a later unrelated commit, based on the last published commit', () => {
  const a = commit('docs/a.md', 'A');
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
  assert.match(result['plugin-a'].reason, /unchanged since/);
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
  assert.equal(result['plugin-a'].reason, 'already published for this commit');
});

test('publishes when the recorded commit is not in local history', () => {
  const head = git('rev-parse', 'HEAD');
  const result = plan(head, { '@x/plugin-a': { version: '1', commit: 'f'.repeat(40) } });
  assert.equal(result['plugin-a'].publish, true);
  assert.match(result['plugin-a'].reason, /not in local history/);
});

test('publishes when HEAD and the recorded commit diverged', () => {
  git('checkout', '-q', '-b', 'side');
  const side = commit('apps/b/side.ts', 'side');
  git('checkout', '-q', 'main');
  const head = commit('apps/b/main.ts', 'main');
  const result = plan(head, { '@x/plugin-a': { version: '1', commit: side } });
  assert.equal(result['plugin-a'].publish, true);
  assert.match(result['plugin-a'].reason, /diverged/);
});

test('release channel treats a nightly latest as never released', () => {
  const view = (spec, field) => {
    if (field === 'dist-tags.latest') return '0.1.0-nightly.925.2';
    throw new Error(`unexpected npm view ${spec} ${field}`);
  };
  assert.deepEqual(readChannelState('@x/plugin-a', 'latest', view), {
    version: '0.1.0-nightly.925.2',
    commit: null,
    neverReleased: true,
  });
  const head = git('rev-parse', 'HEAD');
  const result = plan(head, { '@x/plugin-a': readChannelState('@x/plugin-a', 'latest', view) });
  assert.equal(result['plugin-a'].publish, true);
  assert.match(result['plugin-a'].reason, /nightly build, so nothing was released yet/);
});

test('only the next and latest channels exist; alpha is retired', () => {
  assert.equal(assertChannel('next'), 'next');
  assert.equal(assertChannel('latest'), 'latest');
  for (const retired of ['alpha', 'foo', 'constructor', undefined]) {
    assert.throws(() => assertChannel(retired), /--channel must be one of next, latest/);
  }
  assert.throws(() => readChannelState('p', 'alpha', () => null), /--channel must be one of/);
});

test('reads the recorded commit from gitHead, then attraccess.publishedCommit, and only accepts full SHAs', () => {
  const sha = 'a'.repeat(40);
  const tagged =
    (field, value = sha) =>
    (spec, key) => {
      if (key === 'dist-tags.next') return '1.0.0-nightly.5.1';
      return key === field ? value : null;
    };
  assert.equal(readChannelState('p', 'next', tagged('gitHead')).commit, sha);
  assert.equal(readChannelState('p', 'next', tagged('attraccess.publishedCommit')).commit, sha);
  assert.equal(readChannelState('p', 'next', tagged('gitHead', 'HEAD')).commit, null);
  assert.equal(readChannelState('p', 'next', tagged('gitHead', '--upload-pack=x')).commit, null);
  assert.equal(
    readChannelState('p', 'next', () => null),
    null,
  );
  assert.equal(asCommit('A'.repeat(40)), null);
  assert.equal(asCommit(sha), sha);
});

test('channel versions: releases drop the prerelease suffix, nightlies append the run', () => {
  assert.equal(channelVersion('0.2.0-alpha.0', 'latest'), '0.2.0');
  assert.equal(channelVersion('0.1.0', 'latest'), '0.1.0');
  assert.equal(channelVersion('0.2.0-alpha.0', 'next', { runNumber: '1180', runAttempt: '2' }), '0.2.0-nightly.1180.2');
  assert.equal(channelVersion('0.1.0', 'next', { runNumber: '7' }), '0.1.0-nightly.7.1');
  assert.throws(() => channelVersion('0.1.0', 'next', {}), /GITHUB_RUN_NUMBER is required/);
  assert.throws(() => channelVersion('0.1.0', 'alpha'), /--channel must be one of/);
  assert.match(versionExistsMessage('@x/p', '0.2.0'), /@x\/p@0\.2\.0 already exists.*raise the major, minor or patch/);
});

test('the pre-publish check refuses when history could not be fetched and the recorded commit is unknown', () => {
  const head = git('rev-parse', 'HEAD');
  const unknown = 'f'.repeat(40);
  assert.equal(isNewerPublished({ head, commit: unknown, git: gitApi() }), false);
  assert.throws(
    () => isNewerPublished({ head, commit: unknown, git: gitApi(), historyFetched: false }),
    /refusing to move the tag/,
  );
  assert.equal(isNewerPublished({ head, commit: head, git: gitApi(), historyFetched: false }), false);
});

test('affectedSince sends changed files to nx on stdin, without workflow files or rename hiding', () => {
  const base = commit('apps/a/old.ts', 'base');
  commit('.github/workflows/nightly.yml', 'workflow');
  mkdirSync(join(repo, 'apps/b'), { recursive: true });
  renameSync(join(repo, 'apps/a/old.ts'), join(repo, 'apps/b/new.ts'));
  const head = commit('apps/b/other.ts', 'move file out of plugin a');
  const calls = [];
  const exec = (cmd, args, options = {}) => {
    if (cmd === 'git') return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    calls.push({ args, input: options.input });
    return JSON.stringify(['from-nx']);
  };
  assert.deepEqual([...affectedSince(base, head, exec)], ['from-nx']);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes('--stdin'));
  assert.ok(!calls[0].args.some((a) => a.startsWith('--files')));
  assert.deepEqual(calls[0].input.split('\n').sort(), ['apps/a/old.ts', 'apps/b/new.ts', 'apps/b/other.ts']);

  const workflowOnly = commit('.github/workflows/other.yml', 'workflow only');
  assert.equal(affectedSince(head, workflowOnly, exec).size, 0);
  assert.equal(calls.length, 1, 'nx is not called for an empty diff');
});

test('affectedSince handles more changed paths than fit in one Linux argument', () => {
  const files = Array.from({ length: 5000 }, (_, i) => `libs/some/deep/directory/structure/file-number-${i}.ts`);
  let input;
  const exec = (cmd, args, options = {}) => {
    if (cmd === 'git') return `${files.join('\n')}\n`;
    assert.ok(
      args.every((a) => a.length < 1024),
      'no oversized argument',
    );
    input = options.input;
    return '[]';
  };
  affectedSince('a'.repeat(40), 'b'.repeat(40), exec);
  assert.ok(input.length > 128 * 1024);
});

test('parseArgs rejects unknown flags and a --head outside a dry run', () => {
  assert.deepEqual(parseArgs([]), { channel: 'next', dryRun: false, out: null, head: null });
  assert.deepEqual(parseArgs(['--channel=latest', '--dry-run', '--out=plan.json', '--head=abc']), {
    channel: 'latest',
    dryRun: true,
    out: 'plan.json',
    head: 'abc',
  });
  assert.throws(() => parseArgs(['--dryrun']), /Unknown argument "--dryrun"/);
  assert.throws(() => parseArgs(['--channel', 'latest']), /Unknown argument "--channel"/);
  assert.throws(() => parseArgs(['--channel=alpha']), /--channel must be one of/);
  assert.throws(() => parseArgs(['--head=abc']), /only allowed with --dry-run/);
});

test('formatPlan shows the version each planned plugin publishes as', () => {
  const text = formatPlan(
    [
      { name: '@x/a', publish: true, version: '0.2.0', reason: 'r', publishedVersion: null, publishedCommit: null },
      { name: '@x/b', publish: false, reason: 's', publishedVersion: '1.0.0', publishedCommit: 'a'.repeat(40) },
      {
        name: '@x/c',
        publish: true,
        version: '0.1.0',
        reason: 't',
        publishedVersion: '0.1.0-n',
        publishedCommit: null,
      },
    ],
    'latest',
  );
  assert.match(text, /PUBLISH {2}@x\/a as 0\.2\.0 {2}\(r; latest=unpublished\)/);
  assert.match(text, /skip {5}@x\/b {2}\(s; latest=1\.0\.0 @ aaaaaaa\)/);
  assert.match(text, /@x\/c as 0\.1\.0 {2}\(t; latest=0\.1\.0-n\)/);
});

const samplePlan = [
  { project: 'plugin-a', name: '@x/a', publish: true, version: '1.0.0', reason: 'never published' },
  { project: 'plugin-b', name: '@x/b', publish: false, reason: 'unchanged since abc' },
];

test('summarizePlan describes a dry run without publishing', () => {
  const text = summarizePlan({ plan: samplePlan, channel: 'next', taken: [], dryRun: true });
  assert.match(text, /PUBLISH {2}@x\/a as 1\.0\.0/);
  assert.match(text, /Dry run: 1 to publish, 1 skipped; nothing published\./);
});

test('summarizePlan lists the projects to publish and every taken version', () => {
  const text = summarizePlan({ plan: samplePlan, channel: 'latest', taken: [samplePlan[0]], dryRun: false });
  assert.match(text, /Publishing: plugin-a\./);
  assert.match(text, /ERROR: .*@x\/a/);
});

test('summarizePlan says nothing is published when the plan is empty', () => {
  const text = summarizePlan({ plan: [samplePlan[1]], channel: 'next', taken: [], dryRun: false });
  assert.match(text, /Publishing: nothing\./);
});

test('writeOutputs writes the JSON plan and the step summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-out-'));
  const previous = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = join(dir, 'summary.md');
  const log = console.log;
  console.log = () => {};
  try {
    writeOutputs({ summary: 'S', out: join(dir, 'plan.json'), channel: 'next', head: 'h', plan: samplePlan });
  } finally {
    console.log = log;
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous;
  }
  const written = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  assert.deepEqual(written, { channel: 'next', head: 'h', plan: samplePlan });
  assert.match(readFileSync(join(dir, 'summary.md'), 'utf8'), /### Plugin publish plan \(`next`\)/);
  rmSync(dir, { recursive: true, force: true });
});
