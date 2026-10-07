import { entities } from '@attraccess/database-entities';
import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as coreMigrations from '../../../api/src/database/migrations';
import { registerPluginAuditDomains } from '../../../api/src/plugin-system/plugin-audit-registry';
import * as wagoMigrations from '../backend/migrations';
import plugin from '../backend/plugin';
import { pluginId } from './audit-hooks.integration-globals.test-utils';

import { AuditFixtureState } from './audit-hooks.integration-fixture.test-utils';
export async function AuditBeforeAll(state: AuditFixtureState): Promise<void> {
  // Mirrors PluginModule loading: the host bridge admits only what the plugin registered.
  registerPluginAuditDomains(
    { name: '@attraccess/plugin-wago', id: pluginId },
    plugin.auditDomains as PluginAuditDomainDeclaration[],
  );
  state.schemaDirectory = await mkdtemp(join(tmpdir(), 'wago-audit-schema-'));
  const schema = await new DataSource({
    type: 'sqlite',
    database: join(state.schemaDirectory, 'schema.sqlite'),
    entities: [...Object.values(entities), ...plugin.entities],
    migrations: [...Object.values(coreMigrations), ...Object.values(wagoMigrations)],
    synchronize: false,
  }).initialize();
  try {
    await schema.runMigrations();
  } finally {
    await schema.destroy();
  }
}
