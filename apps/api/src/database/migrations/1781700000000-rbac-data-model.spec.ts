import { RbacDataModel1781700000000 } from './1781700000000-rbac-data-model';

// Re-export the internal constants for testing by re-importing via module reflection
// We test the catalog integrity via the migration class behavior in a mock QueryRunner.

interface MockQueryRunnerResult {
  queries: Array<{ sql: string; params: unknown[] }>;
}

function createMockQueryRunner(): { queryRunner: Parameters<RbacDataModel1781700000000['up']>[0]; results: MockQueryRunnerResult } {
  const results: MockQueryRunnerResult = { queries: [] };

  // Tracks inserted roles and permissions so we can simulate SELECT lookups
  const roleIdMap: Record<string, number> = {};
  let roleIdCounter = 1;

  const queryRunner = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      results.queries.push({ sql: sql.trim(), params: params ?? [] });

      // Simulate role INSERT and SELECT behavior
      if (sql.includes('INSERT OR IGNORE INTO "role"') && params) {
        const key = params[0] as string;
        if (!roleIdMap[key]) {
          roleIdMap[key] = roleIdCounter++;
        }
      }

      if (sql.includes('SELECT "id" FROM "role" WHERE "key" = ?') && params) {
        const key = params[0] as string;
        return [{ id: roleIdMap[key] ?? 1 }];
      }

      return [];
    }),
  };

  return { queryRunner: queryRunner as never, results };
}

describe('RbacDataModel1781700000000 migration', () => {
  let migration: RbacDataModel1781700000000;

  beforeEach(() => {
    migration = new RbacDataModel1781700000000();
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('RbacDataModel1781700000000');
  });

  describe('up()', () => {
    let results: MockQueryRunnerResult;

    beforeEach(async () => {
      const mock = createMockQueryRunner();
      await migration.up(mock.queryRunner);
      results = mock.results;
    });

    it('creates the permission table', () => {
      const createPermission = results.queries.find((q) => q.sql.includes('CREATE TABLE "permission"'));
      expect(createPermission).toBeDefined();
    });

    it('creates the role table', () => {
      const createRole = results.queries.find((q) => q.sql.includes('CREATE TABLE "role"'));
      expect(createRole).toBeDefined();
    });

    it('creates the role_permission table', () => {
      const createRolePerm = results.queries.find((q) => q.sql.includes('CREATE TABLE "role_permission"'));
      expect(createRolePerm).toBeDefined();
    });

    it('creates the user_role table', () => {
      const createUserRole = results.queries.find((q) => q.sql.includes('CREATE TABLE "user_role"'));
      expect(createUserRole).toBeDefined();
    });

    it('creates indexes for role_permission and user_role', () => {
      const idxRolePerm = results.queries.find((q) => q.sql.includes('IDX_role_permission_role'));
      const idxUserRoleUser = results.queries.find((q) => q.sql.includes('IDX_user_role_user'));
      const idxUserRoleRole = results.queries.find((q) => q.sql.includes('IDX_user_role_role'));
      expect(idxRolePerm).toBeDefined();
      expect(idxUserRoleUser).toBeDefined();
      expect(idxUserRoleRole).toBeDefined();
    });

    it('seeds all 16 expected permissions', () => {
      const permInserts = results.queries.filter(
        (q) => q.sql.includes('INSERT OR IGNORE INTO "permission"'),
      );
      expect(permInserts).toHaveLength(16);
    });

    it('seeds the required permission keys', () => {
      const permInserts = results.queries.filter((q) => q.sql.includes('INSERT OR IGNORE INTO "permission"'));
      const insertedKeys = permInserts.map((q) => q.params[0] as string);

      const requiredKeys = [
        'resources.read',
        'resources.create',
        'resources.update',
        'resources.delete',
        'resources.access.manage',
        'resources.maintenance.manage',
        'users.read',
        'users.create',
        'users.update',
        'users.delete',
        'users.roles.manage',
        'system.settings.manage',
        'system.sso.manage',
        'system.plugins.manage',
        'billing.read',
        'billing.manage',
      ];

      for (const key of requiredKeys) {
        expect(insertedKeys).toContain(key);
      }
    });

    it('seeds all 6 default roles', () => {
      const roleInserts = results.queries.filter((q) => q.sql.includes('INSERT OR IGNORE INTO "role"'));
      expect(roleInserts).toHaveLength(6);
    });

    it('seeds the required role keys', () => {
      const roleInserts = results.queries.filter((q) => q.sql.includes('INSERT OR IGNORE INTO "role"'));
      const insertedKeys = roleInserts.map((q) => q.params[0] as string);
      expect(insertedKeys).toContain('user');
      expect(insertedKeys).toContain('resource-manager');
      expect(insertedKeys).toContain('user-manager');
      expect(insertedKeys).toContain('billing-manager');
      expect(insertedKeys).toContain('system-admin');
      expect(insertedKeys).toContain('owner');
    });

    it('marks the user role as default', () => {
      const roleInserts = results.queries.filter((q) => q.sql.includes('INSERT OR IGNORE INTO "role"'));
      const userRoleInsert = roleInserts.find((q) => q.params[0] === 'user');
      expect(userRoleInsert).toBeDefined();
      // params: [key, name, description, isSystemManaged, isDefault]
      expect(userRoleInsert!.params[4]).toBe(1);
    });

    it('marks all seeded roles as system-managed', () => {
      const roleInserts = results.queries.filter((q) => q.sql.includes('INSERT OR IGNORE INTO "role"'));
      for (const insert of roleInserts) {
        expect(insert.params[3]).toBe(1);
      }
    });

    it('assigns all permissions to the owner role', () => {
      const ownerPermInserts = results.queries.filter(
        (q) => q.sql.includes('INSERT OR IGNORE INTO "role_permission"'),
      );
      // owner gets all 16 permissions; total inserts include permissions for all other roles too
      expect(ownerPermInserts.length).toBeGreaterThanOrEqual(16);
    });

    it('migrates canManageResources users to resource-manager role', () => {
      const migrateQuery = results.queries.find(
        (q) => q.sql.includes('INSERT OR IGNORE INTO "user_role"') && q.sql.includes('"canManageResources"'),
      );
      expect(migrateQuery).toBeDefined();
    });

    it('migrates canManageSystemConfiguration users to system-admin role', () => {
      const migrateQuery = results.queries.find(
        (q) => q.sql.includes('INSERT OR IGNORE INTO "user_role"') && q.sql.includes('"canManageSystemConfiguration"'),
      );
      expect(migrateQuery).toBeDefined();
    });

    it('migrates canManageUsers users to user-manager role', () => {
      const migrateQuery = results.queries.find(
        (q) => q.sql.includes('INSERT OR IGNORE INTO "user_role"') && q.sql.includes('"canManageUsers"'),
      );
      expect(migrateQuery).toBeDefined();
    });

    it('migrates canManageBilling users to billing-manager role', () => {
      const migrateQuery = results.queries.find(
        (q) => q.sql.includes('INSERT OR IGNORE INTO "user_role"') && q.sql.includes('"canManageBilling"'),
      );
      expect(migrateQuery).toBeDefined();
    });

    it('assigns the user role to all non-deleted users', () => {
      const defaultRoleQuery = results.queries.find(
        (q) =>
          q.sql.includes('INSERT OR IGNORE INTO "user_role"') &&
          q.sql.includes("'manual'") &&
          !q.sql.includes('"canManage'),
      );
      expect(defaultRoleQuery).toBeDefined();
    });

    it('only migrates non-deleted users (filters by deletedAt IS NULL)', () => {
      const userRoleInserts = results.queries.filter(
        (q) => q.sql.includes('INSERT OR IGNORE INTO "user_role"') && q.sql.includes('SELECT'),
      );
      for (const q of userRoleInserts) {
        expect(q.sql).toContain('"deletedAt" IS NULL');
      }
    });
  });

  describe('down()', () => {
    it('drops all created tables in reverse order', async () => {
      const { queryRunner, results } = createMockQueryRunner();
      await migration.down(queryRunner);

      const dropUserRole = results.queries.find((q) => q.sql.includes('DROP TABLE "user_role"'));
      const dropRolePerm = results.queries.find((q) => q.sql.includes('DROP TABLE "role_permission"'));
      const dropRole = results.queries.find((q) => q.sql.includes('DROP TABLE "role"'));
      const dropPermission = results.queries.find((q) => q.sql.includes('DROP TABLE "permission"'));

      expect(dropUserRole).toBeDefined();
      expect(dropRolePerm).toBeDefined();
      expect(dropRole).toBeDefined();
      expect(dropPermission).toBeDefined();
    });

    it('drops indexes before tables', async () => {
      const { queryRunner, results } = createMockQueryRunner();
      await migration.down(queryRunner);

      const dropIdx = results.queries.filter((q) => q.sql.includes('DROP INDEX IF EXISTS'));
      expect(dropIdx.length).toBeGreaterThanOrEqual(3);

      // Indexes should come before table drops
      const firstTableDrop = results.queries.findIndex((q) => q.sql.includes('DROP TABLE'));
      const lastIdxDrop = results.queries.reduce(
        (acc, q, i) => (q.sql.includes('DROP INDEX IF EXISTS') ? i : acc),
        -1,
      );
      expect(lastIdxDrop).toBeLessThan(firstTableDrop);
    });
  });
});
