import { entities } from '@attraccess/database-entities';
import type { DataSource } from 'typeorm';
import { migrationCsvExportSeeds } from './seeds/csv-export.test-fixture';
import { migrationFlowUsageSeeds } from './seeds/flow-usage.test-fixture';
import { migrationIdentityNotificationSeeds } from './seeds/identity-notification.test-fixture';
import { migrationMcpOAuthSeeds } from './seeds/mcp-oauth.test-fixture';
import { migrationMaintenanceSeeds } from './seeds/maintenance.test-fixture';
import { migrationMembershipFormSeeds } from './seeds/membership-form.test-fixture';
import { migrationReaderSeeds } from './seeds/reader.test-fixture';
import { migrationSecureBootSeeds } from './seeds/secure-boot.test-fixture';
import { migrationResourceSeeds } from './seeds/resource.test-fixture';
import { ensureUsers } from './seed-storage.test-fixture';
import { migrationSsoSeeds } from './seeds/sso.test-fixture';

/** One row in (nearly) every entity of the current schema, through the entity repositories. */
export async function seedAllEntities(dataSource: DataSource): Promise<void> {
  const seedTag = Date.now().toString(36);
  const { primaryUser, secondaryUser } = await ensureUsers(dataSource, seedTag);
  const { resourceGroup, resource, accessOnlyDoor, project } = await migrationResourceSeeds(
    dataSource,
    seedTag,
    primaryUser,
  );
  await migrationSsoSeeds(dataSource, seedTag, primaryUser);
  await migrationReaderSeeds(dataSource, seedTag, resource, accessOnlyDoor);
  await migrationMaintenanceSeeds(dataSource, seedTag, primaryUser, resource);
  const { usage } = await migrationFlowUsageSeeds(dataSource, seedTag, primaryUser, secondaryUser, resource, project);
  await migrationMembershipFormSeeds(
    dataSource,
    seedTag,
    primaryUser,
    secondaryUser,
    resourceGroup,
    resource,
    project,
    usage,
  );
  await migrationIdentityNotificationSeeds(dataSource, seedTag, primaryUser);
  await migrationCsvExportSeeds(dataSource, seedTag);
  await migrationSecureBootSeeds(dataSource, seedTag);
  await migrationMcpOAuthSeeds(dataSource, seedTag, primaryUser);
}

/** Names of the entities whose table holds no row: the seed must reach every table the backup has to carry. */
export async function entitiesWithoutRows(dataSource: DataSource): Promise<string[]> {
  const empty: string[] = [];
  for (const entity of Object.values(entities)) {
    const repository = dataSource.getRepository(entity);
    if ((await repository.count()) === 0) empty.push(repository.metadata.name);
  }
  return empty;
}
