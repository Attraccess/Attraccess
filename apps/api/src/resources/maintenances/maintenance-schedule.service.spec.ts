import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
} from '@attraccess/database-entities';
import { MaintenanceScheduleService } from './maintenance-schedule.service';
import { AuditService } from '../../audit/audit.service';

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
        { provide: getRepositoryToken(ResourceMaintenanceSchedule), useValue: scheduleRepository },
        { provide: getRepositoryToken(ResourceMaintenance), useValue: maintenanceRepository },
        { provide: getRepositoryToken(ResourceMaintenanceScheduleUsageHoursConfig), useValue: usageHoursConfigRepository },
        { provide: getRepositoryToken(ResourceMaintenanceScheduleUsageCountConfig), useValue: usageCountConfigRepository },
        { provide: getRepositoryToken(ResourceMaintenanceScheduleTimeIntervalConfig), useValue: timeIntervalConfigRepository },
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
    expect(audit.recordResource).toHaveBeenCalledWith(expect.objectContaining({
      action: 'maintenance_schedule.deleted',
      actorId: 7,
      subjectId: 1,
      details: expect.objectContaining({ scheduleId: 10, enabled: 1, usageThreshold: 12 }),
    }));
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
    expect(audit.recordResource).toHaveBeenCalledWith(expect.objectContaining({
      action: 'maintenance_schedule.created',
      actorId: 7,
      subjectId: 1,
      details: expect.objectContaining({ scheduleId: 11, enabled: 1, usageThreshold: 12 }),
    }));
  });

  it('records the intended state when updating a schedule', async () => {
    const updated = { ...schedule, enabled: false } as ResourceMaintenanceSchedule;
    scheduleRepository.findOne.mockResolvedValueOnce(schedule).mockResolvedValueOnce(updated);
    scheduleRepository.save = jest.fn().mockResolvedValue(updated);

    await service.update(1, 10, { enabled: false }, 7);

    expect(audit.recordResource).toHaveBeenCalledWith(expect.objectContaining({
      action: 'maintenance_schedule.updated',
      actorId: 7,
      subjectId: 1,
      details: expect.objectContaining({ scheduleId: 10, enabled: 0, usageThreshold: 12 }),
    }));
  });
});
