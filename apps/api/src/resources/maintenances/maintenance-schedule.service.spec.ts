import { MaintenanceSchedulePersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ResourceType,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/application-models';
import { MaintenanceScheduleService } from './maintenance-schedule.service';
import { AuditService } from '../../audit/audit.service';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';

describe('MaintenanceScheduleService', () => {
  let service: MaintenanceScheduleService;
  const schedule = {
    id: 10,
    resourceId: 1,
    triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    enabled: true,
    usageCountConfig: { thresholdSessions: 12 },
  } as ResourceMaintenanceSchedule;

  let persistence: jest.Mocked<MaintenanceSchedulePersistence>;
  const evaluator = { evaluateResource: jest.fn().mockResolvedValue(undefined) };
  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();

    persistence = {
      resource: jest.fn(),
      schedules: jest.fn(),
      schedule: jest.fn(),
      createSchedule: jest.fn(),
      saveSchedule: jest.fn(),
      removeConfigurations: jest.fn(),
      createUsageHours: jest.fn(),
      createUsageCount: jest.fn(),
      createTimeInterval: jest.fn(),
      deleteAndDetachSchedule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceScheduleService,
        { provide: MaintenanceSchedulePersistence, useValue: persistence },
        { provide: MaintenanceScheduleEvaluatorService, useValue: evaluator },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(MaintenanceScheduleService);
  });

  it('detaches generated maintenances before deleting a schedule', async () => {
    const scheduleToDelete = { ...schedule } as ResourceMaintenanceSchedule;
    persistence.schedule.mockResolvedValue({ ...scheduleToDelete });
    persistence.deleteAndDetachSchedule.mockImplementation(async (record) => {
      delete record.id;
    });

    await service.delete(scheduleToDelete.resourceId, 10, 7);

    expect(persistence.deleteAndDetachSchedule).toHaveBeenCalledTimes(1);
    expect(scheduleToDelete.id).toBe(10);
    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maintenance_schedule.deleted',
        actorId: 7,
        subjectId: 1,
        details: expect.objectContaining({ scheduleId: 10, enabled: 1, usageThreshold: 12 }),
      }),
    );
  });

  it('records the intended state when creating a schedule', async () => {
    const created = { ...schedule, id: 11 } as ResourceMaintenanceSchedule;
    persistence.resource.mockResolvedValue({ id: 1 } as unknown as import('@attraccess/application-models').Resource);
    persistence.createSchedule.mockResolvedValue(created);
    persistence.schedule.mockResolvedValue(created);

    await service.create(
      1,
      { triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, usageCountConfig: { thresholdSessions: 12 } },
      7,
    );

    expect(persistence.createUsageCount).toHaveBeenCalledWith(11, 12);
    expect(evaluator.evaluateResource).toHaveBeenCalledWith(1);
    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maintenance_schedule.created',
        actorId: 7,
        subjectId: 1,
        details: expect.objectContaining({ scheduleId: 11, enabled: 1, usageThreshold: 12 }),
      }),
    );
  });

  it('records the intended state when updating a schedule', async () => {
    const updated = { ...schedule, enabled: false } as ResourceMaintenanceSchedule;
    persistence.schedule.mockResolvedValueOnce({ ...schedule }).mockResolvedValueOnce(updated);
    persistence.saveSchedule.mockResolvedValue(undefined);

    await service.update(1, 10, { enabled: false }, 7);

    expect(audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maintenance_schedule.updated',
        actorId: 7,
        subjectId: 1,
        details: expect.objectContaining({ scheduleId: 10, enabled: 0, usageThreshold: 12 }),
      }),
    );
  });
  it('reevaluates the unchanged service cycle when a schedule is reenabled', async () => {
    const disabled = { ...schedule, enabled: false } as ResourceMaintenanceSchedule;
    const enabled = { ...schedule, enabled: true } as ResourceMaintenanceSchedule;
    persistence.schedule.mockResolvedValueOnce(disabled).mockResolvedValueOnce(enabled);
    persistence.saveSchedule.mockResolvedValue(undefined);

    await service.update(1, 10, { enabled: true }, 7);

    expect(evaluator.evaluateResource).toHaveBeenCalledWith(1);
    expect(persistence.deleteAndDetachSchedule).not.toHaveBeenCalled();
  });

  describe('operating duration resource validation', () => {
    const operatingBasis = ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION;

    it('rejects operating-duration schedules on doors before creating a schedule', async () => {
      persistence.resource.mockResolvedValue({
        id: 1,
        type: ResourceType.Door,
      } as unknown as import('@attraccess/application-models').Resource);
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
      expect(persistence.saveSchedule).not.toHaveBeenCalled();
      expect(evaluator.evaluateResource).not.toHaveBeenCalled();
    });

    it.each([
      {
        existingBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
        update: { durationBasis: operatingBasis },
      },
      { existingBasis: operatingBasis, update: { enabled: true } },
    ])('rejects an effective operating basis on a door when updating: $update', async ({ existingBasis, update }) => {
      persistence.resource.mockResolvedValue({
        id: 1,
        type: ResourceType.Door,
      } as unknown as import('@attraccess/application-models').Resource);
      persistence.schedule.mockResolvedValue({ ...schedule, durationBasis: existingBasis });
      await expect(service.update(1, 10, update, 7)).rejects.toThrow(
        'Operating duration is only supported for machine resources',
      );
      expect(persistence.saveSchedule).not.toHaveBeenCalled();
      expect(evaluator.evaluateResource).not.toHaveBeenCalled();
    });

    it('allows the operating basis for a machine', async () => {
      const machineSchedule = { ...schedule, durationBasis: operatingBasis };
      persistence.resource.mockResolvedValue({
        id: 1,
        type: ResourceType.Machine,
      } as unknown as import('@attraccess/application-models').Resource);
      persistence.schedule.mockResolvedValue(machineSchedule);
      persistence.saveSchedule.mockResolvedValue(undefined);

      await expect(service.update(1, 10, { durationBasis: operatingBasis }, 7)).resolves.toEqual(machineSchedule);
      expect(persistence.saveSchedule).toHaveBeenCalledWith(machineSchedule);
    });

    it('allows a door schedule to switch back to session duration', async () => {
      const doorSchedule = { ...schedule, durationBasis: operatingBasis };
      persistence.resource.mockResolvedValue({
        id: 1,
        type: ResourceType.Door,
      } as unknown as import('@attraccess/application-models').Resource);
      persistence.schedule.mockResolvedValue(doorSchedule);
      persistence.saveSchedule.mockResolvedValue(undefined);

      await service.update(1, 10, { durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION }, 7);
      expect(persistence.saveSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
        }),
      );
    });
  });
});
