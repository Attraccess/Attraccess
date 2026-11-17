import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareWithBaseline,
  countViolations,
  findViolations,
  isChecked,
  workingTreeSources,
} from './check-persistence-boundaries.mjs';

const find = (content, file = 'apps/api/src/x/x.service.ts') => findViolations(file, content);

test('flags every import form of the persistence packages', () => {
  const content = [
    "import { Repository } from 'typeorm';",
    "import type { DataSource } from 'typeorm';",
    "export { Entity } from 'typeorm';",
    "export type { Repository } from 'typeorm';",
    "import { InjectRepository } from '@nestjs/typeorm';",
    "import { User } from '@attraccess/database-entities';",
    "import Database from 'better-sqlite3';",
    "import sqlite3 = require('sqlite3');",
    "const a = require('typeorm');",
    "const b = await import('typeorm');",
    "type T = typeof import('typeorm');",
    "type U = import('@attraccess/database-entities').User;",
    "jest.requireActual('typeorm');",
    "import { DataSource as D } from 'typeorm/data-source/DataSource';",
  ].join('\n');
  assert.equal(find(content).length, 14);
});

test('flags every subpath of the persistence packages', () => {
  const content = [
    "import { getDataSourceToken } from '@nestjs/typeorm/dist/common/typeorm.utils';",
    "import { Database } from 'sqlite3/lib/sqlite3';",
    "import Database from 'better-sqlite3/lib/database';",
    "import { User } from '@attraccess/database-entities/src/lib/entities/user.entity';",
  ].join('\n');
  assert.equal(find(content).length, 4);
  // Lookalike package names are not the persistence packages.
  assert.equal(find("import x from 'typeorm-naming-strategies';\nimport y from 'sqlite3-wrapper';").length, 0);
});

test('adapter internals may only be imported by Nest composition files and tests', () => {
  const adapter = "import { X } from '../database/adapters/projects/typeorm-project.store';";
  const engine = "import { Y } from '../database/sqlite/run-serialized-transaction';";
  for (const content of [adapter, engine]) {
    assert.equal(find(content, 'apps/api/src/projects/projects.service.ts').length, 1);
    assert.equal(find(content, 'apps/api/src/projects/project.dto.ts').length, 1);
    assert.equal(find(content, 'apps/api/src/projects/projects.module.ts').length, 0);
    assert.equal(find(content, 'apps/api/src/projects/projects.service.spec.ts').length, 0);
    assert.equal(find(content, 'apps/api/src/projects/fixtures/compose.test-fixture.ts').length, 0);
    assert.equal(find(content, 'apps/api/src/projects/testing/harness.ts').length, 0);
  }
  // The neutral seam of the database folder is not an adapter internal.
  assert.equal(find("import { UNIT_OF_WORK } from '../database/unit-of-work';").length, 0);
  assert.equal(find("import { parseDatabaseType } from '../database/backend';").length, 0);
});

test('a Nest module still may not import the ORM itself', () => {
  assert.equal(find("import { TypeOrmModule } from '@nestjs/typeorm';", 'apps/api/src/x/x.module.ts').length, 1);
});

test('only the plugin module loader and tests name the SDK engine subpath in the host', () => {
  const content = "import { sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';";
  assert.equal(find(content, 'apps/api/src/plugin-system/reader-ui/reader-ui-hooks.service.ts').length, 1);
  assert.equal(find("import x from '@attraccess/plugins-backend-sdk/sqlite/extra';").length, 1);
  assert.equal(find(content, 'apps/api/src/plugin-system/runtime/module-loader.ts').length, 0);
  assert.equal(find(content, 'apps/api/src/plugin-system/plugin.module.spec.ts').length, 0);
  // Plugins are written against the engine subpath; the SDK root stays allowed everywhere.
  assert.equal(find(content, 'apps/plugins/wago/backend/flow/state.ts').length, 0);
  assert.equal(find("import { PluginContext } from '@attraccess/plugins-backend-sdk';").length, 0);
});

test('flags relative imports of adapter internals but not neutral modules', () => {
  assert.equal(find("import { x } from '../../database/sqlite/sqlite-connection';", 'apps/api/src/a/b/c.ts').length, 1);
  assert.equal(
    find("import { x } from '../../../../libs/database-entities/src/index';", 'apps/api/src/a/b/c.ts').length,
    1,
  );
  assert.equal(find("import { x } from '../../database/persistence-errors';").length, 0);
  assert.equal(find("import { x } from '@attraccess/application-models';").length, 0);
});

test('ignores mentions in strings and comments', () => {
  assert.equal(find("// import x from 'typeorm'\nconst s = \"from 'typeorm'\";").length, 0);
});

test('persistence implementation code is allowed, application code is checked', () => {
  assert.equal(isChecked('apps/api/src/database/sqlite/sqlite-backend.ts'), false);
  assert.equal(isChecked('apps/api/src/database/migrations/1-x.ts'), false);
  assert.equal(isChecked('libs/database-entities/src/lib/entities/user.entity.ts'), false);
  assert.equal(isChecked('apps/plugins/wago/backend/migrations/1-x.ts'), false);
  assert.equal(isChecked('apps/api/src/billing/billing.integration.spec.ts'), false);
  assert.equal(isChecked('apps/api/src/resources/usage/x.persistence.spec.ts'), false);
  assert.equal(isChecked('apps/api/src/e2e/a.e2e.spec.ts'), false);
  assert.equal(isChecked('apps/plugins/wago/acceptance/a.spec.ts'), false);
  assert.equal(isChecked('apps/api/src/billing/billing.service.spec.ts'), true);
  assert.equal(isChecked('apps/api/src/billing/billing.service.ts'), true);
  assert.equal(isChecked('libs/plugins-backend-sdk/src/lib/plugin-context.ts'), true);
});

test('only the engine folders of the database code are allowed; its neutral seam is checked', () => {
  for (const folder of ['adapters/users', 'sqlite', 'conformance', 'migrations', 'migration-helpers']) {
    assert.equal(isChecked(`apps/api/src/database/${folder}/x.ts`), false, folder);
  }
  assert.equal(isChecked('apps/api/src/database/backend/resolve-database-backend.ts'), false);
  for (const file of [
    'unit-of-work.ts',
    'persistence-errors.ts',
    'transaction-context.ts',
    'transfer-snapshot.ts',
    'datasource.ts',
    'resource-transactions.module.ts',
    'backend/database-backend.ts',
    'backend/database-type.ts',
    'backend/index.ts',
  ]) {
    assert.equal(isChecked(`apps/api/src/database/${file}`), true, file);
  }
});

test('only the SDK engine subpath may name the engine; the SDK root stays checked', () => {
  assert.equal(isChecked('libs/plugins-backend-sdk/src/sqlite.ts'), false);
  assert.equal(isChecked('libs/plugins-backend-sdk/src/lib/sqlite/sqlite-persistence.ts'), false);
  assert.equal(isChecked('libs/plugins-backend-sdk/src/index.ts'), true);
  assert.equal(isChecked('libs/plugins-backend-sdk/src/lib/plugin-persistence.ts'), true);
  assert.equal(isChecked('libs/plugins-backend-sdk/src/lib/sdk-sqlite.ts'), true);
});

test('the baseline only shrinks', () => {
  const file = 'apps/api/src/billing/billing.service.ts';
  assert.deepEqual(compareWithBaseline({ [file]: 2 }, { [file]: 2 }), []);
  assert.match(compareWithBaseline({ [file]: 3 }, { [file]: 2 })[0], /3 forbidden.*2 allowed/);
  assert.match(compareWithBaseline({ [file]: 1 }, { [file]: 2 })[0], /--update/);
  assert.match(compareWithBaseline({ [file]: 1 }, {})[0], /1 forbidden.*0 allowed/);
  assert.match(compareWithBaseline({}, { [file]: 1 })[0], /only 0 remain/);
});

test('neutral libraries and the frontend can never be baselined', () => {
  const file = 'libs/application-models/src/lib/x.ts';
  assert.match(compareWithBaseline({ [file]: 1 }, { [file]: 5 })[0], /never depend on persistence/);
  assert.match(compareWithBaseline({ 'apps/frontend/src/a.ts': 1 }, {})[0], /never depend on persistence/);
});

test('counts violations per file', () => {
  const sources = new Map([
    ['apps/api/src/a.ts', "import 'typeorm';\nimport { X } from 'typeorm';"],
    ['apps/api/src/b.ts', "import { a } from './a';"],
  ]);
  assert.deepEqual(countViolations(sources), { 'apps/api/src/a.ts': 2 });
});

test('reads only checked files that still exist', () => {
  const contents = { 'apps/api/src/a.ts': 'a', 'apps/api/src/database/adapters/b.ts': 'b' };
  const sources = workingTreeSources(
    () => ['apps/api/src/a.ts', 'apps/api/src/database/adapters/b.ts', 'apps/api/src/gone.ts', 'README.md'],
    (file) => contents[file],
  );
  assert.deepEqual([...sources.keys()], ['apps/api/src/a.ts']);
});
