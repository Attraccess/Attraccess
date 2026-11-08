import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isMissingTagError,
  promotionCommands,
  revisionFromImageConfig,
  shouldMoveNightlyLatest,
} from './promote-nightly-image.mjs';

const LABEL = 'org.opencontainers.image.revision';
// History: older -> head -> newer, and `stray` is not an ancestor of either.
const parents = { newer: 'head', head: 'older', older: null, stray: null };
const isAncestor = (a, b) => {
  for (let c = b; c; c = parents[c]) if (c === a) return true;
  return false;
};
const git = { hasCommit: (c) => c in parents, isAncestor };

test('keeps nightly-latest when it already carries a descendant of this run', () => {
  assert.equal(shouldMoveNightlyLatest({ head: 'head', currentRevision: 'newer', git }), false);
});

test('moves nightly-latest when it carries an ancestor, an unrelated commit or this commit', () => {
  for (const currentRevision of ['older', 'stray', 'head']) {
    assert.equal(shouldMoveNightlyLatest({ head: 'head', currentRevision, git }), true, currentRevision);
  }
});

test('moves nightly-latest for legacy images without the label or an unknown commit', () => {
  assert.equal(shouldMoveNightlyLatest({ head: 'head', currentRevision: null, git }), true);
  assert.equal(shouldMoveNightlyLatest({ head: 'head', currentRevision: 'f'.repeat(40), git }), true);
});

test('reads the revision label from single-image and multi-platform inspect output', () => {
  const sha = 'a'.repeat(40);
  const config = { config: { Labels: { [LABEL]: sha } } };
  assert.equal(revisionFromImageConfig(JSON.stringify(config)), sha);
  assert.equal(revisionFromImageConfig({ 'linux/amd64': config }), sha);
  assert.equal(revisionFromImageConfig({ config: { Labels: {} } }), null);
  assert.equal(revisionFromImageConfig({ config: {} }), null);
  assert.equal(revisionFromImageConfig({ config: { Labels: { [LABEL]: 'HEAD' } } }), null, 'only full SHAs count');
});

test('refuses to decide when history could not be fetched and the current revision is unknown', () => {
  const unknown = 'f'.repeat(40);
  assert.throws(
    () => shouldMoveNightlyLatest({ head: 'head', currentRevision: unknown, git, historyFetched: false }),
    /refusing to move the tag/,
  );
  assert.equal(shouldMoveNightlyLatest({ head: 'head', currentRevision: null, git, historyFetched: false }), true);
});

test("points nightly-latest on every registry at this run's digest", () => {
  const images = ['ghcr.io/a/b', 'a/b'];
  const head = '1234567'.padEnd(40, '0');
  assert.deepEqual(promotionCommands({ images, head, digest: 'sha256:d' }), [
    ['create', '--tag', 'ghcr.io/a/b:nightly-latest', 'ghcr.io/a/b@sha256:d'],
    ['create', '--tag', 'a/b:nightly-latest', 'a/b@sha256:d'],
  ]);
  assert.deepEqual(promotionCommands({ images: ['a/b'], head, digest: '' }), [
    ['create', '--tag', 'a/b:nightly-latest', 'a/b:nightly-1234567'],
  ]);
});

test('only a missing tag counts as "no nightly-latest yet"', () => {
  assert.equal(isMissingTagError({ stderr: 'ERROR: ghcr.io/a/b:nightly-latest: not found\n' }), true);
  assert.equal(isMissingTagError({ message: 'manifest unknown' }), true);
  assert.equal(isMissingTagError({ stderr: 'ERROR: denied: permission_denied' }), false);
  assert.equal(isMissingTagError({ stderr: 'dial tcp: i/o timeout' }), false);
  assert.equal(isMissingTagError(new Error('boom')), false);
});
