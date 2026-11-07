import { createHostDb } from '../testing/host-db.test-utils';
import { HostInfoService, normalizeLanguage } from './host-info.service';

describe('HostInfoService (real host entities)', () => {
  let db: Awaited<ReturnType<typeof createHostDb>>;
  let info: HostInfoService;

  const user = (id: number, locale = 'en') =>
    db.sql(
      `INSERT INTO "user" (id, username, email, locale, isEmailVerified, isDisabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`,
      [id, `user${id}`, `u${id}@test`, locale],
    );

  beforeEach(async () => {
    db = await createHostDb();
    info = new HostInfoService(db.context);
    for (let id = 1; id <= 7; id += 1) await user(id);
    await db.sql(`INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine'), (2, 'Printer', 'machine')`);
    await db.sql(`INSERT INTO resource_group (id, name, isHidden) VALUES (10, 'Wood', 0), (11, 'Secret', 1)`);
    await db.sql(`INSERT INTO resource_groups_resource_group (resourceId, resourceGroupId) VALUES (1, 10)`);
  });
  afterEach(() => db.dataSource.destroy());

  it('normalizes locales', () => {
    expect(normalizeLanguage('de-AT', 'en')).toBe('de');
    expect(normalizeLanguage('EN_gb', 'de')).toBe('en');
    expect(normalizeLanguage('fr', 'de')).toBe('de');
    expect(normalizeLanguage(null, 'en')).toBe('en');
  });

  it('reads the public base URL like core and trims the trailing slash', async () => {
    expect(await info.getBaseUrl()).toBeNull();
    await db.sql(
      `INSERT INTO setting (parent, key, value, createdAt, updatedAt) VALUES ('app', 'backend_url', 'https://makerspace.test/', datetime('now'), datetime('now'))`,
    );
    expect(await info.getBaseUrl()).toBe('https://makerspace.test');
  });

  it('resolves languages: supported locale first, then the installation default (German when never configured)', async () => {
    await user(8, 'de-AT');
    await user(9, 'fr');
    expect([...(await info.languagesOf([1, 8, 9, 404]))]).toEqual([
      [1, 'en'],
      [8, 'de'],
      [9, 'de'],
      [404, 'de'],
    ]);
    await db.sql(
      `INSERT INTO setting (parent, key, value, createdAt, updatedAt) VALUES ('app', 'default_language', 'en', datetime('now'), datetime('now'))`,
    );
    expect((await info.languagesOf([9])).get(9)).toBe('en');
  });

  it('finds managers: permission holders plus resource and group introducers/maintainers', async () => {
    await db.sql(
      `INSERT INTO role (id, key, name, description, isSystemManaged, isDefault, createdAt, updatedAt) VALUES (1, 'admin', 'Admin', '', 0, 0, datetime('now'), datetime('now')), (2, 'maint', 'Maint', '', 0, 0, datetime('now'), datetime('now')), (3, 'other', 'Other', '', 0, 0, datetime('now'), datetime('now'))`,
    );
    await db.sql(
      `INSERT INTO permission (key, label, description, category, createdAt, updatedAt) VALUES ('resources.update', 'u', '', 'r', datetime('now'), datetime('now')), ('resources.maintenance.manage', 'm', '', 'r', datetime('now'), datetime('now')), ('resources.view', 'v', '', 'r', datetime('now'), datetime('now'))`,
    );
    await db.sql(
      `INSERT INTO role_permission (roleId, permissionKey, createdAt) VALUES (1, 'resources.update', datetime('now')), (2, 'resources.maintenance.manage', datetime('now')), (3, 'resources.view', datetime('now'))`,
    );
    await db.sql(
      `INSERT INTO user_role (userId, roleId, source, createdAt, updatedAt) VALUES (1, 1, 'manual', datetime('now'), datetime('now')), (2, 2, 'manual', datetime('now'), datetime('now')), (6, 3, 'manual', datetime('now'), datetime('now'))`,
    );
    await db.sql(
      `INSERT INTO resource_introducer (type, resourceId, userId, grantedAt) VALUES ('introducer', 1, 3, datetime('now')), ('maintainer', 2, 5, datetime('now'))`,
    );
    await db.sql(
      `INSERT INTO resource_introducer (type, resourceGroupId, userId, grantedAt) VALUES ('maintainer', 10, 4, datetime('now')), ('introducer', 11, 7, datetime('now'))`,
    );
    expect((await info.managerIdsOf(1)).sort()).toEqual([1, 2, 3, 4]);
    expect((await info.managerIdsOf(2)).sort()).toEqual([1, 2, 5]);
  });

  it('counts unhealthy health entries', async () => {
    await db.sql(
      `INSERT INTO resource_health_state (resourceId, identifier, status, source, lastReportedAt, createdAt, updatedAt) VALUES (1, 'a', 'unhealthy', 'manual', datetime('now'), datetime('now'), datetime('now')), (1, 'b', 'healthy', 'manual', datetime('now'), datetime('now'), datetime('now'))`,
    );
    expect(await info.countUnhealthyEntries(1)).toBe(1);
    expect(await info.countUnhealthyEntries(2)).toBe(0);
  });
});
