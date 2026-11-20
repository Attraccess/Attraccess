import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MaintenanceScheduleRecord,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  ResourceType,
  UsageDurationUnit,
} from '@attraccess/application-models';
import { MaintenanceScheduleService } from './maintenance-schedule.service';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { MAINTENANCE_SCHEDULE_STORE, type MaintenanceScheduleStore } from './maintenance-schedule-store.port';

describe('MaintenanceScheduleService', () => {
  let service: MaintenanceScheduleService;
  const schedule: MaintenanceScheduleRecord = {
    id: 10,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    resourceId: 1,
    name: null,
    triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
    enabled: true,
    usageCountConfig: { id: 3, scheduleId: 10, thresholdSessions: 12 },
  };

  const store: { [K in keyof MaintenanceScheduleStore]: jest.Mock } = {
    findResourceType: jest.fn(),
    listForResource: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteWithAudit: jest.fn(),
  };
  const evaluator = { evaluateResource: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.resetAllMocks();
    evaluator.evaluateResource.mockResolvedValue(undefined);
    audit.record.mockResolvedValue(undefined);
    store.findResourceType.mockResolvedValue({ type: ResourceType.Machine });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceScheduleService,
        { provide: MaintenanceScheduleEvaluatorService, useValue: evaluator },
        { provide: MAINTENANCE_SCHEDULE_STORE, useValue: store },
        { provide: AUDIT_RECORDER, useValue: audit },
      ],
    }).compile();

    service = module.get(MaintenanceScheduleService);
  });

  it('hands the schedule deletion and its audit event to the store as one operation', async () => {
    store.findOne.mockResolvedValue(schedule);

    await service.delete(schedule.resourceId, 10, 7);

    // The store writes the audit row in the transaction of the delete, so the row rolls back with it.
    expect(store.deleteWithAudit).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        domain: 'resource',
        action: 'maintenance_schedule.deleted',
        actor: expect.objectContaining({ id: 7 }),
        subject: expect.objectContaining({ id: 1 }),
        details: expect.objectContaining({ scheduleId: 10, enabled: 1, usageThreshold: 12 }),
      }),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not delete a schedule of another resource', async () => {
    store.findOne.mockResolvedValue(null);
    await expect(service.delete(2, 10, 7)).rejects.toThrow('Maintenance schedule not found');
    expect(store.deleteWithAudit).not.toHaveBeenCalled();
  });

  it('records the intended state when creating a schedule', async () => {
    store.create.mockResolvedValue(11);
    store.findOne.mockResolvedValue({ ...schedule, id: 11 });

    await service.create(
      1,
      { triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, usageCountConfig: { thresholdSessions: 12 } },
      7,
    );

    expect(store.create).toHaveBeenCalledWith({
      resourceId: 1,
      name: null,
      triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
      durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
      enabled: true,
      configs: {
        usageHoursConfig: undefined,
        usageCountConfig: { thresholdSessions: 12 },
        timeIntervalConfig: undefined,
      },
    });
    expect(evaluator.evaluateResource).toHaveBeenCalledWith(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'maintenance_schedule.created',
        actor: expect.objectContaining({ id: 7 }),
        subject: expect.objectContaining({ id: 1 }),
        details: expect.objectContaining({ scheduleId: 11, enabled: 1, usageThreshold: 12 }),
      }),
    );
  });

  it('records the intended state when updating a schedule', async () => {
    const updated = { ...schedule, enabled: false };
    store.findOne.mockResolvedValueOnce(schedule).mockResolvedValueOnce(updated);

    await service.update(1, 10, { enabled: false }, 7);

    expect(store.update).toHaveBeenCalledWith(10, { enabled: false }, undefined);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'maintenance_schedule.updated',
        actor: expect.objectContaining({ id: 7 }),
        subject: expect.objectContaining({ id: 1 }),
        details: expect.objectContaining({ scheduleId: 10, enabled: 0, usageThreshold: 12 }),
      }),
    );
    expect(evaluator.evaluateResource).not.toHaveBeenCalled();
  });

  it('replaces the trigger configs and keeps the stored ones the request does not mention', async () => {
    store.findOne.mockResolvedValue({
      ...schedule,
      usageHoursConfig: { id: 1, scheduleId: 10, duration: 5, unit: UsageDurationUnit.HOURS },
    });

    await service.update(1, 10, { timeIntervalConfig: { duration: 2, unit: UsageDurationUnit.DAYS } }, 7);

    expect(store.update).toHaveBeenCalledWith(
      10,
      {},
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
        configs: {
          usageHoursConfig: { duration: 5, unit: UsageDurationUnit.HOURS },
          usageCountConfig: { thresholdSessions: 12 },
          timeIntervalConfig: { duration: 2, unit: UsageDurationUnit.DAYS },
        },
      },
    );
  });

  it('reevaluates the unchanged service cycle when a schedule is reenabled', async () => {
    store.findOne
      .mockResolvedValueOnce({ ...schedule, enabled: false })
      .mockResolvedValueOnce({ ...schedule, enabled: true });

    await service.update(1, 10, { enabled: true }, 7);

    expect(evaluator.evaluateResource).toHaveBeenCalledWith(1);
    expect(store.update).toHaveBeenCalledWith(10, { enabled: true }, undefined);
  });

  describe('operating duration resource validation', () => {
    const operatingBasis = ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION;

    it('rejects operating-duration schedules on doors before creating a schedule', async () => {
      store.findResourceType.mockResolvedValue({ type: ResourceType.Door });
      await expect(
        service.create(
          1,
          {
            triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
            durationBasis: operatingBasis,
          },
          7,
        ),
      ).rejects.toThrow('Operating duration is only supported for machine resources');
      expect(store.create).not.toHaveBeenCalled();
      expect(evaluator.evaluateResource).not.toHaveBeenCalled();
    });

    it.each([
      {
        existingBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
        update: { durationBasis: operatingBasis },
      },
      { existingBasis: operatingBasis, update: { enabled: true } },
    ])('rejects an effective operating basis on a door when updating: $update', async ({ existingBasis, update }) => {
      store.findResourceType.mockResolvedValue({ type: ResourceType.Door });
      store.findOne.mockResolvedValue({ ...schedule, durationBasis: existingBasis });
      await expect(service.update(1, 10, update, 7)).rejects.toThrow(
        'Operating duration is only supported for machine resources',
      );
      expect(store.update).not.toHaveBeenCalled();
      expect(evaluator.evaluateResource).not.toHaveBeenCalled();
    });

    it('allows the operating basis for a machine', async () => {
      const machineSchedule = { ...schedule, durationBasis: operatingBasis };
      store.findOne.mockResolvedValue(machineSchedule);

      await expect(service.update(1, 10, { durationBasis: operatingBasis }, 7)).resolves.toEqual(machineSchedule);
      expect(store.update).toHaveBeenCalledWith(10, { durationBasis: operatingBasis }, undefined);
    });

    it('allows a door schedule to switch back to session duration', async () => {
      store.findResourceType.mockResolvedValue({ type: ResourceType.Door });
      store.findOne.mockResolvedValue({ ...schedule, durationBasis: operatingBasis });

      await service.update(1, 10, { durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION }, 7);
      expect(store.update).toHaveBeenCalledWith(
        10,
        { durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION },
        undefined,
      );
    });
  });
});
