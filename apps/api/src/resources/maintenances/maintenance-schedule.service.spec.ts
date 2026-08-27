import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
} from '@attraccess/database-entities';
import { MaintenanceScheduleService } from './maintenance-schedule.service';

describe('MaintenanceScheduleService', () => {
  let service: MaintenanceScheduleService;
  const schedule = { id: 10, resourceId: 1 } as ResourceMaintenanceSchedule;

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
        { provide: getRepositoryToken(Resource), useValue: {} },
      ],
    }).compile();

    service = module.get(MaintenanceScheduleService);
  });

  it('detaches generated maintenances before deleting a schedule', async () => {
    const transactionalScheduleRepository = { remove: jest.fn() };
    scheduleRepository.findOne.mockResolvedValue(schedule);
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

    await service.delete(schedule.resourceId, schedule.id);

    expect(maintenanceRepository.update).toHaveBeenCalledWith(
      { maintenanceSchedule: { id: schedule.id } },
      { maintenanceSchedule: null },
    );
    expect(usageHoursConfigRepository.delete).toHaveBeenCalledWith({ scheduleId: schedule.id });
    expect(usageCountConfigRepository.delete).toHaveBeenCalledWith({ scheduleId: schedule.id });
    expect(timeIntervalConfigRepository.delete).toHaveBeenCalledWith({ scheduleId: schedule.id });
    expect(transactionalScheduleRepository.remove).toHaveBeenCalledWith(schedule);
  });
});
