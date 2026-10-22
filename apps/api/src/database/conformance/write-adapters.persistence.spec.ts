import {
  entities,
  User,
  Resource,
  ResourceType,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
  ResourceOperatingInterval,
  UserRole,
  Role,
  Permission,
  RolePermission,
  UserRoleSource,
  AuthenticationDetail,
  Session,
  ResourceUsage,
} from '@attraccess/database-entities';
import { DataSource, QueryFailedError } from 'typeorm';
import { TypeormMaintenanceSchedulePersistence } from '../../resources/maintenances/persistence/typeorm-adapter';
import { TypeormFlowWriteOperations } from '../../resources/flows/persistence/typeorm-adapter';
import { TypeormOperatingIntervalOperations } from '../../resources/operating-intervals/persistence/typeorm-adapter';
import { OpenOperatingIntervalConflictError } from '../../resources/operating-intervals/persistence/port';
import { TypeormUserPersistence } from '../../users-and-auth/users/persistence/typeorm-adapter';
import { TypeormRbacPersistence } from '../../users-and-auth/rbac/persistence/typeorm-adapter';
import { RoleGrantConflictError } from '../../users-and-auth/rbac/persistence/port';

// Driver failures and transaction boundaries are adapter contracts, not application policy.
describe('SQLite write adapters', () => {
  let source: DataSource;
  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    await source.getRepository(User).save({ id: 1, username: 'user', email: 'user@example.test' });
    await source
      .getRepository(Resource)
      .save([1, 2].map((id) => ({ id, name: `Machine ${id}`, type: ResourceType.Machine })));
  });
  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('detaches maintenance history and deletes all schedule configurations atomically', async () => {
    const schedules = source.getRepository(ResourceMaintenanceSchedule);
    const schedule = await schedules.save({
      resourceId: 1,
      name: 'Inspect',
      triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    });
    const port = new TypeormMaintenanceSchedulePersistence(
      schedules,
      source.getRepository(ResourceMaintenanceScheduleUsageHoursConfig),
      source.getRepository(ResourceMaintenanceScheduleUsageCountConfig),
      source.getRepository(ResourceMaintenanceScheduleTimeIntervalConfig),
      source.getRepository(Resource),
    );
    await port.createUsageHours(schedule.id, 2, UsageDurationUnit.HOURS);
    await port.createUsageCount(schedule.id, 3);
    await port.createTimeInterval(schedule.id, 4, UsageDurationUnit.HOURS);
    const maintenance = await source.getRepository(ResourceMaintenance).save({
      resourceId: 1,
      name: 'Generated task',
      startTime: new Date(),
      createdByUser: { id: 1 },
      maintenanceSchedule: schedule,
    });
    const table = source.getMetadata(ResourceMaintenanceSchedule).tableName;
    await source.query(
      `CREATE TRIGGER reject_schedule BEFORE DELETE ON "${table}" BEGIN SELECT RAISE(ABORT, 'cannot delete'); END`,
    );
    await expect(port.deleteAndDetachSchedule({ ...schedule })).rejects.toThrow('cannot delete');
    expect(await port.schedule(1, schedule.id)).toMatchObject({
      usageHoursConfig: { duration: 2 },
      usageCountConfig: { thresholdSessions: 3 },
      timeIntervalConfig: { duration: 4 },
    });
    expect(
      await source
        .getRepository(ResourceMaintenance)
        .findOne({ where: { id: maintenance.id }, relations: ['maintenanceSchedule'] }),
    ).toMatchObject({ maintenanceSchedule: { id: schedule.id } });
    await source.query('DROP TRIGGER reject_schedule');
    const scheduleId = schedule.id;
    await port.deleteAndDetachSchedule(schedule);
    expect(await port.schedule(1, scheduleId)).toBeNull();
    for (const entity of [
      ResourceMaintenanceScheduleUsageHoursConfig,
      ResourceMaintenanceScheduleUsageCountConfig,
      ResourceMaintenanceScheduleTimeIntervalConfig,
    ])
      expect(await source.getRepository(entity).count()).toBe(0);
    expect(
      await source
        .getRepository(ResourceMaintenance)
        .findOne({ where: { id: maintenance.id }, relations: ['maintenanceSchedule'] }),
    ).toMatchObject({ maintenanceSchedule: null });
  });

  it('replaces a graph within its resource and rolls back deleted nodes when insertion fails', async () => {
    const resource = await source.getRepository(Resource).findOneByOrFail({ id: 1 });
    const node = (id: string, resourceId: number) => ({
      id,
      resourceId,
      type: ResourceFlowNodeType.INPUT_BUTTON,
      position: { x: 2, y: 3 },
      data: {},
    });
    await source.getRepository(ResourceFlowNode).save([node('old', 1), node('other', 2)]);
    const replace = (id: string) =>
      source.transaction((manager) =>
        new TypeormFlowWriteOperations(manager).replaceGraph(resource, [node(id, 1)], []),
      );
    await replace('new');
    expect((await source.getRepository(ResourceFlowNode).find()).map((row) => row.id).sort()).toEqual(['new', 'other']);
    const table = source.getMetadata(ResourceFlowNode).tableName;
    await source.query(
      `CREATE TRIGGER reject_node BEFORE INSERT ON "${table}" WHEN NEW.id = 'invalid' BEGIN SELECT RAISE(ABORT, 'invalid node'); END`,
    );
    await expect(replace('invalid')).rejects.toThrow('invalid node');
    expect((await source.getRepository(ResourceFlowNode).find()).map((row) => row.id).sort()).toEqual(['new', 'other']);
    expect(await source.getRepository(ResourceFlowEdge).count()).toBe(0);
  });

  it.each([
    ['23505', 'duplicate key', true],
    ['SQLITE_CONSTRAINT', 'UNIQUE constraint failed: interval.resourceId', true],
    ['SQLITE_CONSTRAINT', 'FOREIGN KEY constraint failed', false],
    ['other', 'storage unavailable', false],
  ])('classifies operating interval driver error %s (%s)', async (code, message, conflict) => {
    const error = new QueryFailedError('INSERT', [], Object.assign(new Error(message), { code }));
    const repository = source.getRepository(ResourceOperatingInterval);
    jest.spyOn(repository, 'save').mockRejectedValueOnce(error);
    const port = new TypeormOperatingIntervalOperations(source.manager);
    const result = port.createInterval({
      resourceId: 1,
      startTime: new Date(),
      endTime: null,
      startFlowNodeId: null,
      startFlowRunId: null,
      endFlowNodeId: null,
      endFlowRunId: null,
    });
    if (conflict) await expect(result).rejects.toBeInstanceOf(OpenOperatingIntervalConflictError);
    else await expect(result).rejects.toBe(error);
  });

  it.each(['23505', 'SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_UNIQUE', 'ER_DUP_ENTRY', 1062])(
    'recognizes account unique-write code %s',
    (code) => {
      const port = new TypeormUserPersistence(
        source.getRepository(User),
        source.getRepository(AuthenticationDetail),
        source.getRepository(Session),
        source.getRepository(ResourceUsage),
      );
      expect(
        port.isWriteConflict(new QueryFailedError('INSERT', [], Object.assign(new Error('duplicate'), { code }))),
      ).toBe(true);
      expect(port.isWriteConflict(new Error('duplicate'))).toBe(false);
      expect(
        port.isWriteConflict(
          new QueryFailedError('INSERT', [], Object.assign(new Error('storage unavailable'), { code: 'other' })),
        ),
      ).toBe(false);
    },
  );

  it.each([
    ['23505', 'duplicate key', true],
    ['SQLITE_CONSTRAINT', 'UNIQUE constraint failed: user_role.id', true],
    ['SQLITE_CONSTRAINT', 'FOREIGN KEY constraint failed', false],
  ])('classifies role grant driver error %s (%s)', async (code, message, conflict) => {
    const error = new QueryFailedError('INSERT', [], Object.assign(new Error(message), { code }));
    const rows = source.getRepository(UserRole);
    jest.spyOn(rows, 'save').mockRejectedValueOnce(error);
    const port = new TypeormRbacPersistence(
      rows,
      source.getRepository(Role),
      source.getRepository(Permission),
      source.getRepository(User),
      source.getRepository(RolePermission),
    );
    const result = port.createGrant({
      userId: 1,
      roleId: 1,
      source: UserRoleSource.MANUAL,
      ssoProviderType: null,
      ssoProviderId: null,
      externalValue: null,
    });
    if (conflict) await expect(result).rejects.toBeInstanceOf(RoleGrantConflictError);
    else await expect(result).rejects.toBe(error);
  });
});
