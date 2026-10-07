import { entities } from '@attraccess/database-entities';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DataSource } from 'typeorm';
import { migrationFlowUsageSeeds } from './migration-flow-usage-seeds.test-fixture';
import { migrationIdentityNotificationSeeds } from './migration-identity-notification-seeds.test-fixture';
import { migrationMaintenanceSeeds } from './migration-maintenance-seeds.test-fixture';
import { migrationMembershipFormSeeds } from './migration-membership-form-seeds.test-fixture';
import { migrationReaderSeeds } from './migration-reader-seeds.test-fixture';
import { migrationResourceSeeds } from './migration-resource-seeds.test-fixture';
import { ensureUsers } from './migration-seed-storage.test-fixture';
import { migrationSsoSeeds } from './migration-sso-seeds.test-fixture';

jest.setTimeout(120_000);
const getTestStorageRoot = async () => {
  if (process.env.STORAGE_ROOT) {
    await fs.mkdir(process.env.STORAGE_ROOT, { recursive: true });
    return process.env.STORAGE_ROOT;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'attraccess-migrations-e2e-'));
  return dir;
};
const seedDatabase = async (dataSource: DataSource) => {
  const seedTag = Date.now().toString(36);
  const { primaryUser, secondaryUser } = await ensureUsers(dataSource, seedTag);
  const { resourceGroup, resource, project } = await migrationResourceSeeds(dataSource, seedTag, primaryUser);
  await migrationSsoSeeds(dataSource, seedTag, primaryUser);
  await migrationReaderSeeds(dataSource, seedTag, resource);
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
};

const assertAllEntitiesHaveRows = async (dataSource: DataSource) => {
  const emptyEntities: string[] = [];

  for (const entity of Object.values(entities)) {
    const repository = dataSource.getRepository(entity);
    const count = await repository.count();
    if (count === 0) {
      emptyEntities.push(repository.metadata.name);
    }
  }

  if (emptyEntities.length > 0) {
    throw new Error(`Missing seed data for entities: ${emptyEntities.join(', ')}`);
  }
};

const getMigrationCount = async (dataSource: DataSource) => {
  const rows = await dataSource.query('SELECT COUNT(*) as count FROM migrations');
  return Number(rows[0]?.count ?? 0);
};

const assertForeignKeysClean = async (dataSource: DataSource, context: string) => {
  const violations = await dataSource.query('PRAGMA foreign_key_check');
  if (violations.length > 0) {
    throw new Error(`Foreign key violations after ${context}: ${JSON.stringify(violations)}`);
  }
};

const getLastMigrationName = async (dataSource: DataSource) => {
  const rows = await dataSource.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1');
  return rows[0]?.name as string | undefined;
};
export function registerMigrationsDownUpWithDataE2eFixture() {
  let dataSource: DataSource;

  let createdTempRoot: string | undefined;

  beforeAll(async () => {
    // EncryptSensitiveData migration down() needs AUTH_SESSION_SECRET to decrypt; use a stable test value.
    process.env.AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || 'e2e-migrations-test-secret';

    const tmpRoot = await getTestStorageRoot();
    if (!process.env.STORAGE_ROOT) {
      createdTempRoot = tmpRoot;
    }
    process.env.STORAGE_ROOT = tmpRoot;

    const dsModule = await import('../database/datasource');
    dataSource = (dsModule as unknown as { default: DataSource }).default;

    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    await dataSource.query('PRAGMA foreign_keys = ON');
    await dataSource.runMigrations();
    await seedDatabase(dataSource);
    await assertAllEntitiesHaveRows(dataSource);
    await assertForeignKeysClean(dataSource, 'initial seed');
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }

    if (createdTempRoot) {
      await fs.rm(createdTempRoot, { recursive: true, force: true });
    }
  });
  return {
    get seedDatabase() {
      return seedDatabase;
    },
    get assertAllEntitiesHaveRows() {
      return assertAllEntitiesHaveRows;
    },
    get getMigrationCount() {
      return getMigrationCount;
    },
    get assertForeignKeysClean() {
      return assertForeignKeysClean;
    },
    get getLastMigrationName() {
      return getLastMigrationName;
    },
    get dataSource() {
      return dataSource;
    },
  };
}
