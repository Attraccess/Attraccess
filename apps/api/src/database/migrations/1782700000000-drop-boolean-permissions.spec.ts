import { DataSource, QueryRunner } from 'typeorm';
import { DropBooleanPermissions1782700000000 } from './1782700000000-drop-boolean-permissions';

describe('boolean permission migration', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const migration = new DropBooleanPermissions1782700000000();
  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    runner = source.createQueryRunner();
    await runner.query(
      `CREATE TABLE user (id INTEGER PRIMARY KEY, createdAt TEXT, deletedAt TEXT, canManageResources BOOLEAN, canManageSystemConfiguration BOOLEAN, canManageUsers BOOLEAN, canManageBilling BOOLEAN)`,
    );
    await runner.query(`CREATE TABLE role (id INTEGER PRIMARY KEY, key TEXT)`);
    await runner.query(
      `CREATE TABLE user_role (id INTEGER PRIMARY KEY, userId INTEGER, roleId INTEGER, source TEXT, UNIQUE(userId, roleId, source))`,
    );
    for (const provider of ['oidc', 'saml'])
      await runner.query(
        `CREATE TABLE sso_provider_${provider}_configuration (id INTEGER PRIMARY KEY, permissionMappings TEXT)`,
      );
    await runner.query(
      `INSERT INTO user VALUES (1, '2020-01-01', NULL, 0, 0, 0, 0), (2, '2021-01-01', NULL, 0, 1, 0, 0), (3, '2019-01-01', '2025-01-01', 0, 1, 0, 0)`,
    );
    await runner.query(
      `INSERT INTO role VALUES (1, 'owner'), (2, 'system-admin'), (3, 'resource-manager'), (4, 'user-manager'), (5, 'billing-manager')`,
    );
  });
  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('round-trips provider mappings and restores boolean grants from role assignments', async () => {
    const mappings = {
      canManageResources: ['workshop'],
      canManageUsers: ['staff'],
      canManageBilling: ['finance'],
      canManageSystemConfiguration: ['ops'],
      custom: ['unchanged'],
    };
    for (const provider of ['oidc', 'saml']) {
      await runner.query(`INSERT INTO sso_provider_${provider}_configuration VALUES (1, ?), (2, 'null')`, [
        JSON.stringify(mappings),
      ]);
    }
    await runner.query(
      `INSERT INTO user_role (userId, roleId, source) VALUES (2, 2, 'manual'), (3, 2, 'manual'), (1, 3, 'manual'), (1, 4, 'manual'), (1, 5, 'manual')`,
    );
    await migration.up(runner);
    expect(
      (await runner.query(`PRAGMA table_info(user)`)).map((column: { name: string }) => column.name),
    ).not.toContain('canManageResources');
    expect(await runner.query(`SELECT userId FROM user_role WHERE roleId = 1`)).toEqual([{ userId: 2 }]);
    for (const provider of ['oidc', 'saml']) {
      const [row] = await runner.query(
        `SELECT permissionMappings FROM sso_provider_${provider}_configuration WHERE id = 1`,
      );
      expect(JSON.parse(row.permissionMappings)).toEqual({
        'resource-manager': ['workshop'],
        'user-manager': ['staff'],
        'billing-manager': ['finance'],
        'system-admin': ['ops'],
        custom: ['unchanged'],
      });
    }
    await migration.down(runner);
    expect(
      await runner.query(
        `SELECT id, canManageResources, canManageUsers, canManageBilling, canManageSystemConfiguration FROM user WHERE id IN (1,2) ORDER BY id`,
      ),
    ).toEqual([
      { id: 1, canManageResources: 1, canManageUsers: 1, canManageBilling: 1, canManageSystemConfiguration: 0 },
      { id: 2, canManageResources: 0, canManageUsers: 0, canManageBilling: 0, canManageSystemConfiguration: 1 },
    ]);
    for (const provider of ['oidc', 'saml']) {
      const [row] = await runner.query(
        `SELECT permissionMappings FROM sso_provider_${provider}_configuration WHERE id = 1`,
      );
      expect(JSON.parse(row.permissionMappings)).toEqual(mappings);
    }
  });
  it('bootstraps the oldest active user when no active system administrator exists', async () => {
    await runner.query(`INSERT INTO user_role (userId, roleId, source) VALUES (3, 2, 'manual')`);
    await migration.up(runner);
    expect(await runner.query(`SELECT userId FROM user_role WHERE roleId = 1`)).toEqual([{ userId: 1 }]);
  });
  it('preserves an existing manual owner and tolerates absent role definitions on rollback', async () => {
    await runner.query(`INSERT INTO user_role (userId, roleId, source) VALUES (2, 1, 'manual')`);
    await migration.up(runner);
    expect(await runner.query(`SELECT userId FROM user_role WHERE roleId = 1`)).toEqual([{ userId: 2 }]);
    await runner.query(`DELETE FROM role WHERE key = 'billing-manager'`);
    await migration.down(runner);
    expect(await runner.query(`SELECT canManageBilling FROM user WHERE id = 1`)).toEqual([{ canManageBilling: 0 }]);
  });
});
