import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  Resource,
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
        usageHoursConfig: dto.usageHoursConfig ?? (schedule.usageHoursConfig as { thresholdMinutes: number } | undefined),
        usageCountConfig: dto.usageCountConfig ?? (schedule.usageCountConfig as { thresholdSessions: number } | undefined),
        timeIntervalConfig:
          dto.timeIntervalConfig ??
          (schedule.timeIntervalConfig as { intervalDays?: number; thresholdHours?: number } | undefined),
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
    await this.scheduleRepository.remove(schedule);
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
      usageHoursConfig?: { thresholdMinutes: number };
      usageCountConfig?: { thresholdSessions: number };
      timeIntervalConfig?: { intervalDays?: number; thresholdHours?: number };
    },
  ): Promise<void> {
    switch (triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS:
        if (configs.usageHoursConfig) {
          await this.usageHoursConfigRepository.save(
            this.usageHoursConfigRepository.create({
              scheduleId,
              thresholdMinutes: configs.usageHoursConfig.thresholdMinutes,
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
          const { intervalDays, thresholdHours } = configs.timeIntervalConfig;
          await this.timeIntervalConfigRepository.save(
            this.timeIntervalConfigRepository.create({
              scheduleId,
              intervalDays: intervalDays ?? null,
              thresholdHours: thresholdHours ?? null,
            }),
          );
        }
        break;
    }
  }
}
