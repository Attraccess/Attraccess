import {
  entities,
  Resource,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceGroup,
  ResourceIntroducer,
  ResourceMaintenance,
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { TypeormFlowEventPersistence } from '../../resources/flows/persistence/typeorm-adapter';
import { TypeormMaintenancePersistence } from '../../resources/maintenances/persistence/typeorm-adapter';
import { TypeormOperatingAttributionPersistence } from '../../resources/operating-intervals/persistence/typeorm-adapter';
import { TypeormUsagePersistence } from '../../resources/usage/persistence/typeorm-adapter';

// These are backend selection regressions. Application policy remains tested with operation fakes.
describe('SQLite adapter selection', () => {
  let source: DataSource;
  const at = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour));
  const ids = (rows: { id: number }[]) => rows.map((row) => row.id);

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    await source.getRepository(User).save([
      { id: 1, username: 'creator', email: 'creator@example.test' },
      { id: 2, username: 'completer', email: 'completer@example.test' },
    ]);
    await source
      .getRepository(Resource)
      .save([1, 2, 3].map((id) => ({ id, name: `Machine ${id}`, type: ResourceType.Machine })));
  });

  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  describe('maintenance', () => {
    beforeEach(async () => {
      await source.getRepository(ResourceMaintenance).save(
        [
          { id: 1, resourceId: 1, startTime: at(8), endTime: at(9) },
          { id: 2, resourceId: 1, startTime: at(9), endTime: null },
          { id: 3, resourceId: 1, startTime: at(10), endTime: at(13) },
          { id: 4, resourceId: 1, startTime: at(13), endTime: null },
          { id: 5, resourceId: 2, startTime: at(8), endTime: null },
        ].map((row) => ({ ...row, createdByUser: { id: 1 }, completedByUser: { id: 2 } })),
      );
    });

    it.each([
      [true, false, false, [4]],
      [false, true, false, [2, 3]],
      [false, false, true, [1]],
      [true, true, false, [2, 3, 4]],
      [true, false, true, [1, 4]],
      [false, true, true, [1, 2, 3]],
      [true, true, true, [1, 2, 3, 4]],
    ] as const)(
      'selects upcoming=%s active=%s past=%s within the resource',
      async (includeUpcoming, includeActive, includePast, expected) => {
        const persistence = new TypeormMaintenancePersistence(source.manager);
        const [rows, total] = await persistence.page(1, {
          includeUpcoming,
          includeActive,
          includePast,
          now: at(12),
          skip: 0,
          take: 10,
        });
        expect(ids(rows)).toEqual(expected);
        expect(total).toBe(expected.length);
      },
    );

    it('counts filtered rows before pagination and loads both audit users', async () => {
      const persistence = new TypeormMaintenancePersistence(source.manager);
      const [rows, total] = await persistence.page(1, {
        includeUpcoming: true,
        includeActive: true,
        includePast: true,
        now: at(12),
        skip: 1,
        take: 2,
      });
      expect(ids(rows)).toEqual([2, 3]);
      expect(total).toBe(4);
      for (const row of rows) {
        expect(row.createdByUser).toMatchObject({ id: 1, username: 'creator' });
        expect(row.completedByUser).toMatchObject({ id: 2, username: 'completer' });
      }
      expect(await persistence.maintenance(1, true)).toMatchObject({
        createdByUser: { id: 1 },
        completedByUser: { id: 2 },
      });
      expect(await persistence.maintenance(1, false)).not.toHaveProperty('completedByUser');
      expect(await persistence.hasActive(1, undefined, at(12))).toBe(true);
      expect(await persistence.hasActive(3, undefined, at(12))).toBe(false);
      expect(await persistence.activeResourceIds([1, 3], at(12))).toEqual([1]);
    });

    it('restricts direct and group permissions to the requested resources and user', async () => {
      const group = await source.getRepository(ResourceGroup).save({
        name: 'Shared workshop',
        resources: [{ id: 2 }, { id: 3 }],
      });
      await source.getRepository(ResourceIntroducer).save([
        { userId: 1, resourceId: 1 },
        { userId: 1, resourceGroupId: group.id },
        { userId: 2, resourceId: 2 },
      ]);
      const persistence = new TypeormMaintenancePersistence(source.manager);
      expect(await persistence.managedResourcePairs(1, [1, 2])).toEqual(
        expect.arrayContaining([
          { resourceId: 1, groupResourceId: null },
          { resourceId: null, groupResourceId: 2 },
        ]),
      );
      expect(await persistence.managedResourcePairs(1, [1, 2])).toHaveLength(2);
      expect(await persistence.managedResourcePairs(2, [1])).toEqual([]);
      expect(await persistence.managedResourcePairs(1, [])).toEqual([]);
      expect(await persistence.directIntroducer(1, 1)).toBe(true);
      expect(await persistence.directIntroducer(2, 1)).toBe(false);
      expect(await persistence.groupIntroducer(1, [group.id])).toBe(true);
      expect(await persistence.groupIntroducer(2, [group.id])).toBe(false);
    });
  });

  it('selects overlapping attribution rows independently for each resource boundary', async () => {
    const rows = [
      { id: 1, resourceId: 1, startTime: at(8), endTime: at(10) },
      { id: 2, resourceId: 1, startTime: at(8), endTime: at(11) },
      { id: 3, resourceId: 1, startTime: at(9), endTime: null },
      { id: 4, resourceId: 1, startTime: at(12), endTime: null },
      { id: 5, resourceId: 2, startTime: at(9), endTime: at(11) },
      { id: 6, resourceId: 2, startTime: at(10), endTime: null },
      { id: 7, resourceId: 3, startTime: at(9), endTime: null },
    ];
    await source.getRepository(ResourceOperatingInterval).save(rows);
    await source.getRepository(ResourceUsage).save([
      ...rows.map((row) => ({ ...row, usageAction: ResourceUsageAction.Usage, lifecyclePending: false })),
      {
        id: 8,
        resourceId: 1,
        startTime: at(9),
        endTime: null,
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: true,
      },
      { id: 9, resourceId: 1, startTime: at(9), endTime: null, usageAction: ResourceUsageAction.DoorLock },
    ]);
    const persistence = new TypeormOperatingAttributionPersistence(source.manager);
    const selected = await persistence.durationRows(
      [
        { resourceId: 1, start: at(10) },
        { resourceId: 2, start: at(11) },
      ],
      at(12),
    );
    expect(selected.intervals).toHaveLength(3);
    expect(selected.intervals).toEqual(
      expect.arrayContaining([
        { resourceId: 1, startTime: at(8), endTime: at(11) },
        { resourceId: 1, startTime: at(9), endTime: null },
        { resourceId: 2, startTime: at(10), endTime: null },
      ]),
    );
    expect(ids(selected.usages).sort((a, b) => a - b)).toEqual([2, 3, 6]);
    expect(ids(await persistence.intervals([1], at(12), at(10)))).toEqual([2, 3]);
    expect(ids(await persistence.usages([1], at(12), at(10)))).toEqual([2, 3]);
    expect(await persistence.durationRows([], at(12))).toEqual({ intervals: [], usages: [] });
  });

  it('selects only published active usage with deterministic ordering and required relations', async () => {
    await source.getRepository(ResourceUsage).save(
      [
        { id: 1, resourceId: 1, startTime: at(9), endTime: null, isFinalized: true },
        { id: 2, resourceId: 1, startTime: at(9), endTime: null, isFinalized: true },
        { id: 3, resourceId: 1, startTime: at(10), endTime: null, isFinalized: true, lifecyclePending: true },
        { id: 4, resourceId: 1, startTime: at(10), endTime: null, isFinalized: false },
        { id: 5, resourceId: 1, startTime: at(10), endTime: at(11), isFinalized: true },
        {
          id: 6,
          resourceId: 1,
          startTime: at(10),
          endTime: null,
          isFinalized: true,
          usageAction: ResourceUsageAction.DoorLock,
        },
        { id: 7, resourceId: 2, startTime: at(10), endTime: null, isFinalized: true },
      ].map((row) => ({ usageAction: ResourceUsageAction.Usage, userId: 1, supervisorUserId: 2, ...row })),
    );
    const persistence = new TypeormUsagePersistence(source.manager);
    expect(await persistence.activeSession(1)).toMatchObject({
      id: 2,
      resource: { id: 1 },
      user: { id: 1 },
      supervisorUser: { id: 2 },
      billingTransaction: null,
      project: null,
    });
    expect(ids(await persistence.activeSessions([1, 2]))).toEqual([7, 2, 1]);
    expect(await persistence.activeSessions([])).toEqual([]);
    expect(await persistence.sessionDetails(1, 3)).toBeNull();
    expect(await persistence.sessionDetails(2, 1)).toBeNull();
    expect(await persistence.sessionDetails(1, 1)).toMatchObject({
      user: { id: 1 },
      supervisorUser: { id: 2 },
      project: null,
      formSubmissions: [],
    });
    const [history, total] = await persistence.history(1, 1, 1, 2);
    expect(history).toHaveLength(2);
    expect(total).toBe(5);
    expect(history.every((row) => row.resourceId === 1 && !row.lifecyclePending)).toBe(true);
    expect(await persistence.history(1, 2, 0, 10)).toEqual([[], 0]);
  });

  it('paginates flow triggers by an exclusive ordered cursor without mixing node types', async () => {
    const type = ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED;
    const nodes = Array.from({ length: 105 }, (_, i) => ({
      id: `node-${String(i).padStart(3, '0')}`,
      type,
      resourceId: 1,
      position: { x: 0, y: 0 },
    }));
    await source
      .getRepository(ResourceFlowNode)
      .save([
        ...nodes.slice().reverse(),
        { id: 'node-099-other', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId: 1, position: { x: 0, y: 0 } },
      ]);
    const persistence = new TypeormFlowEventPersistence(source.getRepository(ResourceFlowNode));
    const first = await persistence.pageNodesByType(type, undefined, 100);
    const second = await persistence.pageNodesByType(type, first[99].id, 100);
    expect([...first, ...second].map((node) => node.id)).toEqual(nodes.map((node) => node.id));
    expect(first).toHaveLength(100);
    expect(second).toHaveLength(5);
    expect(await persistence.pageNodesByType(type, second[4].id, 100)).toEqual([]);
  });
});
