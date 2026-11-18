import { DataSource } from 'typeorm';
import {
  entities,
  Resource,
  ResourceGroup,
  ResourceIntroducer,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  User,
} from '@attraccess/database-entities';
import {
  MaintenanceRequestStatus,
  ResourceIntroducerType,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  ResourceType,
  UsageDurationUnit,
} from '@attraccess/application-models';
import { TypeOrmResourceMaintenanceStore } from './maintenance-store.adapter';
import {
  TypeOrmMaintenanceNotificationStore,
  TypeOrmMaintenanceRequestStore,
} from './maintenance-request-store.adapter';
import { TypeOrmMaintenanceScheduleStore } from './maintenance-schedule-store.adapter';
import { TypeOrmResourceRecipientStore } from './resource-recipient-store.adapter';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';

describe('maintenance stores on real SQLite', () => {
  let source: DataSource;
  let maintenance: TypeOrmResourceMaintenanceStore;
  let requests: TypeOrmMaintenanceRequestStore;
  let notifications: TypeOrmMaintenanceNotificationStore;
  let schedules: TypeOrmMaintenanceScheduleStore;
  let audit: { record: jest.Mock };
  let resourceId: number;
  let userId: number;

  const newUser = (username: string) =>
    source.getRepository(User).save(source.getRepository(User).create({ username, email: `${username}@example.test` }));

  beforeEach(async () => {
    source = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: ':memory:',
      synchronize: true,
      entities: Object.values(entities),
    }).initialize();
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    maintenance = new TypeOrmResourceMaintenanceStore(source);
    requests = new TypeOrmMaintenanceRequestStore(source);
    notifications = new TypeOrmMaintenanceNotificationStore(source, new TypeOrmResourceRecipientStore(source));
    schedules = new TypeOrmMaintenanceScheduleStore(source, audit as never);
    resourceId = (
      await source
        .getRepository(Resource)
        .save(source.getRepository(Resource).create({ name: 'Laser', type: ResourceType.Machine }))
    ).id;
    userId = (await newUser('alice')).id;
  });

  afterEach(async () => {
    await source.destroy();
  });

  describe('maintenance records', () => {
    it('stores a manual maintenance and returns the audit user without secrets or the e-mail address', async () => {
      const created = await maintenance.createManual({
        resourceId,
        startTime: new Date('2030-01-01T10:00:00Z'),
        endTime: null,
        reason: 'Belt',
        createdByUserId: userId,
      });

      expect(created).toMatchObject({ resourceId, reason: 'Belt', endTime: null, completedAt: null });
      expect(created.createdByUser).toMatchObject({ id: userId, username: 'alice', deletedAt: null });
      expect(JSON.stringify(created)).not.toContain('example.test');
      expect(Object.keys(created.createdByUser ?? {}).sort()).toEqual(
        [
          'billingFactor',
          'createdAt',
          'creditBalance',
          'dateTimeLocale',
          'deletedAt',
          'externalIdentifier',
          'id',
          'isDisabled',
          'isEmailVerified',
          'locale',
          'updatedAt',
          'username',
        ].sort(),
      );
    });

    it('filters upcoming, active and past maintenances and pages them soonest first', async () => {
      const now = new Date('2030-06-01T00:00:00Z');
      const make = (startTime: string, endTime: string | null) =>
        maintenance.createManual({
          resourceId,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          reason: startTime,
        });
      await make('2030-07-01T00:00:00Z', null);
      await make('2030-05-01T00:00:00Z', null);
      await make('2030-04-01T00:00:00Z', '2030-04-02T00:00:00Z');

      const page = (flags: Partial<{ includeUpcoming: boolean; includeActive: boolean; includePast: boolean }>) =>
        maintenance.page(resourceId, {
          includeUpcoming: false,
          includeActive: false,
          includePast: false,
          ...flags,
          now,
          skip: 0,
          take: 10,
        });

      expect((await page({ includeUpcoming: true })).data.map((m) => m.reason)).toEqual(['2030-07-01T00:00:00Z']);
      expect((await page({ includeActive: true })).data.map((m) => m.reason)).toEqual(['2030-05-01T00:00:00Z']);
      expect((await page({ includePast: true })).data.map((m) => m.reason)).toEqual(['2030-04-01T00:00:00Z']);
      const all = await page({ includeUpcoming: true, includeActive: true, includePast: true });
      expect(all.total).toBe(3);
      expect(all.data.map((m) => m.reason)).toEqual([
        '2030-04-01T00:00:00Z',
        '2030-05-01T00:00:00Z',
        '2030-07-01T00:00:00Z',
      ]);
      expect(
        (
          await maintenance.page(resourceId, {
            includeUpcoming: true,
            includeActive: true,
            includePast: true,
            now,
            skip: 2,
            take: 1,
          })
        ).data,
      ).toHaveLength(1);
    });

    it('finishes a maintenance with the completing user and reports active maintenance', async () => {
      const created = await maintenance.createManual({
        resourceId,
        startTime: new Date('2020-01-01T00:00:00Z'),
        endTime: null,
        reason: null,
      });
      expect(await maintenance.hasActive({ resourceId }, new Date())).toBe(true);
      expect(await maintenance.activeResourceIds([resourceId, 999], new Date())).toEqual(new Set([resourceId]));

      const finished = await maintenance.markFinished(created.id, new Date('2021-01-01T00:00:00Z'), userId);

      expect(finished.endTime).toEqual(new Date('2021-01-01T00:00:00Z'));
      expect(finished.completedByUser?.username).toBe('alice');
      expect(await maintenance.hasActive({ resourceId }, new Date())).toBe(false);
    });

    it('creates scheduled maintenance inside the caller transaction and returns null for a missing resource', async () => {
      const scheduleId = await schedules.create({
        resourceId,
        name: null,
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
        enabled: true,
        configs: { timeIntervalConfig: { duration: 1, unit: UsageDurationUnit.DAYS } },
      });
      const rolledBack = source.transaction(async (manager) => {
        const created = await maintenance.createFromSchedule(
          { resourceId, scheduleId, reason: 'Due', startTime: new Date() },
          legacyEngineTransactionScope(manager),
        );
        expect(created?.reason).toBe('Due');
        expect(await maintenance.hasActive({ resourceId }, new Date(), legacyEngineTransactionScope(manager))).toBe(
          true,
        );
        throw new Error('roll back');
      });
      await expect(rolledBack).rejects.toThrow('roll back');
      expect(await maintenance.hasActive({ resourceId }, new Date())).toBe(false);
      expect(
        await maintenance.createFromSchedule({ resourceId: 999, scheduleId: 1, reason: 'x', startTime: new Date() }),
      ).toBeNull();
    });
  });

  describe('maintenance access', () => {
    it('finds direct and group introducer grants and tells a missing resource apart', async () => {
      const group = await source
        .getRepository(ResourceGroup)
        .save(source.getRepository(ResourceGroup).create({ name: 'Wood' }));
      const resource = await source
        .getRepository(Resource)
        .findOneOrFail({ where: { id: resourceId }, relations: { groups: true } });
      resource.groups = [group];
      await source.getRepository(Resource).save(resource);
      const direct = await newUser('direct');
      const viaGroup = await newUser('group');
      const stranger = await newUser('stranger');
      const introducers = source.getRepository(ResourceIntroducer);
      await introducers.save(
        introducers.create({ resourceId, userId: direct.id, type: ResourceIntroducerType.MAINTAINER }),
      );
      await introducers.save(
        introducers.create({ resourceGroupId: group.id, userId: viaGroup.id, type: ResourceIntroducerType.INTRODUCER }),
      );

      expect(await maintenance.lookupMaintenanceAccess(direct.id, resourceId)).toBe('direct');
      expect(await maintenance.lookupMaintenanceAccess(viaGroup.id, resourceId)).toBe('group');
      expect(await maintenance.lookupMaintenanceAccess(stranger.id, resourceId)).toBe('none');
      expect(await maintenance.lookupMaintenanceAccess(direct.id, 999)).toBe('resource-missing');
      expect(await maintenance.introducerManagedResourceIds(viaGroup.id, [resourceId, 999])).toEqual(
        new Set([resourceId]),
      );
      expect(await maintenance.introducerManagedResourceIds(stranger.id, [resourceId])).toEqual(new Set());
    });
  });

  describe('maintenance requests', () => {
    it('creates, pages and resolves a request with a resulting maintenance', async () => {
      const created = await requests.create(resourceId, userId, 'Grinding noise');
      expect(created).toMatchObject({ resourceId, reason: 'Grinding noise', status: MaintenanceRequestStatus.OPEN });
      expect(created.createdByUser?.username).toBe('alice');

      expect((await requests.page(resourceId, MaintenanceRequestStatus.OPEN, 0, 10)).total).toBe(1);

      const made = await maintenance.createManual({ resourceId, startTime: new Date(), endTime: null, reason: 'Fix' });
      const resolved = await requests.resolve(created.id, {
        status: MaintenanceRequestStatus.RESOLVED,
        resolvedByUserId: userId,
        resolvedAt: new Date('2030-01-01T00:00:00Z'),
        resultingMaintenanceId: made.id,
      });

      expect(resolved.status).toBe(MaintenanceRequestStatus.RESOLVED);
      expect(resolved.resolvedByUser?.username).toBe('alice');
      expect(resolved.resultingMaintenance?.id).toBe(made.id);
      expect((await requests.page(resourceId, MaintenanceRequestStatus.OPEN, 0, 10)).total).toBe(0);
      expect(await requests.findById(created.id)).toMatchObject({ status: MaintenanceRequestStatus.RESOLVED });
      expect(await requests.findById(999)).toBeNull();
      expect(await source.getRepository(ResourceMaintenanceRequest).count()).toBe(1);
    });
  });

  describe('notification lookups', () => {
    it('reads the request creator, the resource groups and the introducer users', async () => {
      const group = await source
        .getRepository(ResourceGroup)
        .save(source.getRepository(ResourceGroup).create({ name: 'Wood' }));
      const resource = await source
        .getRepository(Resource)
        .findOneOrFail({ where: { id: resourceId }, relations: { groups: true } });
      resource.groups = [group];
      await source.getRepository(Resource).save(resource);
      const introducer = await newUser('intro');
      const introducers = source.getRepository(ResourceIntroducer);
      await introducers.save(
        introducers.create({
          resourceGroupId: group.id,
          userId: introducer.id,
          type: ResourceIntroducerType.INTRODUCER,
        }),
      );
      const request = await requests.create(resourceId, userId, 'Noise');

      expect(await notifications.findRequest(request.id)).toEqual({
        id: request.id,
        reason: 'Noise',
        createdByUsername: 'alice',
      });
      expect(await notifications.findResource(resourceId)).toEqual({
        id: resourceId,
        name: 'Laser',
        groupIds: [group.id],
      });
      expect(await notifications.findResource(999)).toBeNull();
      expect(await notifications.findIntroducerUsers(resourceId, [group.id])).toEqual([
        { id: introducer.id, username: 'intro', email: 'intro@example.test', locale: 'en' },
      ]);
      expect(await notifications.findIntroducerUsers(resourceId, [])).toEqual([]);
      expect((await notifications.findUsersByIds([userId, introducer.id])).map((user) => user.id).sort()).toEqual(
        [userId, introducer.id].sort(),
      );
    });
  });

  describe('maintenance schedules', () => {
    const intervalSchedule = (id: number) => ({
      resourceId: id,
      name: 'Weekly',
      triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
      durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
      enabled: true,
      configs: { timeIntervalConfig: { duration: 7, unit: UsageDurationUnit.DAYS } },
    });

    it('stores a schedule with its matching config only and reads it back', async () => {
      const id = await schedules.create({
        ...intervalSchedule(resourceId),
        configs: {
          timeIntervalConfig: { duration: 7, unit: UsageDurationUnit.DAYS },
          usageCountConfig: { thresholdSessions: 5 },
        },
      });
      const found = await schedules.findOne(resourceId, id);

      expect(found).toMatchObject({ id, name: 'Weekly', enabled: true });
      expect(found?.timeIntervalConfig).toMatchObject({ duration: 7, unit: UsageDurationUnit.DAYS });
      expect(found?.usageCountConfig).toBeNull();
      expect(await schedules.findOne(999, id)).toBeNull();
      expect(await schedules.findResourceType(resourceId)).toEqual({ type: ResourceType.Machine });
      expect((await schedules.listForResource(resourceId)).map((schedule) => schedule.id)).toEqual([id]);
    });

    it('rolls the schedule back when its config cannot be stored', async () => {
      await expect(
        schedules.create({
          ...intervalSchedule(resourceId),
          configs: { timeIntervalConfig: { duration: 7, unit: undefined as never } },
        }),
      ).rejects.toThrow();
      expect(await schedules.listForResource(resourceId)).toEqual([]);
    });

    it('replaces the trigger configs together with the patch', async () => {
      const id = await schedules.create(intervalSchedule(resourceId));

      await schedules.update(
        id,
        { name: null, triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, enabled: false },
        {
          triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
          configs: {
            timeIntervalConfig: { duration: 7, unit: UsageDurationUnit.DAYS },
            usageCountConfig: { thresholdSessions: 9 },
          },
        },
      );

      const found = await schedules.findOne(resourceId, id);
      expect(found).toMatchObject({
        name: null,
        enabled: false,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
      });
      expect(found?.usageCountConfig).toMatchObject({ thresholdSessions: 9 });
      expect(found?.timeIntervalConfig).toBeNull();
    });

    it('deletes the schedule, its configs and the maintenance link together with the audit event', async () => {
      const id = await schedules.create(intervalSchedule(resourceId));
      await maintenance.createFromSchedule({ resourceId, scheduleId: id, reason: 'Due', startTime: new Date() });
      const event = { domain: 'resource', action: 'maintenance_schedule.deleted' } as never;

      await schedules.deleteWithAudit(id, event);

      expect(await schedules.findOne(resourceId, id)).toBeNull();
      expect(await source.getRepository(ResourceMaintenance).count()).toBe(1);
      expect(audit.record).toHaveBeenCalledWith(event, expect.anything());
    });

    it('keeps the schedule when the audit row cannot be written', async () => {
      const id = await schedules.create(intervalSchedule(resourceId));
      audit.record.mockRejectedValue(new Error('audit unavailable'));

      await expect(schedules.deleteWithAudit(id, {} as never)).rejects.toThrow('audit unavailable');

      expect(await schedules.findOne(resourceId, id)).not.toBeNull();
    });
  });
});
