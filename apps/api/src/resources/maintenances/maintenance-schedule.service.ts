import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenance,
  Resource,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { CreateMaintenanceScheduleDto } from './dtos/create-maintenance-schedule.dto';
import { UpdateMaintenanceScheduleDto } from './dtos/update-maintenance-schedule.dto';

@Injectable()
export class MaintenanceScheduleService {
  constructor(
    @InjectRepository(ResourceMaintenanceSchedule)
    private readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>,
    @InjectRepository(ResourceMaintenanceScheduleUsageHoursConfig)
    private readonly usageHoursConfigRepository: Repository<ResourceMaintenanceScheduleUsageHoursConfig>,
    @InjectRepository(ResourceMaintenanceScheduleUsageCountConfig)
    private readonly usageCountConfigRepository: Repository<ResourceMaintenanceScheduleUsageCountConfig>,
    @InjectRepository(ResourceMaintenanceScheduleTimeIntervalConfig)
    private readonly timeIntervalConfigRepository: Repository<ResourceMaintenanceScheduleTimeIntervalConfig>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) { }

  async findAllByResourceId(resourceId: number): Promise<ResourceMaintenanceSchedule[]> {
    await this.ensureResourceExists(resourceId);
    return this.scheduleRepository.find({
      where: { resourceId },
      relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
      order: { id: 'ASC' },
    });
  }

  async getOne(resourceId: number, scheduleId: number): Promise<ResourceMaintenanceSchedule> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, resourceId },
      relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
    });
    if (!schedule) {
      throw new NotFoundException('Maintenance schedule not found');
    }
    return schedule;
  }

  async create(resourceId: number, dto: CreateMaintenanceScheduleDto): Promise<ResourceMaintenanceSchedule> {
    await this.ensureResourceExists(resourceId);

    const schedule = this.scheduleRepository.create({
      resourceId,
      name: dto.name ?? null,
      triggerType: dto.triggerType,
      durationBasis: dto.durationBasis ?? ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.scheduleRepository.save(schedule);

    await this.upsertConfigForSchedule(saved.id, dto.triggerType, {
      usageHoursConfig: dto.usageHoursConfig,
      usageCountConfig: dto.usageCountConfig,
      timeIntervalConfig: dto.timeIntervalConfig,
    });

    return this.getOne(resourceId, saved.id);
  }

  async update(
    resourceId: number,
    scheduleId: number,
    dto: UpdateMaintenanceScheduleDto,
  ): Promise<ResourceMaintenanceSchedule> {
    const schedule = await this.getOne(resourceId, scheduleId);

    if (dto.name !== undefined) schedule.name = dto.name ?? null;
    if (dto.enabled !== undefined) schedule.enabled = dto.enabled;
    if (dto.durationBasis !== undefined) schedule.durationBasis = dto.durationBasis;
    const triggerType = dto.triggerType ?? schedule.triggerType;
    if (dto.triggerType !== undefined) schedule.triggerType = triggerType;

    await this.scheduleRepository.save(schedule);

    if (
      dto.triggerType !== undefined ||
      dto.usageHoursConfig !== undefined ||
      dto.usageCountConfig !== undefined ||
      dto.timeIntervalConfig !== undefined
    ) {
      await this.removeConfigsForSchedule(scheduleId);
      await this.upsertConfigForSchedule(scheduleId, triggerType, {
        usageHoursConfig:
          dto.usageHoursConfig ??
          (schedule.usageHoursConfig as { duration: number; unit: UsageDurationUnit } | undefined),
        usageCountConfig: dto.usageCountConfig ?? (schedule.usageCountConfig as { thresholdSessions: number } | undefined),
        timeIntervalConfig:
          dto.timeIntervalConfig ??
          (schedule.timeIntervalConfig as { duration: number; unit: UsageDurationUnit } | undefined),
      });
    }

    return this.getOne(resourceId, scheduleId);
  }

  async delete(resourceId: number, scheduleId: number): Promise<void> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId, resourceId },
    });
    if (!schedule) {
      throw new NotFoundException('Maintenance schedule not found');
    }
    await this.scheduleRepository.manager.transaction(async (manager) => {
      await manager.getRepository(ResourceMaintenance).update(
        { maintenanceSchedule: { id: scheduleId } },
        { maintenanceSchedule: null },
      );
      await manager.getRepository(ResourceMaintenanceScheduleUsageHoursConfig).delete({ scheduleId });
      await manager.getRepository(ResourceMaintenanceScheduleUsageCountConfig).delete({ scheduleId });
      await manager.getRepository(ResourceMaintenanceScheduleTimeIntervalConfig).delete({ scheduleId });
      await manager.getRepository(ResourceMaintenanceSchedule).remove(schedule);
    });
  }

  private async ensureResourceExists(resourceId: number): Promise<void> {
    const exists = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!exists) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }
  }

  private async removeConfigsForSchedule(scheduleId: number): Promise<void> {
    await this.usageHoursConfigRepository.delete({ scheduleId });
    await this.usageCountConfigRepository.delete({ scheduleId });
    await this.timeIntervalConfigRepository.delete({ scheduleId });
  }

  private async upsertConfigForSchedule(
    scheduleId: number,
    triggerType: ResourceMaintenanceScheduleTriggerType,
    configs: {
      usageHoursConfig?: { duration: number; unit: UsageDurationUnit };
      usageCountConfig?: { thresholdSessions: number };
      timeIntervalConfig?: { duration: number; unit: UsageDurationUnit };
    },
  ): Promise<void> {
    switch (triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS:
        if (configs.usageHoursConfig) {
          await this.usageHoursConfigRepository.save(
            this.usageHoursConfigRepository.create({
              scheduleId,
              duration: configs.usageHoursConfig.duration,
              unit: configs.usageHoursConfig.unit,
            }),
          );
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT:
        if (configs.usageCountConfig) {
          await this.usageCountConfigRepository.save(
            this.usageCountConfigRepository.create({
              scheduleId,
              thresholdSessions: configs.usageCountConfig.thresholdSessions,
            }),
          );
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL:
        if (configs.timeIntervalConfig) {
          const { duration, unit } = configs.timeIntervalConfig;
          await this.timeIntervalConfigRepository.save(
            this.timeIntervalConfigRepository.create({
              scheduleId,
              duration,
              unit,
            }),
          );
        }
        break;
    }
  }
}
