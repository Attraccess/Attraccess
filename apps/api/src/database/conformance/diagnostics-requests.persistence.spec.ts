import {
  entities,
  MaintenanceRequestStatus,
  Resource,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceGroup,
  ResourceIntroducer,
  ResourceMaintenanceRequest,
  ResourceOperatingInterval,
  ResourceType,
  User,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { TypeormOperatingDiagnosticsPersistence } from '../../resources/operating-intervals/persistence/typeorm-adapter';
import {
  TypeormMaintenanceRequestPersistence,
  TypeormMaintenanceRequestRecipients,
} from '../../resources/maintenances/persistence/typeorm-adapter';

// Query selection and relation loading belong here; application rules use port fakes.
describe('SQLite diagnostics and maintenance-request persistence', () => {
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
      { id: 1, username: 'author', email: 'author@example.test' },
      { id: 2, username: 'maintainer', email: 'maintainer@example.test' },
    ]);
    await source.getRepository(Resource).save([
      { id: 1, name: 'Laser', type: ResourceType.Machine },
      { id: 2, name: 'Lathe', type: ResourceType.Machine },
    ]);
  });

  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('orders and paginates intervals within a resource and selects open and overlapping windows', async () => {
    await source.getRepository(ResourceOperatingInterval).save([
      { id: 1, resourceId: 1, startTime: at(8), endTime: at(9) },
      { id: 2, resourceId: 1, startTime: at(10), endTime: at(11) },
      { id: 3, resourceId: 1, startTime: at(12), endTime: null },
      { id: 4, resourceId: 2, startTime: at(13), endTime: null },
    ]);
    const persistence = new TypeormOperatingDiagnosticsPersistence(
      source.getRepository(ResourceOperatingInterval),
      source.getRepository(ResourceFlowNode),
    );
    expect(await persistence.openInterval(1)).toMatchObject({ id: 3 });
    expect(await persistence.latestInterval(1)).toMatchObject({ id: 3 });
    const [page, total] = await persistence.intervalPage(1, 2, 1);
    expect(ids(page)).toEqual([2]);
    expect(total).toBe(3);
    expect(await persistence.openIntervalCount(1)).toBe(1);
    expect(ids(await persistence.recentTransitions(1, at(10)))).toEqual([2, 3]);
    expect(ids(await persistence.overlappingWindow(1, at(9), at(12)))).toEqual([2]);
    expect(ids(await persistence.overlappingWindow(1, at(11), at(14)))).toEqual([3]);
    expect(await persistence.openInterval(99)).toBeNull();
    expect(await persistence.latestInterval(99)).toBeNull();
    expect(await persistence.intervalPage(99, 1, 10)).toEqual([[], 0]);
    await source.getRepository(ResourceFlowNode).save([
      {
        id: 'tracking',
        resourceId: 1,
        type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        position: { x: 0, y: 0 },
      },
      { id: 'other-type', resourceId: 1, type: ResourceFlowNodeType.INPUT_BUTTON, position: { x: 0, y: 0 } },
      {
        id: 'other-resource',
        resourceId: 2,
        type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        position: { x: 0, y: 0 },
      },
    ]);
    expect(await persistence.trackingNodeCount(1, [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED])).toBe(1);
  });

  it('persists request state and audit relations and filters pages by resource and status', async () => {
    const persistence = new TypeormMaintenanceRequestPersistence(
      source.getRepository(ResourceMaintenanceRequest),
      source.getRepository(Resource),
    );
    const resource = await persistence.resource(1);
    expect(resource).toMatchObject({ id: 1 });
    if (!resource) throw new Error('Missing seeded resource');
    const otherResource = await persistence.resource(2);
    if (!otherResource) throw new Error('Missing second seeded resource');
    expect(await persistence.resource(99)).toBeNull();
    const first = await persistence.createRequest(resource, 1, 'Broken lens', MaintenanceRequestStatus.OPEN);
    const second = await persistence.createRequest(resource, 1, 'Loose cable', MaintenanceRequestStatus.OPEN);
    await source.getRepository(ResourceMaintenanceRequest).update(first.id, { createdAt: at(8) });
    await source.getRepository(ResourceMaintenanceRequest).update(second.id, { createdAt: at(9) });
    await persistence.createRequest(otherResource, 1, 'Other resource', MaintenanceRequestStatus.OPEN);
    const [page, total] = await persistence.requestPage(1, 2, 1, MaintenanceRequestStatus.OPEN);
    expect(ids(page)).toEqual([first.id]);
    expect(total).toBe(2);
    expect(page[0].createdByUser).toMatchObject({ id: 1, username: 'author' });
    const resolvedAt = at(10);
    await persistence.saveRequest({
      ...first,
      status: MaintenanceRequestStatus.DISMISSED,
      resolvedByUser: { id: 2 } as User,
      resolvedAt,
    });
    expect(await persistence.requestWithRelations(first.id)).toMatchObject({
      status: MaintenanceRequestStatus.DISMISSED,
      resolvedByUser: { id: 2 },
      resolvedAt,
    });
    expect(ids((await persistence.requestPage(1, 1, 10, MaintenanceRequestStatus.OPEN))[0])).toEqual([second.id]);
    expect(await persistence.requestWithRelations(99)).toBeNull();
  });

  it('loads notification authors, resource groups and only matching recipient users', async () => {
    const group = await source.getRepository(ResourceGroup).save({ name: 'Workshop', resources: [{ id: 1 }] });
    await source.getRepository(ResourceIntroducer).save([
      { userId: 1, resourceId: 1 },
      { userId: 2, resourceGroupId: group.id },
      { userId: 2, resourceId: 2 },
    ]);
    const request = await source.getRepository(ResourceMaintenanceRequest).save({
      resourceId: 1,
      reason: 'Broken',
      createdByUser: { id: 1 },
      status: MaintenanceRequestStatus.OPEN,
    });
    const persistence = new TypeormMaintenanceRequestRecipients(
      source.getRepository(Resource),
      source.getRepository(ResourceIntroducer),
      source.getRepository(ResourceMaintenanceRequest),
      source.getRepository(User),
    );
    expect(await persistence.requestWithAuthor(request.id)).toMatchObject({
      createdByUser: { id: 1, username: 'author' },
    });
    expect(await persistence.resourceWithGroups(1)).toMatchObject({ groups: [{ id: group.id }] });
    expect(ids(await persistence.usersByIds([2]))).toEqual([2]);
    expect(await persistence.usersByIds([])).toEqual([]);
    const rows = await persistence.introducers(1, [group.id]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.user.id).sort()).toEqual([1, 2]);
    expect(await persistence.introducers(99, [])).toEqual([]);
  });
});
