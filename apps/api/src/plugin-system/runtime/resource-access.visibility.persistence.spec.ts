import { DataSource } from 'typeorm';
import type { ResourceListVisibility } from '../../settings/constants';
import type { SettingsService } from '../../settings/settings.service';
import { ResourceGroupsService } from '../../resources/groups/resourceGroups.service';
import { ResourceListVisibilityService } from '../../resources/visibility/resource-list-visibility.service';
import { createPluginCoreLookup, createPluginHostData } from '../../database/adapters/plugins/plugin-host-data.adapter';
import { TypeOrmResourceGroupStore } from '../../database/adapters/resources/resource-group-store.adapter';
import { TypeOrmResourceStore } from '../../database/adapters/resources/resource-store.adapter';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { createResourceAccessContext, type ResourceAccessDeps } from './resource-access';

jest.setTimeout(120_000);

/**
 * `context.resourceAccess` visibility (ATT-1407): core's machine list rule AND the hidden-group rule, on core's own
 * queries against PostgreSQL.
 *
 * Machines: 1 no relation, 2 direct introduction, 3 supervision allowed, 4 running session, 5 direct introduction but
 * only in a hidden group, 6 in a hidden group the member is introduced to, 7 deleted (introduced), 8 direct
 * maintainer. Groups: 10 holds machine 1, 11 hidden (machine 5), 12 hidden with the member's group introduction
 * (machine 6), 13 holds machine 2, 14 empty.
 */
describe('plugin resource access visibility (persistence)', () => {
  let source: DataSource;
  let access: ReturnType<typeof createResourceAccessContext>;
  let mode: ResourceListVisibility;
  let permissions: string[];

  const MEMBER = 7;
  const ALL_EXISTING = [1, 2, 3, 4, 5, 6, 8];
  const PERMITTED = [2, 3, 4, 6, 8];
  const WITHOUT_HIDDEN_GROUP = [1, 2, 3, 4, 6, 8];
  const ASKED = [8, 7, 6, 5, 4, 3, 2, 1, 404, 2];

  beforeAll(async () => {
    source = await createTestDataSource();
    await source.query(
      `INSERT INTO "user" (id, username, email) VALUES (7, 'member', 'member@example.test'), (8, 'other', 'other@example.test')`,
    );
    await source.query(
      `INSERT INTO "resource" (id, name, type) SELECT id, 'Machine ' || id, 'machine' FROM generate_series(1, 8) AS id`,
    );
    await source.query(`UPDATE "resource" SET "supervisionMode" = 'supervision_allowed' WHERE id = 3`);
    await source.query(`UPDATE "resource" SET "deletedAt" = now() WHERE id = 7`);
    await source.query(
      `INSERT INTO "resource_group" (id, name, "isHidden") VALUES
         (10, 'Open', false), (11, 'Secret', true), (12, 'Members', true), (13, 'Mine', false), (14, 'Empty', false)`,
    );
    await source.query(
      `INSERT INTO "resource_groups_resource_group" ("resourceId", "resourceGroupId") VALUES (1, 10), (5, 11), (6, 12), (2, 13)`,
    );
    await source.query(
      `INSERT INTO "resource_introduction" (id, "resourceId", "resourceGroupId", "receiverUserId") VALUES
         (1, 2, NULL, 7), (2, 5, NULL, 7), (3, NULL, 12, 7), (4, 7, NULL, 7)`,
    );
    await source.query(
      `INSERT INTO "resource_introduction_history_item" (id, "introductionId", action, "performedByUserId", "createdAt") VALUES
         (1, 1, 'grant', 8, '2026-01-01'), (2, 2, 'grant', 8, '2026-01-01'), (3, 3, 'grant', 8, '2026-01-01'),
         (4, 4, 'grant', 8, '2026-01-01')`,
    );
    await source.query(
      `INSERT INTO "resource_introducer" ("resourceId", "resourceGroupId", "userId", type) VALUES (8, NULL, 7, 'maintainer')`,
    );
    await source.query(
      `INSERT INTO "resource_usage" ("usageAction", "resourceId", "userId", "isFinalized", "lifecyclePending") VALUES
         ('usage', 4, 7, true, false)`,
    );
  });
  afterAll(() => closeTestDataSource(source));

  beforeEach(() => {
    mode = 'permitted-only';
    permissions = ['resources.read'];
    const lookup = createPluginCoreLookup(() => source);
    const hostData = createPluginHostData(() => source);
    const listVisibility = new ResourceListVisibilityService(
      { getResourceListVisibility: async () => mode } as unknown as SettingsService,
      new TypeOrmResourceStore(source),
    );
    const groupStore = new TypeOrmResourceGroupStore(source);
    const deps = {
      findUser: lookup.findUser,
      listResourceIds: lookup.listResourceIds,
      rbac: { getEffectivePermissions: async () => new Set(permissions) },
      listVisibility,
      groups: new ResourceGroupsService(groupStore, {} as never, {} as never, {} as never, {} as never, {} as never),
      filterOutHiddenGroupResources: (userId: number, ids: number[], options?: { seeAll?: boolean }) =>
        hostData.resources.filterVisible(userId, ids, options),
    } as unknown as ResourceAccessDeps;
    access = createResourceAccessContext(() => deps);
  });

  const visible = async (principal: Parameters<typeof access.canSee>[0] = MEMBER) => {
    const listed = (await access.listVisibleResourceIds(principal)).sort((a, b) => a - b);
    // The three methods answer the same rule.
    const filtered = await access.filterVisible(principal, ASKED);
    expect(filtered).toEqual([...new Set(ASKED)].filter((id) => listed.includes(id)));
    for (const id of ASKED) expect(await access.canSee(principal, id)).toBe(listed.includes(id));
    return listed;
  };

  it.each<[ResourceListVisibility, string, string[], number[], 'all' | 'permitted']>([
    ['permitted-only', 'resources.read', ['resources.read'], PERMITTED, 'permitted'],
    ['permitted-only', 'no permission', [], PERMITTED, 'permitted'],
    ['permitted-only', 'resources.update', ['resources.update'], ALL_EXISTING, 'all'],
    // An access manager passes the machine list rule, but the hidden-group rule still needs resources.update.
    ['permitted-only', 'resources.access.manage', ['resources.access.manage'], WITHOUT_HIDDEN_GROUP, 'all'],
    ['authenticated', 'resources.read', ['resources.read'], WITHOUT_HIDDEN_GROUP, 'all'],
    ['authenticated', 'no permission', [], PERMITTED, 'permitted'],
    ['authenticated', 'resources.update', ['resources.update'], ALL_EXISTING, 'all'],
  ])('"%s" with %s, by user id and as the request user', async (setting, _label, granted, expected, scope) => {
    mode = setting;
    permissions = granted;
    expect(await visible()).toEqual(expected);
    expect(await visible({ id: MEMBER, effectivePermissions: new Set(granted) })).toEqual(expected);
    expect(await access.getResourceListScope(MEMBER)).toBe(scope);
  });

  it('applies an API token scope: without resources.update the manager shortcut is gone', async () => {
    permissions = ['resources.read', 'resources.update'];
    const token = { id: MEMBER, effectivePermissions: new Set(['resources.read']) };
    expect(await visible(token)).toEqual(PERMITTED);
    expect(await access.getResourceListScope(token)).toBe('permitted');
    expect(await access.filterVisibleGroups(token, [11])).toEqual([]);
    expect(await visible()).toEqual(ALL_EXISTING);
  });

  it('does not let a request principal claim a permission the user no longer holds', async () => {
    expect(await visible({ id: MEMBER, effectivePermissions: ['resources.update'] })).toEqual(PERMITTED);
  });

  it('answers nothing for an unknown user', async () => {
    permissions = ['resources.update'];
    expect(await access.listVisibleResourceIds(404)).toEqual([]);
    expect(await access.filterVisible(404, [1, 2])).toEqual([]);
    expect(await access.canSee(404, 1)).toBe(false);
    expect(await access.getResourceListScope(404)).toBe('permitted');
    expect(await access.filterVisibleGroups(404, [10])).toEqual([]);
  });

  it('treats ids that name no machine as not visible, without failing the query', async () => {
    permissions = ['resources.update'];
    expect(await access.filterVisible(MEMBER, [0, -1, 1.5, Number.NaN, 99_999_999_999, 1])).toEqual([1]);
    expect(await access.filterVisible(MEMBER, [])).toEqual([]);
  });

  it('follows core’s group rule, in the order asked', async () => {
    // Narrowed: groups with a visible machine (13) or that the member is part of (12).
    expect(await access.filterVisibleGroups(MEMBER, [14, 13, 12, 11, 10, 404, 13])).toEqual([13, 12]);
    mode = 'authenticated';
    expect(await access.filterVisibleGroups(MEMBER, [14, 13, 12, 11, 10])).toEqual([14, 13, 12, 10]);
    permissions = ['resources.update'];
    expect(await access.filterVisibleGroups(MEMBER, [14, 13, 12, 11, 10])).toEqual([14, 13, 12, 11, 10]);
    expect(await access.filterVisibleGroups(MEMBER, [])).toEqual([]);
  });
});
