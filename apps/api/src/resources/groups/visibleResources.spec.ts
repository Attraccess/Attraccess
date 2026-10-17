import { DataSource, EntitySchema } from 'typeorm';
import { ResourceGroupsService } from './resourceGroups.service';
import { ResourceGroupsController } from './resourceGroups.controller';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

const groupSchema = new EntitySchema({
  name: 'resource_group',
  columns: { id: { type: Number, primary: true }, isHidden: { type: Boolean, default: false } },
});
const resourceSchema = new EntitySchema<{ id: number; groups: Array<{ id: number; isHidden: boolean }> }>({
  name: 'resource',
  columns: { id: { type: Number, primary: true } },
  relations: { groups: { type: 'many-to-many', target: 'resource_group', joinTable: true } },
});

describe('visible resource existence', () => {
  let source: DataSource;
  let service: ResourceGroupsService;
  const member = { userId: 7, canUpdateResources: false };

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [groupSchema, resourceSchema],
      synchronize: true,
    }).initialize();
    await source.query('CREATE TABLE resource_introducer (resourceGroupId INTEGER, userId INTEGER)');
    await source.query(
      'CREATE TABLE resource_introduction (id INTEGER, resourceGroupId INTEGER, receiverUserId INTEGER)',
    );
    await source.query(
      'CREATE TABLE resource_introduction_history_item (id INTEGER, introductionId INTEGER, action TEXT, createdAt TEXT)',
    );
    service = new ResourceGroupsService(
      source.getRepository('resource_group') as never,
      source.getRepository('resource') as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });
  afterEach(async () => {
    await source.destroy();
  });

  async function addResource(groups: Array<{ id: number; isHidden: boolean }>) {
    if (groups.length) await source.getRepository('resource_group').save(groups);
    await source.getRepository('resource').save({ id: 1, groups });
  }

  it('returns false for an empty installation and true for ungrouped resources', async () => {
    expect(await service.hasVisibleResources(member)).toBe(false);
    await addResource([]);
    expect(await service.hasVisibleResources(member)).toBe(true);
  });

  it('hides hidden-only resources but allows resource administrators', async () => {
    await addResource([{ id: 10, isHidden: true }]);
    expect(await service.getMany(member)).toHaveLength(0);
    expect(await service.hasVisibleResources(member)).toBe(false);
    expect(await service.hasVisibleResources({ ...member, canUpdateResources: true })).toBe(true);
  });

  it('counts a multi-group resource when any group is visible', async () => {
    await addResource([
      { id: 10, isHidden: true },
      { id: 11, isHidden: false },
    ]);
    expect((await service.getMany(member)).map((group) => group.id)).toEqual([11]);
    expect(await service.hasVisibleResources(member)).toBe(true);
  });

  it('uses introducer membership for hidden-group visibility', async () => {
    await addResource([{ id: 10, isHidden: true }]);
    await source.query('INSERT INTO resource_introducer VALUES (10, 7)');
    expect(await service.hasVisibleResources(member)).toBe(true);
    expect(await service.hasVisibleResources({ ...member, userId: 8 })).toBe(false);
  });

  it('uses the latest introduction grant, including revoke and same-time tie ordering', async () => {
    await addResource([{ id: 10, isHidden: true }]);
    await source.query('INSERT INTO resource_introduction VALUES (1, 10, 7)');
    await source.query("INSERT INTO resource_introduction_history_item VALUES (1, 1, 'grant', '2026-01-01')");
    expect(await service.hasVisibleResources(member)).toBe(true);
    await source.query("INSERT INTO resource_introduction_history_item VALUES (2, 1, 'revoke', '2026-01-01')");
    expect(await service.hasVisibleResources(member)).toBe(false);
    expect(await service.getMany(member)).toHaveLength(0);
  });

  it('executes one bounded existence query even with many groups', async () => {
    await source.query(`
      WITH RECURSIVE ids(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM ids WHERE id < 1100)
      INSERT INTO resource_group (id, isHidden) SELECT id, 0 FROM ids
    `);
    const query = jest.spyOn(source, 'query');
    const runnerQuery = jest.spyOn(source.driver, 'createQueryRunner');
    expect(await service.hasVisibleResources(member)).toBe(false);
    // No preliminary group materialization or group-sized bind list is needed.
    expect(query).not.toHaveBeenCalled();
    expect(runnerQuery).toHaveBeenCalledTimes(1);
  });

  it('derives visibility from the authenticated caller rather than request parameters', async () => {
    const controller = new ResourceGroupsController(service);
    const check = jest.spyOn(service, 'hasVisibleResources').mockResolvedValue(true);
    const request = {
      user: { id: 7, effectivePermissions: new Set(['resources.update']) },
    } as unknown as AuthenticatedRequest;
    expect(await controller.resourcesExist(request)).toEqual({ hasResources: true });
    expect(check).toHaveBeenCalledWith({ userId: 7, canUpdateResources: true });
    request.user.effectivePermissions = new Set();
    await controller.resourcesExist(request);
    expect(check).toHaveBeenLastCalledWith({ userId: 7, canUpdateResources: false });
  });
});
