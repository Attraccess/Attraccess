import 'reflect-metadata';
import {
  Flow,
  Resource,
  ResourceFlowNode,
  ResourceGroup,
  ResourceHealthState,
  ResourceIntroducer,
  Role,
  RolePermission,
  Setting,
  User,
  UserRole,
} from '@attraccess/database-entities';
import {
  ResourceHealthSource,
  ResourceHealthStatus,
  ResourceType,
  SupervisionMode,
} from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import type { PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { createTransactionScope } from '../../../plugin-system/persistence/plugin-transaction-scope';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { createPluginCoreLookup, createPluginHostData } from './plugin-host-data.adapter';

describe('plugin host data adapter on a real database', () => {
  let source: DataSource;
  let ids: {
    active: number;
    disabled: number;
    deleted: number;
    printer: number;
    door: number;
    hiddenOnly: number;
    visibleGroup: number;
    hiddenGroup: number;
    globalFlow: number;
  };

  const hostData = () => createPluginHostData(() => source);

  beforeAll(async () => {
    source = await createTestDataSource();

    const users = source.getRepository(User);
    const active = await users.save({ username: 'ada', email: 'ada@example.test', locale: 'de' });
    const disabled = await users.save({ username: 'off', email: 'off@example.test', isDisabled: true });
    const deleted = await users.save({ username: 'gone', email: 'gone@example.test' });
    await users.softDelete(deleted.id);

    const groups = source.getRepository(ResourceGroup);
    const visibleGroup = await groups.save({ name: 'visible', isHidden: false });
    const hiddenGroup = await groups.save({ name: 'hidden', isHidden: true });

    const resources = source.getRepository(Resource);
    const base = {
      type: ResourceType.Machine,
      description: null,
      supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    };
    const printer = await resources.save({ ...base, name: 'Printer', maxParallelSessions: 3, groups: [visibleGroup] });
    const door = await resources.save({
      ...base,
      name: 'Door',
      type: ResourceType.Door,
      supervisionMode: SupervisionMode.SUPERVISION_REQUIRED,
    });
    const hiddenOnly = await resources.save({ ...base, name: 'Secret', groups: [hiddenGroup] });
    await resources.softDelete((await resources.save({ ...base, name: 'Removed' })).id);

    // Migrations seed some app settings: replace the ones this spec reads.
    await source.getRepository(Setting).delete({ parent: 'app', key: 'backend_url' });
    await source.getRepository(Setting).save([
      { parent: 'app', key: 'backend_url', value: ' https://attraccess.example.test/ ' },
      { parent: 'app', key: 'blank', value: '   ' },
      { parent: 'other', key: 'backend_url', value: 'https://wrong.example.test' },
    ]);

    await source.getRepository(ResourceHealthState).save([
      {
        resourceId: printer.id,
        identifier: 'mqtt',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'offline',
        source: ResourceHealthSource.PAYLOAD,
        lastReportedAt: new Date(),
      },
      {
        resourceId: printer.id,
        identifier: 'door',
        status: ResourceHealthStatus.HEALTHY,
        reason: null,
        source: ResourceHealthSource.PAYLOAD,
        lastReportedAt: new Date(),
      },
    ]);

    const introducers = source.getRepository(ResourceIntroducer);
    await introducers.save([
      { resourceId: printer.id, resourceGroupId: null, userId: active.id },
      // An introducer of the hidden group reaches the group's resources; a deleted user never counts.
      { resourceId: null, resourceGroupId: hiddenGroup.id, userId: disabled.id },
      { resourceId: printer.id, resourceGroupId: null, userId: deleted.id },
    ]);

    const role = await source
      .getRepository(Role)
      .save({ key: 'door-managers', name: 'Door managers', description: '' });
    await source.getRepository(RolePermission).save({ roleId: role.id, permissionKey: 'resources.update' });
    await source.getRepository(UserRole).save([
      { userId: active.id, roleId: role.id },
      { userId: deleted.id, roleId: role.id },
    ]);

    const flow = await source.getRepository(Flow).save({ name: 'Global flow', enabled: true, description: null });
    const position = { x: 0, y: 0 };
    const nodes = source.getRepository(ResourceFlowNode);
    await nodes.save([
      {
        id: 'n1',
        type: 'plugin.wago.command' as never,
        position,
        resourceId: printer.id,
        flowId: null,
        data: { controllerId: 1, channelId: 'out1' },
      },
      {
        id: 'n2',
        type: 'plugin.wago.status' as never,
        position,
        resourceId: door.id,
        flowId: null,
        data: { controllerId: 1 },
      },
      {
        id: 'n3',
        type: 'plugin.wago.command' as never,
        position,
        resourceId: null,
        flowId: flow.id,
        data: { controllerId: 2, channelId: 'out1' },
      },
      {
        id: 'n4',
        type: 'plugin.other.command' as never,
        position,
        resourceId: printer.id,
        flowId: null,
        data: { controllerId: 1, channelId: 'out1' },
      },
    ]);

    ids = {
      active: active.id,
      disabled: disabled.id,
      deleted: deleted.id,
      printer: printer.id,
      door: door.id,
      hiddenOnly: hiddenOnly.id,
      visibleGroup: visibleGroup.id,
      hiddenGroup: hiddenGroup.id,
      globalFlow: flow.id,
    };
  });

  afterAll(async () => {
    await closeTestDataSource(source);
  });

  describe('resources', () => {
    it('maps a resource to the neutral model and skips deleted and unknown ones', async () => {
      expect(await hostData().resources.get(ids.printer)).toEqual({
        id: ids.printer,
        name: 'Printer',
        type: ResourceType.Machine,
        description: null,
        allowTakeOver: false,
        maxParallelSessions: 3,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
      });
      expect(await hostData().resources.get(999)).toBeNull();
      expect([...(await hostData().resources.getNames([ids.printer, ids.door, 999]))]).toEqual([
        [ids.printer, 'Printer'],
        [ids.door, 'Door'],
      ]);
      expect((await hostData().resources.getNames([])).size).toBe(0);
    });

    it('reads a resource inside the transaction of a scope it is given, and refuses a closed scope', async () => {
      let kept: PluginTransactionScope | undefined;
      await source
        .transaction(async (manager) => {
          await manager.getRepository(Resource).update(ids.printer, { maxParallelSessions: 5 });
          kept = createTransactionScope(
            manager,
            () => manager.queryRunner?.isTransactionActive ?? true,
            () => undefined,
          );
          // The uncommitted change is only visible inside the transaction.
          expect(await hostData().resources.get(ids.printer, kept)).toMatchObject({ maxParallelSessions: 5 });
          throw new Error('roll back');
        })
        .catch(() => undefined);

      expect(await hostData().resources.get(ids.printer)).toMatchObject({ maxParallelSessions: 3 });
      await expect(hostData().resources.get(ids.printer, kept)).rejects.toThrow('The transaction scope is closed');
    });

    it('hides resources that only belong to hidden groups unless the user may see them', async () => {
      const all = [ids.printer, ids.door, ids.hiddenOnly, 999];
      const asVisitor = await hostData().resources.filterVisible(ids.active, all);
      expect(asVisitor.sort()).toEqual([ids.printer, ids.door].sort());
      // The user holds an introducer role for the hidden group.
      const asIntroducer = await hostData().resources.filterVisible(ids.disabled, all);
      expect(asIntroducer.sort()).toEqual([ids.printer, ids.door, ids.hiddenOnly].sort());
      const seeAll = await hostData().resources.filterVisible(ids.active, all, { seeAll: true });
      expect(seeAll.sort()).toEqual([ids.printer, ids.door, ids.hiddenOnly].sort());
      expect(await hostData().resources.filterVisible(ids.active, [])).toEqual([]);
    });

    it('shows a hidden group to users with a granted introduction, not after it was revoked', async () => {
      const learner = await source.getRepository(User).save({ username: 'learner', email: 'learner@example.test' });
      await source.query(
        `INSERT INTO resource_introduction (id, "resourceGroupId", "receiverUserId", "tutorUserId", "completedAt", "createdAt") VALUES (900, $1, $2, $3, now(), now())`,
        [ids.hiddenGroup, learner.id, ids.active],
      );
      const history = (action: string, at: string) =>
        source.query(
          `INSERT INTO resource_introduction_history_item ("introductionId", action, "performedByUserId", "createdAt") VALUES (900, $1, $2, $3)`,
          [action, ids.active, at],
        );
      const all = [ids.printer, ids.door, ids.hiddenOnly];
      await history('grant', '2026-01-01 10:00:00');
      expect((await hostData().resources.filterVisible(learner.id, all)).sort()).toEqual([...all].sort());
      await history('revoke', '2026-01-02 10:00:00');
      expect((await hostData().resources.filterVisible(learner.id, all)).sort()).toEqual(
        [ids.printer, ids.door].sort(),
      );
    });

    it('answers supervision, group membership, health and introducer questions', async () => {
      expect(await hostData().resources.filterRequiringSupervision([ids.printer, ids.door])).toEqual([ids.door]);
      expect(await hostData().resources.listIdsInGroups([ids.visibleGroup])).toEqual([ids.printer]);
      expect(await hostData().resources.listIdsInGroups([])).toEqual([]);
      expect(await hostData().resources.countUnhealthyEntries(ids.printer)).toBe(1);
      expect(await hostData().resources.countUnhealthyEntries(ids.door)).toBe(0);
      // The soft-deleted introducer of the printer is skipped; the hidden group's introducer reaches its resource.
      expect(await hostData().resources.listIntroducerUserIds(ids.printer)).toEqual([ids.active]);
      expect(await hostData().resources.listIntroducerUserIds(ids.hiddenOnly)).toEqual([ids.disabled]);
    });
  });

  describe('users', () => {
    it('reads names and locales of existing users only', async () => {
      const users = hostData().users;
      expect([...(await users.getUsernames([ids.active, ids.deleted]))]).toEqual([[ids.active, 'ada']]);
      expect([...(await users.getLocales([ids.active]))]).toEqual([[ids.active, 'de']]);
      expect((await users.getUsernames([])).size).toBe(0);
    });

    it('treats deleted and disabled accounts as inactive', async () => {
      const users = hostData().users;
      expect(await users.isActive(ids.active)).toBe(true);
      expect(await users.isActive(ids.disabled)).toBe(false);
      expect(await users.isActive(ids.deleted)).toBe(false);
      expect(await users.isActive(999)).toBe(false);
    });

    it('lists users holding a permission through a role, skipping deleted users', async () => {
      expect(await hostData().users.listIdsWithAnyPermission(['resources.update', 'resources.nothing'])).toEqual([
        ids.active,
      ]);
      expect(await hostData().users.listIdsWithAnyPermission([])).toEqual([]);
    });
  });

  it('reads trimmed application settings of the app scope only', async () => {
    const settings = hostData().settings;
    expect(await settings.getApp('backend_url')).toBe('https://attraccess.example.test/');
    expect(await settings.getApp('blank')).toBeNull();
    expect(await settings.getApp('missing')).toBeNull();
  });

  describe('flow nodes', () => {
    const find = (query: Parameters<ReturnType<typeof hostData>['flows']['findNodes']>[0]) =>
      hostData()
        .flows.findNodes(query)
        .then((nodes) => nodes.map((node) => node.id).sort());

    it('selects by type prefix and data, with the names of resource and global flow', async () => {
      expect(await find({ typePrefix: 'plugin.wago.', dataEquals: { controllerId: 1 } })).toEqual(['n1', 'n2']);
      expect(await find({ type: 'plugin.wago.command' })).toEqual(['n1', 'n3']);
      const [global] = await hostData().flows.findNodes({
        type: 'plugin.wago.command',
        dataEquals: { controllerId: 2 },
      });
      expect(global).toMatchObject({
        id: 'n3',
        resourceId: null,
        resourceName: null,
        flowId: ids.globalFlow,
        flowName: 'Global flow',
        data: { controllerId: 2, channelId: 'out1' },
      });
      const [owned] = await hostData().flows.findNodes({ type: 'plugin.wago.status' });
      expect(owned).toMatchObject({
        id: 'n2',
        resourceId: ids.door,
        resourceName: 'Door',
        flowId: null,
        flowName: null,
      });
    });

    it('matches several values, owners and exclusions without skipping nodes of global flows', async () => {
      expect(await find({ typePrefix: 'plugin.wago.', dataIn: { controllerId: [1, 2] } })).toEqual(['n1', 'n2', 'n3']);
      expect(await find({ typePrefix: 'plugin.wago.', dataIn: { controllerId: [] } })).toEqual([]);
      expect(await find({ typePrefix: 'plugin.', resourceId: ids.printer })).toEqual(['n1', 'n4']);
      // NULL owners must be matched explicitly: `<>` would skip them.
      expect(await find({ type: 'plugin.wago.command', excludeResourceId: ids.printer })).toEqual(['n3']);
      expect(await find({ type: 'plugin.wago.command', excludeFlowId: ids.globalFlow })).toEqual(['n1']);
    });

    it('orders by id, limits rows and escapes the type prefix', async () => {
      const ordered = await hostData().flows.findNodes({ typePrefix: 'plugin.', orderById: true, limit: 2 });
      expect(ordered.map((node) => node.id)).toEqual(['n1', 'n2']);
      expect(await find({ typePrefix: 'plugin_wago%' })).toEqual([]);
    });

    it('refuses data keys that are not plain identifiers', async () => {
      await expect(hostData().flows.findNodes({ dataEquals: { "x') OR 1=1 --": 1 } })).rejects.toThrow(/identifiers/);
    });
  });

  it('hands core services the records they expect, without exposing them to plugins', async () => {
    const lookup = createPluginCoreLookup(() => source);
    expect((await lookup.findUser(ids.active))?.username).toBe('ada');
    expect(await lookup.findUser(ids.deleted)).toBeNull();
    expect((await lookup.findRecipients([ids.active, ids.disabled])).map((user) => user.id).sort()).toEqual(
      [ids.active, ids.disabled].sort(),
    );
    expect(await lookup.findResourceSupervision(ids.door)).toMatchObject({
      id: ids.door,
      supervisionMode: SupervisionMode.SUPERVISION_REQUIRED,
    });
    expect((await lookup.listResourceIds()).sort()).toEqual([ids.printer, ids.door, ids.hiddenOnly].sort());
  });
});
