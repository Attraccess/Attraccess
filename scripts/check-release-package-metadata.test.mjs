import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkReleasePackageMetadata, REPOSITORY_URL } from './check-release-package-metadata.mjs';

const script = fileURLToPath(new URL('./check-release-package-metadata.mjs', import.meta.url));
const repository = (directory) => ({ type: 'git', url: REPOSITORY_URL, directory });

function workspace(t, { projects, files }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'release-package-metadata-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), JSON.stringify(value));
  };
  write('nx.json', { release: { projects } });
  for (const [file, value] of Object.entries(files)) write(file, value);
  return root;
}

test('accepts published projects that name this repository and their directory', (t) => {
  const root = workspace(t, {
    projects: ['models', '@scope/source', 'api'],
    files: {
      'package.json': { name: '@scope/source', private: true },
      'apps/api/project.json': { name: 'api' },
      'apps/api/package.json': { name: '@scope/api', private: true },
      'libs/models/project.json': { name: 'models' },
      'libs/models/package.json': { name: '@scope/models', repository: repository('libs/models') },
    },
  });
  assert.deepEqual(checkReleasePackageMetadata(root), []);
});

test('reports a published project without repository, the 422 npm provenance failure', (t) => {
  const root = workspace(t, {
    projects: ['models'],
    files: { 'libs/models/project.json': { name: 'models' }, 'libs/models/package.json': { name: '@scope/models' } },
  });
  const [problem, ...rest] = checkReleasePackageMetadata(root);
  assert.deepEqual(rest, []);
  assert.match(problem, /^libs\/models\/package\.json: add "repository"/);
  assert.match(problem, /"directory": "libs\/models"/);
});

test('reports an empty url and a wrong directory', (t) => {
  const root = workspace(t, {
    projects: ['models', 'env'],
    files: {
      'libs/models/package.json': { name: 'models', repository: { type: 'git', url: '' } },
      'libs/env/package.json': { name: 'env', repository: repository('libs/other') },
    },
  });
  const problems = checkReleasePackageMetadata(root);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^libs\/models\/package\.json: set .* found \{"type":"git","url":""\}/);
  assert.match(problems[1], /^libs\/env\/package\.json: set /);
});

test('reports a release project it cannot find', (t) => {
  const root = workspace(t, { projects: ['ghost'], files: {} });
  assert.deepEqual(checkReleasePackageMetadata(root), [
    'nx.json release project "ghost" has no project.json or package.json under apps/ or libs/.',
  ]);
});

test('the CLI fails with the problems and passes on this repository', (t) => {
  const root = workspace(t, {
    projects: ['models'],
    files: { 'libs/models/package.json': { name: 'models' } },
  });
  const failed = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /libs\/models\/package\.json: add "repository"/);
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const passed = spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8' });
  assert.equal(passed.stderr, '');
  assert.equal(passed.status, 0);
});
