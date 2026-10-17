import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { selectTests } from './ci-test-projects.mjs';

const node = (tags, targets) => ({
  data: { tags, targets: Object.fromEntries(targets.map((target) => [target, {}])) },
});
const graph = {
  api: node(['scope:core'], ['test', 'test-persistence', 'e2e', 'build']),
  plugin: node(['type:plugin'], ['test', 'test-managed-runtime', 'pack-test', 'build']),
  firmware: node(['scope:hardware'], ['test', 'e2e']),
  desktop: node(['scope:companion'], ['test']),
  documentation: node([], ['lint']),
};

test('core selection retains the database conformance target with ordinary tests and e2e', () => {
  assert.deepEqual(selectTests(graph, 'core'), {
    projects: ['api'],
    targets: ['e2e', 'test', 'test-persistence'],
  });
});

test('plugin selection retains specialized tests and package checks without selecting hardware', () => {
  assert.deepEqual(selectTests(graph, 'plugins'), {
    projects: ['plugin'],
    targets: ['pack-test', 'test', 'test-managed-runtime'],
  });
});

test('software selection combines the two software groups and rejects an unknown group', () => {
  assert.deepEqual(selectTests(graph, 'software'), {
    projects: ['api', 'plugin'],
    targets: ['e2e', 'pack-test', 'test', 'test-managed-runtime', 'test-persistence'],
  });
  assert.throws(() => selectTests(graph, 'database'), /Unknown test group/);
});

test('pull-request and merge-queue gating retain core tests and the import-boundary regression check', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pull-requests.yml', import.meta.url), 'utf8');
  assert.match(workflow, /merge_group:/);
  const gate = workflow.slice(workflow.indexOf('  precommit-check:'), workflow.indexOf('  commitlint:'));
  assert.match(gate, /needs:[\s\S]*\btest,/);
  assert.match(gate, /if: always\(\)/);
  const tests = workflow.slice(workflow.indexOf('  test:'), workflow.indexOf('  crap-score:'));
  assert.match(tests, /node scripts\/ci-test-projects\.mjs --group=core/);
  const lint = workflow.slice(workflow.indexOf('  lint-and-typecheck:'), workflow.indexOf('  test:'));
  assert.match(lint, /pnpm test:persistence-boundaries/);
});
