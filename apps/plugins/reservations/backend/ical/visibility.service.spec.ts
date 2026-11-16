import type { AccessService } from '../reservations/access.service';
import { createHostDb } from '../testing/host-db.test-utils';
import { VisibilityService } from './visibility.service';

describe('VisibilityService (real host entities)', () => {
  let db: Awaited<ReturnType<typeof createHostDb>>;
  let service: VisibilityService;
  const updaters = new Set<number>();

  beforeEach(async () => {
    updaters.clear();
    db = await createHostDb();
    service = new VisibilityService(db.context, {
      hasUpdatePermission: async (userId: number) => updaters.has(userId),
    } as unknown as AccessService);
    for (let id = 1; id <= 4; id += 1) {
      await db.sql(
        `INSERT INTO "user" (id, username, email, locale, isEmailVerified, isDisabled, createdAt, updatedAt) VALUES (?, ?, ?, 'en', 1, 0, datetime('now'), datetime('now'))`,
        [id, `u${id}`, `u${id}@t`],
      );
    }
    await db.sql(
      `INSERT INTO resource (id, name, type) VALUES (1, 'Open', 'machine'), (2, 'Hidden only', 'machine'), (3, 'Both', 'machine'), (4, 'Ungrouped', 'machine')`,
    );
    await db.sql(`INSERT INTO resource_group (id, name, isHidden) VALUES (10, 'Public', 0), (11, 'Secret', 1)`);
    await db.sql(
      `INSERT INTO resource_groups_resource_group (resourceId, resourceGroupId) VALUES (1, 10), (2, 11), (3, 10), (3, 11)`,
    );
  });
  afterEach(() => db.dataSource.destroy());

  const visible = async (userId: number) => (await service.filterVisible(userId, [1, 2, 3, 4, 99])).sort();

  it('hides resources that only live in hidden groups', async () => {
    expect(await visible(1)).toEqual([1, 3, 4]);
  });

  it('shows hidden groups to their introducers', async () => {
    await db.sql(
      `INSERT INTO resource_introducer (type, resourceGroupId, userId, grantedAt) VALUES ('maintainer', 11, 2, datetime('now'))`,
    );
    expect(await visible(2)).toEqual([1, 2, 3, 4]);
    expect(await visible(1)).toEqual([1, 3, 4]);
  });

  it('shows hidden groups to users with an active introduction, not after it was revoked', async () => {
    await db.sql(
      `INSERT INTO resource_introduction (id, resourceGroupId, receiverUserId, tutorUserId, completedAt, createdAt) VALUES (1, 11, 3, 1, datetime('now'), datetime('now'))`,
    );
    await db.sql(
      `INSERT INTO resource_introduction_history_item (introductionId, action, performedByUserId, createdAt) VALUES (1, 'grant', 1, '2026-01-01 10:00:00')`,
    );
    expect(await visible(3)).toEqual([1, 2, 3, 4]);
    await db.sql(
      `INSERT INTO resource_introduction_history_item (introductionId, action, performedByUserId, createdAt) VALUES (1, 'revoke', 1, '2026-01-02 10:00:00')`,
    );
    expect(await visible(3)).toEqual([1, 3, 4]);
  });

  it('shows everything (that exists) to resources.update holders', async () => {
    updaters.add(4);
    expect(await visible(4)).toEqual([1, 2, 3, 4]);
  });

  it('treats soft-deleted and disabled accounts as inactive', async () => {
    expect(await service.isActiveAccount(1)).toBe(true);
    expect(await service.isActiveAccount(99)).toBe(false);
    await db.sql(`UPDATE "user" SET isDisabled = 1 WHERE id = 2`);
    await db.sql(`UPDATE "user" SET deletedAt = datetime('now') WHERE id = 3`);
    expect(await service.isActiveAccount(2)).toBe(false);
    expect(await service.isActiveAccount(3)).toBe(false);
  });

  it('finds supervision-required resources', async () => {
    await db.sql(`UPDATE resource SET supervisionMode = 'supervision_required' WHERE id IN (2, 4)`);
    await db.sql(`UPDATE resource SET supervisionMode = 'supervision_allowed' WHERE id = 3`);
    expect((await service.resourceIdsRequiringSupervision([1, 2, 3, 4, 99])).sort()).toEqual([2, 4]);
    expect(await service.resourceIdsRequiringSupervision([])).toEqual([]);
  });

  it('lists the resources of groups', async () => {
    expect((await service.resourceIdsOfGroups([10, 11])).sort()).toEqual([1, 2, 3]);
    expect(await service.resourceIdsOfGroups([])).toEqual([]);
  });
});
