import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { processDependency, processDependenciesInBatches, extractDependencies } from './extract-dependencies.cjs';

beforeEach(() => {
  mock.method(console, 'log', () => undefined);
  mock.method(console, 'error', () => undefined);
});
afterEach(() => mock.restoreAll());

test('prefers latest metadata, preserves requested versions, and normalizes Git URLs', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        author: 'Old Author',
        license: 'OLD',
        'dist-tags': { latest: '2.0.0' },
        versions: {
          '2.0.0': {
            author: { name: 'Current Author' },
            license: 'MIT',
            repository: { url: 'git+https://github.com/example/library.git' },
          },
        },
      }),
    };
  });
  assert.deepEqual(await processDependency('@scope/library', '^1.0.0'), {
    name: '@scope/library',
    version: '^1.0.0',
    author: 'Current Author',
    license: 'MIT',
    url: 'https://github.com/example/library',
  });
  assert.equal(requests[0].url, 'https://registry.npmjs.org/%40scope%2Flibrary');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test('falls back to root metadata and npm URLs for incomplete registry entries', async () => {
  const cases = [
    [
      { author: 'Named author', homepage: 'https://example.test', license: 'ISC' },
      { author: 'Named author', url: 'https://example.test', license: 'ISC' },
    ],
    [
      { author: { name: 'Root Author' }, repository: 'git+https://example.test/repo.git' },
      { author: 'Root Author', url: 'https://example.test/repo' },
    ],
    [{ author: {} }, { author: 'Unknown', url: 'https://www.npmjs.com/package/demo' }],
    [{}, { author: 'Unknown', url: 'https://www.npmjs.com/package/demo' }],
    [
      { author: { name: 'Root' }, 'dist-tags': { latest: '1' }, versions: { 1: {} } },
      { author: 'Root', url: 'https://www.npmjs.com/package/demo' },
    ],
  ];
  for (const [metadata, expected] of cases) {
    mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => metadata }));
    assert.deepEqual(await processDependency('demo', '1'), {
      name: 'demo',
      version: '1',
      license: 'Unknown',
      ...expected,
    });
  }
});

test('retains dependency entries on registry HTTP and transport failures', async () => {
  for (const fetch of [
    async () => ({ ok: false, status: 503, statusText: 'Unavailable' }),
    async () => {
      throw new Error('offline');
    },
  ]) {
    mock.method(globalThis, 'fetch', fetch);
    assert.deepEqual(await processDependency('offline', '~2'), {
      name: 'offline',
      version: '~2',
      author: 'Unknown',
      license: 'Unknown',
      url: 'https://www.npmjs.com/package/offline',
    });
  }
});

test('batches all entries with bounded registry concurrency and stable order', async () => {
  let active = 0,
    maximum = 0;
  mock.method(globalThis, 'fetch', async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return { ok: true, json: async () => ({}) };
  });
  const dependencies = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`dep-${i}`, `${i}`]));
  const result = await processDependenciesInBatches(dependencies, 2);
  assert.equal(maximum, 2);
  assert.deepEqual(
    result.map(({ name }) => name),
    Object.keys(dependencies),
  );
});

test('writes a sorted dependency inventory combining production and development packages', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-dependencies-'));
  const previous = process.cwd();
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ license: 'MIT' }) }));
  try {
    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ dependencies: { zebra: '^1', shared: '^1' }, devDependencies: { alpha: '^2', shared: '^2' } }),
    );
    process.chdir(directory);
    await extractDependencies();
    const output = JSON.parse(readFileSync(path.join(directory, 'apps/frontend/public/dependencies.json'), 'utf8'));
    assert.deepEqual(
      output.map(({ name, version }) => ({ name, version })),
      [
        { name: 'alpha', version: '^2' },
        { name: 'shared', version: '^2' },
        { name: 'zebra', version: '^1' },
      ],
    );
  } finally {
    process.chdir(previous);
    rmSync(directory, { recursive: true, force: true });
  }
});
