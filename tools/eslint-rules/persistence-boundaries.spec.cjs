const { RuleTester } = require('eslint');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rule = require('./persistence-boundaries.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'persistence-rule-'));
const file = (name) => path.join(root, name);
const write = (name, text) => {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), text);
};
write('tsconfig.base.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@test/*': ['app/*'] } } }));
write('app/schema.ts', 'export { User } from "@attraccess/database-entities";');
write('app/barrel.ts', 'export * from "./schema";');
write('app/types.ts', 'import type { Repository } from "typeorm"; export type Rows<T> = Repository<T>;');
write('app/renamed.ts', 'import type { Repository as Rows } from "typeorm"; export { Rows };');
write('app/neutral.ts', 'export interface User { id: number; }');
write(
  'app/database/backend.registry.ts',
  'export function selectDatabaseBackend() {} export function createPluginMigrationPersistence() {}',
);
write('app/cycle-a.ts', 'export * from "./cycle-b";');
write('app/cycle-b.ts', 'export * from "./cycle-a"; export * from "./schema";');
write('app/decorated.ts', '@Entity() export class Row {}');
const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser') } });
try {
  const app = file('app/service.ts');
  tester.run('persistence-boundaries', rule, {
    valid: [
      { filename: app, code: 'import type { User } from "./neutral";' },
      { filename: app, code: 'import { createPluginMigrationPersistence } from "./database/backend.registry";' },
      { filename: app, code: 'import type { PluginContext } from "@attraccess/plugins-backend-sdk/v2";' },
      { filename: file('app/persistence/port.ts'), code: 'export interface Port { load(): Promise<string>; }' },
      ...[
        'app/persistence/typeorm-adapter.ts',
        'app/persistence/sqlite-audit-storage.ts',
        'apps/api/src/audit/persistence/transaction-observer.ts',
        'apps/api/src/resources/usage/sessions/active-usage.ts',
        'apps/api/src/database/tooling.ts',
        'app/service.module.ts',
        'apps/plugins/wago/backend/plugin.ts',
        'apps/plugins/shelly/backend/plugin.ts',
        'examples/plugin-hello-world/backend/plugin.ts',
        'apps/plugins/wago/backend/controllers/entity.ts',
        'apps/plugins/wago/backend/management/entity.ts',
        'apps/plugins/wago/backend/network/entity.ts',
        'apps/plugins/wago/backend/credentials/migration.ts',
        'apps/plugins/wago/backend/management/migration.ts',
        'apps/plugins/wago/backend/commissioning/sessions/lease.migration.ts',
        'app/thing.entity.ts',
        'app/service.spec.ts',
        'app/service.integration.ts',
        'app/service.test-fixture.ts',
        'app/database/sqlite/backend.ts',
        'libs/plugins-backend-sdk/src/adapter.ts',
      ].map((name) => ({ filename: file(name), code: 'import { Repository } from "typeorm";' })),
    ],
    invalid: [
      'import type { Repository } from "typeorm";',
      'import { selectDatabaseBackend } from "./database/backend.registry";',
      'import * as backend from "./database/backend.registry";',
      'export * from "./database/backend.registry";',
      'const backend = require("./database/backend.registry");',
      'import Engine = require("typeorm");',
      'import { InjectRepository } from "@nestjs/typeorm";',
      'import { User } from "@attraccess/database-entities";',
      'import type { PluginContext } from "@attraccess/plugins-backend-sdk";',
      'export * from "./schema";',
      'export type { User } from "@test/barrel";',
      'import type { Rows } from "@test/types";',
      'import type { Rows } from "./renamed";',
      'import { User } from "./cycle-a";',
      'import { Row } from "./decorated";',
      'const engine = require("sqlite3");',
      'import { DatabaseSync } from "node:sqlite";',
      'const engine = import("pg");',
      'type Row = import("typeorm").Repository<string>;',
    ]
      .map((code) => ({ filename: app, code, errors: [{ messageId: 'engine' }] }))
      .concat([
        {
          filename: file('app/persistence/port.ts'),
          code: 'import type { EntityManager } from "typeorm";',
          errors: [{ messageId: 'engine' }],
        },
        ...[
          'apps/plugins/wago/backend/service.ts',
          'apps/plugins/wago/backend/controllers/service.ts',
          'apps/plugins/wago/backend/network/hidden.ts',
          'apps/plugins/wago/backend/plugin-helper.ts',
          'apps/plugins/unrelated/backend/entity.ts',
          'app/plugin.ts',
          'app/integration-helper.ts',
          'apps/api/src/audit/persistence/observer-helper.ts',
          'apps/api/src/audit/transaction-observer.ts',
          'apps/api/src/resources/usage/sessions/active-usage-helper.ts',
          'apps/api/src/database/tooling-helper.ts',
        ].map((name) => ({
          filename: file(name),
          code: 'import type { Repository } from "typeorm";',
          errors: [{ messageId: 'engine' }],
        })),
        {
          filename: file('app/persistence/hidden.ts'),
          code: 'export * from "typeorm";',
          errors: [{ messageId: 'engine' }],
        },
      ]),
  });
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
