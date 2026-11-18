import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { importsLegacySdkPersistence, usesLegacySdkPersistence } from './legacy-sdk-persistence.mjs';

const sdk = '@attraccess/plugins-backend-sdk';

async function backend(files) {
  const directory = await mkdtemp(join(tmpdir(), 'wago-legacy-persistence-'));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await writeFile(join(directory, file), content);
  }
  return directory;
}

async function legacy(files) {
  const directory = await backend(files);
  try {
    return await usesLegacySdkPersistence(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('recognises the legacy imports of the SDK', () => {
  assert.equal(importsLegacySdkPersistence(`import { Repository } from '${sdk}/sqlite';`), true);
  assert.equal(importsLegacySdkPersistence(`import { Column, Plugin } from '${sdk}';`), true);
  assert.equal(importsLegacySdkPersistence(`import {\n  Entity,\n} from '${sdk}';`), true);
  assert.equal(importsLegacySdkPersistence(`import { Plugin, PluginContext } from '${sdk}';`), false);
  assert.equal(importsLegacySdkPersistence(`import { Entity } from './entity';`), false);
});

test('a revision without the storage module is legacy', async () => {
  assert.equal(await legacy({ 'service.ts': 'export {};' }), true);
});

test('a revision on the record port is not legacy', async () => {
  const files = { 'storage/index.ts': 'export {};', 'service.ts': `import { Plugin } from '${sdk}';` };
  assert.equal(await legacy(files), false);
});

test('a revision with the storage module is still legacy when a file imports the old surface', async () => {
  const storage = { 'storage/index.ts': 'export {};' };
  assert.equal(await legacy({ ...storage, 'nested/old.ts': `import { Entity } from '${sdk}';` }), true);
  assert.equal(await legacy({ ...storage, 'old.ts': `import { x } from '${sdk}/sqlite';` }), true);
});
