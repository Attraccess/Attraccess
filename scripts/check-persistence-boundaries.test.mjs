import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkAgainstBaseline,
  compareWithBaseline,
  countViolations,
  describeResult,
  findViolations,
  isChecked,
  isPluginZone,
  pluginDebt,
  updatedBaseline,
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

test('the removed SDK engine subpath is flagged everywhere', () => {
  const content = "import { sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';";
  assert.equal(find(content, 'apps/api/src/plugin-system/runtime/module-loader.ts').length, 1);
  assert.equal(find(content, 'apps/api/src/plugin-system/plugin.module.spec.ts').length, 1);
  assert.equal(find(content, 'apps/plugins/wago/backend/flow/state.ts').length, 1);
  assert.equal(find("import x from '@attraccess/plugins-backend-sdk/sqlite/extra';").length, 1);
  assert.equal(find("import { PluginContext } from '@attraccess/plugins-backend-sdk';").length, 0);
});

test('plugin zone: apps/plugins, examples and the SDK sources', () => {
  for (const file of [
    'apps/plugins/wago/backend/x.ts',
    'apps/plugins/wago/backend/x.spec.ts',
    'apps/plugins/wago/acceptance/a.spec.ts',
    'apps/plugins/wago/backend/migrations/1-x.ts',
    'apps/plugins/wago/backend/x.persistence.spec.ts',
    'examples/poc-backend-plugin/src/index.ts',
    'libs/plugins-backend-sdk/src/lib/x.ts',
  ]) {
    assert.equal(isPluginZone(file), true, file);
    assert.equal(isChecked(file), true, file);
  }
  for (const file of [
    'apps/api/src/plugin-system/x.ts',
    'libs/plugins-frontend-sdk/src/x.ts',
    'libs/database-entities/x.ts',
  ]) {
    assert.equal(isPluginZone(file), false, file);
  }
});

test('plugin zone: every import form of every persistence package and SDK subpath is flagged', () => {
  const content = [
    "import { Entity } from 'typeorm';",
    "import type { Repository } from 'typeorm';",
    "export { Column } from 'typeorm';",
    "export * from '@attraccess/database-entities';",
    "import Database from 'better-sqlite3';",
    "import sqlite3 from 'sqlite3';",
    "import { Pool } from 'pg';",
    "import mysql from 'mysql2/promise';",
    "import knex = require('knex');",
    "const a = require('typeorm');",
    "const b = await import('pg');",
    "type T = typeof import('knex');",
    "jest.requireActual('mysql2');",
    "import { x } from '@attraccess/plugins-backend-sdk/sqlite';",
    "import { y } from '@attraccess/plugins-backend-sdk/internal';",
    "import { z } from '@attraccess/plugins-backend-sdk/testing';",
    "import { InjectRepository } from '@nestjs/typeorm';",
  ].join('\n');
  for (const file of [
    'apps/plugins/shelly/backend/service.ts',
    'apps/plugins/shelly/backend/service.spec.ts',
    'examples/poc-backend-plugin/src/index.ts',
    'libs/plugins-backend-sdk/src/lib/x.ts',
  ]) {
    assert.equal(find(content, file).length, 17, file);
  }
});

test('plugin zone: the SDK root and its package.json stay allowed, lookalikes are not flagged', () => {
  const file = 'apps/plugins/shelly/backend/service.ts';
  assert.equal(find("import { PluginContext } from '@attraccess/plugins-backend-sdk';", file).length, 0);
  assert.equal(find("import pkg from '@attraccess/plugins-backend-sdk/package.json';", file).length, 0);
  assert.equal(
    find("import x from 'pg-promise';\nimport y from 'knex-helpers';\nimport z from './pg';", file).length,
    0,
  );
  assert.equal(find("import { x } from '@attraccess/application-models';", file).length, 0);
});

test('plugin zone: a test or a migration may not reach adapter internals either', () => {
  const content = "import { X } from '../../../api/src/database/adapters/x.store';";
  assert.equal(find(content, 'apps/plugins/shelly/backend/a.spec.ts').length, 1);
  assert.equal(
    find("import { X } from '../../../../libs/database-entities/src/index';", 'apps/plugins/shelly/backend/a.spec.ts')
      .length,
    1,
  );
  assert.equal(
    find("import { X } from '../../../../libs/database-entities/src/index';", 'apps/plugins/shelly/backend/x.module.ts')
      .length,
    1,
  );
});

test('the SDK sources can never be baselined; plugin sources can, as transitional debt', () => {
  const sdk = 'libs/plugins-backend-sdk/src/lib/x.ts';
  assert.match(compareWithBaseline({ [sdk]: 1 }, { [sdk]: 5 })[0], /never depend on persistence/);
  const plugin = 'apps/plugins/shelly/backend/service.ts';
  assert.deepEqual(compareWithBaseline({ [plugin]: 2 }, { [plugin]: 2 }), []);
  assert.match(compareWithBaseline({ [plugin]: 3 }, { [plugin]: 2 })[0], /3 forbidden.*2 allowed/);
  assert.match(compareWithBaseline({ [plugin]: 1 }, { [plugin]: 2 })[0], /--update/);
});

test('the plugin debt lists the plugin-zone files that are on the baseline or still violate', () => {
  const plugin = 'apps/plugins/shelly/backend/service.ts';
  const example = 'examples/poc-backend-plugin/src/index.ts';
  const host = 'apps/api/src/plugin-system/runtime/module-loader.ts';
  assert.deepEqual(pluginDebt({ [plugin]: 1 }, { [example]: 1, [host]: 1 }), [plugin, example]);
  assert.deepEqual(pluginDebt({}, { [host]: 1 }), []);
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
  assert.equal(isChecked('apps/api/src/billing/billing.integration.spec.ts'), false);
  assert.equal(isChecked('apps/api/src/resources/usage/x.persistence.spec.ts'), false);
  assert.equal(isChecked('apps/api/src/e2e/a.e2e.spec.ts'), false);
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

test('the updated baseline is sorted and leaves out the files that can never be baselined', () => {
  const counts = { 'apps/api/src/b.ts': 2, 'apps/api/src/a.ts': 1, 'libs/plugins-backend-sdk/src/lib/x.ts': 3 };
  assert.deepEqual(Object.entries(updatedBaseline(counts)), [
    ['apps/api/src/a.ts', 1],
    ['apps/api/src/b.ts', 2],
  ]);
});

test('requiring clean plugins turns the remaining plugin debt into a problem', () => {
  const plugin = 'apps/plugins/wago/backend/old.ts';
  const counts = { [plugin]: 1 };
  const loose = checkAgainstBaseline(counts, counts, false);
  assert.deepEqual(loose, { problems: [], debt: [plugin] });
  const strict = checkAgainstBaseline(counts, counts, true);
  assert.deepEqual(strict.debt, [plugin]);
  assert.equal(strict.problems.length, 1);
  assert.match(strict.problems[0], /1 plugin-zone file\(s\) still use the old persistence surface: .*old\.ts/);
  assert.deepEqual(checkAgainstBaseline({}, {}, true), { problems: [], debt: [] });
});

test('describes a failed check with every problem, a passing one with the baseline size and plugin debt', () => {
  const failed = describeResult({ problems: ['a: bad', 'b: bad'], debt: [] }, {});
  assert.equal(failed.error, 'Persistence boundary check failed:\n  a: bad\n  b: bad');
  assert.deepEqual(failed.lines, []);
  const clean = describeResult({ problems: [], debt: [] }, { 'apps/api/src/a.ts': 1 });
  assert.deepEqual(clean, {
    error: '',
    lines: ['Persistence boundaries hold: 1 files remain on the shrinking baseline.'],
  });
  const withDebt = describeResult({ problems: [], debt: ['apps/plugins/x.ts'] }, { 'apps/plugins/x.ts': 1 });
  assert.equal(withDebt.lines.length, 2);
  assert.match(withDebt.lines[1], /1 of them are transitional plugin-zone files/);
});
