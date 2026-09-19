import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Resource,
  ResourceType,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
} from '@attraccess/database-entities';
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

  const scheduleRepository = {
    findOne: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };
  const maintenanceRepository = {
    update: jest.fn(),
  };
  const usageHoursConfigRepository = {
    delete: jest.fn(),
  };
  const usageCountConfigRepository = {
    delete: jest.fn(),
  };
  const timeIntervalConfigRepository = {
    delete: jest.fn(),
  };
  const resourceRepository = { findOne: jest.fn() };
  const evaluator = { evaluateResource: jest.fn().mockResolvedValue(undefined) };
  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();

    scheduleRepository.manager.transaction.mockImplementation(
      async (callback: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<void>) =>
        callback({
          getRepository: (entity) => {
            switch (entity) {
              case ResourceMaintenance:
                return maintenanceRepository;
              case ResourceMaintenanceScheduleUsageHoursConfig:
                return usageHoursConfigRepository;
              case ResourceMaintenanceScheduleUsageCountConfig:
                return usageCountConfigRepository;
              case ResourceMaintenanceScheduleTimeIntervalConfig:
                return timeIntervalConfigRepository;
              case ResourceMaintenanceSchedule:
                return { remove: jest.fn() };
            }
          },
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceScheduleService,
        { provide: MaintenanceScheduleEvaluatorService, useValue: evaluator },
        { provide: getRepositoryToken(ResourceMaintenanceSchedule), useValue: scheduleRepository },
        { provide: getRepositoryToken(ResourceMaintenance), useValue: maintenanceRepository },
        {
          provide: getRepositoryToken(ResourceMaintenanceScheduleUsageHoursConfig),
          useValue: usageHoursConfigRepository,
        },
        {
          provide: getRepositoryToken(ResourceMaintenanceScheduleUsageCountConfig),
          useValue: usageCountConfigRepository,
        },
        {
          provide: getRepositoryToken(ResourceMaintenanceScheduleTimeIntervalConfig),
          useValue: timeIntervalConfigRepository,
        },
        { provide: getRepositoryToken(Resource), useValue: resourceRepository },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(MaintenanceScheduleService);
  });

  it('detaches generated maintenances before deleting a schedule', async () => {
    const scheduleToDelete = { ...schedule } as ResourceMaintenanceSchedule;
    const transactionalScheduleRepository = {
      remove: jest.fn().mockImplementation((entity: ResourceMaintenanceSchedule) => {
        delete entity.id;
      }),
    };
    scheduleRepository.findOne.mockResolvedValue(scheduleToDelete);
    scheduleRepository.manager.transaction.mockImplementation(
      async (callback: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<void>) =>
        callback({
          getRepository: (entity) =>
            entity === ResourceMaintenance
              ? maintenanceRepository
              : entity === ResourceMaintenanceSchedule
                ? transactionalScheduleRepository
                : entity === ResourceMaintenanceScheduleUsageHoursConfig
                  ? usageHoursConfigRepository
                  : entity === ResourceMaintenanceScheduleUsageCountConfig
                    ? usageCountConfigRepository
                    : timeIntervalConfigRepository,
        }),
    );

    await service.delete(scheduleToDelete.resourceId, 10, 7);

    expect(maintenanceRepository.update).toHaveBeenCalledWith(
      { maintenanceSchedule: { id: 10 } },
      { maintenanceSchedule: null },
    );
    expect(usageHoursConfigRepository.delete).toHaveBeenCalledWith({ scheduleId: 10 });
    expect(usageCountConfigRepository.delete).toHaveBeenCalledWith({ scheduleId: 10 });
    expect(timeIntervalConfigRepository.delete).toHaveBeenCalledWith({ scheduleId: 10 });
    expect(transactionalScheduleRepository.remove).toHaveBeenCalledWith(scheduleToDelete);
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
    resourceRepository.findOne.mockResolvedValue({ id: 1 });
    scheduleRepository.create = jest.fn().mockReturnValue(created);
    scheduleRepository.save = jest.fn().mockResolvedValue(created);
    scheduleRepository.findOne.mockResolvedValue(created);
    usageCountConfigRepository.create = jest.fn().mockReturnValue({ scheduleId: 11, thresholdSessions: 12 });
    usageCountConfigRepository.save = jest.fn().mockResolvedValue(undefined);

    await service.create(
      1,
      { triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, usageCountConfig: { thresholdSessions: 12 } },
      7,
    );

    expect(usageCountConfigRepository.save).toHaveBeenCalledWith({ scheduleId: 11, thresholdSessions: 12 });
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
    scheduleRepository.findOne.mockResolvedValueOnce(schedule).mockResolvedValueOnce(updated);
    scheduleRepository.save = jest.fn().mockResolvedValue(updated);

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
    scheduleRepository.findOne.mockResolvedValueOnce(disabled).mockResolvedValueOnce(enabled);
    scheduleRepository.save = jest.fn().mockResolvedValue(enabled);

    await service.update(1, 10, { enabled: true }, 7);

    expect(evaluator.evaluateResource).toHaveBeenCalledWith(1);
    expect(maintenanceRepository.update).not.toHaveBeenCalled();
  });

  describe('operating duration resource validation', () => {
    const operatingBasis = ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION;

    it('rejects operating-duration schedules on doors before creating a schedule', async () => {
      resourceRepository.findOne.mockResolvedValue({ id: 1, type: ResourceType.Door });
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
      expect(scheduleRepository.save).not.toHaveBeenCalled();
      expect(evaluator.evaluateResource).not.toHaveBeenCalled();
    });

    it.each([
      {
        existingBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
        update: { durationBasis: operatingBasis },
      },
      { existingBasis: operatingBasis, update: { enabled: true } },
    ])('rejects an effective operating basis on a door when updating: $update', async ({ existingBasis, update }) => {
      resourceRepository.findOne.mockResolvedValue({ id: 1, type: ResourceType.Door });
      scheduleRepository.findOne.mockResolvedValue({ ...schedule, durationBasis: existingBasis });
      await expect(service.update(1, 10, update, 7)).rejects.toThrow(
        'Operating duration is only supported for machine resources',
      );
      expect(scheduleRepository.save).not.toHaveBeenCalled();
      expect(evaluator.evaluateResource).not.toHaveBeenCalled();
    });

    it('allows the operating basis for a machine', async () => {
      const machineSchedule = { ...schedule, durationBasis: operatingBasis };
      resourceRepository.findOne.mockResolvedValue({ id: 1, type: ResourceType.Machine });
      scheduleRepository.findOne.mockResolvedValue(machineSchedule);
      scheduleRepository.save = jest.fn().mockResolvedValue(machineSchedule);

      await expect(service.update(1, 10, { durationBasis: operatingBasis }, 7)).resolves.toEqual(machineSchedule);
      expect(scheduleRepository.save).toHaveBeenCalledWith(machineSchedule);
    });

    it('allows a door schedule to switch back to session duration', async () => {
      const doorSchedule = { ...schedule, durationBasis: operatingBasis };
      resourceRepository.findOne.mockResolvedValue({ id: 1, type: ResourceType.Door });
      scheduleRepository.findOne.mockResolvedValue(doorSchedule);
      scheduleRepository.save = jest.fn().mockResolvedValue(doorSchedule);

      await service.update(1, 10, { durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION }, 7);
      expect(scheduleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          durationBasis: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
        }),
      );
    });
  });
});
