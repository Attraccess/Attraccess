import { DataSource } from 'typeorm';
import { TypeOrmResourceStore } from '../../database/adapters/resources/resource-store.adapter';
import { TypeOrmResourceGroupStore } from '../../database/adapters/resources/resource-group-store.adapter';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';

jest.setTimeout(120_000);

/**
 * The "permitted-only" rule of machine list visibility (ATT-843) against a real database:
 * 1 direct introduction, 2 revoked introduction, 3, 4 and 7 in group 10 where the viewer holds a group introduction,
 * 5 direct maintainer, 6 running session, 8 in group 11 where the viewer is the group introducer,
 * 9 deleted machine the viewer was introduced to.
 */
describe('permitted machines (persistence)', () => {
  let source: DataSource;
  let store: TypeOrmResourceStore;
  let groups: TypeOrmResourceGroupStore;
  const viewer = 7;
  const permitted = [1, 3, 4, 5, 6, 7, 8];

  beforeEach(async () => {
    source = await createTestDataSource();
    store = new TypeOrmResourceStore(source);
    groups = new TypeOrmResourceGroupStore(source);
    await source.query(
      `INSERT INTO "user" (id, username, email) VALUES (7, 'member', 'member@example.test'), (8, 'other', 'other@example.test')`,
    );
    await source.query(
      `INSERT INTO "resource" (id, name, type) SELECT id, 'Machine ' || id, 'machine' FROM generate_series(1, 9) AS id`,
    );
    await source.query(`UPDATE "resource" SET "deletedAt" = now() WHERE id = 9`);
    await source.query(
      `INSERT INTO "resource_group" (id, name, "isHidden") VALUES (10, 'Wood', false), (11, 'Metal', false), (12, 'Empty', false), (13, 'Hidden', true)`,
    );
    await source.query(
      `INSERT INTO "resource_groups_resource_group" ("resourceId", "resourceGroupId") VALUES (3, 10), (4, 10), (7, 10), (8, 11), (7, 13)`,
    );
    await source.query(
      `INSERT INTO "resource_introduction" (id, "resourceId", "resourceGroupId", "receiverUserId") VALUES
         (1, 1, NULL, 7), (2, 2, NULL, 7), (3, NULL, 10, 7), (4, 9, NULL, 7)`,
    );
    await source.query(
      `INSERT INTO "resource_introduction_history_item" (id, "introductionId", action, "performedByUserId", "createdAt") VALUES
         (1, 1, 'grant', 8, '2026-01-01'), (2, 2, 'grant', 8, '2026-01-01'), (3, 2, 'revoke', 8, '2026-01-02'),
         (4, 3, 'grant', 8, '2026-01-01'), (5, 4, 'grant', 8, '2026-01-01')`,
    );
    await source.query(
      `INSERT INTO "resource_introducer" ("resourceId", "resourceGroupId", "userId", type) VALUES
         (5, NULL, 7, 'maintainer'), (NULL, 11, 7, 'introducer')`,
    );
    await source.query(
      `INSERT INTO "resource_usage" ("usageAction", "resourceId", "userId", "isFinalized", "lifecyclePending") VALUES
         ('usage', 6, 7, true, false)`,
    );
  });
  afterEach(() => closeTestDataSource(source));

  it('lists exactly the machines the viewer may see, with the total counting only those', async () => {
    const all = await store.list({ page: 1, limit: 50, permittedForUserId: viewer });
    expect(all.data.map((resource) => resource.id)).toEqual(permitted);
    expect(all.total).toBe(permitted.length);
  });

  it('paginates the narrowed list: pages and total reflect visible machines only', async () => {
    const second = await store.list({ page: 2, limit: 4, permittedForUserId: viewer });
    expect(second.data.map((resource) => resource.id)).toEqual([6, 7, 8]);
    expect(second.total).toBe(permitted.length);
  });

  it('keeps the other filters working on top', async () => {
    const found = await store.list({ page: 1, limit: 50, permittedForUserId: viewer, search: 'machine 3' });
    expect(found.data.map((resource) => resource.id)).toEqual([3]);
    const inUse = await store.list({ page: 1, limit: 50, permittedForUserId: viewer, onlyInUse: true });
    expect(inUse.data.map((resource) => resource.id)).toEqual([6]);
  });

  it('lists nothing for an account without introductions, introducer rights or sessions', async () => {
    expect(await store.list({ page: 1, limit: 50, permittedForUserId: 8 })).toEqual({ data: [], total: 0 });
  });

  it('does not narrow without a viewer', async () => {
    expect((await store.list({ page: 1, limit: 50 })).total).toBe(8);
  });

  it('answers per id which machines are permitted', async () => {
    expect((await store.permittedIds(viewer, [1, 2, 3, 7, 8, 9, 404])).sort()).toEqual([1, 3, 7, 8]);
    expect(await store.permittedIds(viewer, [])).toEqual([]);
  });

  it('stops counting a machine once its session ended or its introduction is revoked', async () => {
    await source.query(`UPDATE "resource_usage" SET "endTime" = now() WHERE "resourceId" = 6`);
    await source.query(
      `INSERT INTO "resource_introduction_history_item" (id, "introductionId", action, "performedByUserId", "createdAt") VALUES (6, 1, 'revoke', 8, '2026-02-01')`,
    );
    expect((await store.permittedIds(viewer, [1, 6])).sort()).toEqual([]);
  });

  it('ignores a pending reservation: only a published session shows the machine', async () => {
    await source.query(`UPDATE "resource_usage" SET "lifecyclePending" = true, "isFinalized" = false`);
    expect(await store.permittedIds(viewer, [6])).toEqual([]);
  });

  describe('groups', () => {
    const narrowed = { userId: viewer, canUpdateResources: false, permittedOnly: true };

    it('lists only groups with a visible machine, or that the viewer is part of', async () => {
      // 10: machines 3 and 4 are visible; 11: viewer is the group introducer; 12 is empty; 13 is hidden.
      expect((await groups.listVisible(narrowed)).map((group) => group.id).sort()).toEqual([10, 11]);
      expect((await groups.listVisible({ ...narrowed, userId: 8 })).map((group) => group.id)).toEqual([]);
    });

    it('lets managers see every group', async () => {
      expect(await groups.listVisible({ ...narrowed, canUpdateResources: true })).toHaveLength(4);
    });

    it('does not narrow groups when the viewer sees every machine', async () => {
      expect((await groups.listVisible({ ...narrowed, permittedOnly: false })).map((group) => group.id).sort()).toEqual(
        [10, 11, 12],
      );
    });

    it('answers whether one group is visible', async () => {
      expect(await groups.isVisible(10, narrowed)).toBe(true);
      expect(await groups.isVisible(12, narrowed)).toBe(false);
      expect(await groups.isVisible(13, narrowed)).toBe(false);
    });

    it('counts only visible machines for the resources-exist check', async () => {
      expect(await groups.hasVisibleResources(narrowed)).toBe(true);
      expect(await groups.hasVisibleResources({ ...narrowed, userId: 8 })).toBe(false);
      // Only machine 2 is left: ungrouped, and its introduction was revoked.
      await source.query(`UPDATE "resource" SET "deletedAt" = now() WHERE id <> 2`);
      expect(await groups.hasVisibleResources(narrowed)).toBe(false);
    });
  });
});
