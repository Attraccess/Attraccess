import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceMaintenanceSchedule,
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
import { AuditService } from '../../audit/audit.service';

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
    private readonly audit: AuditService,
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

  async create(
    resourceId: number,
    dto: CreateMaintenanceScheduleDto,
    actorId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ResourceMaintenanceSchedule> {
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

    const result = await this.getOne(resourceId, saved.id);
    await this.audit.recordResource({
      action: 'maintenance_schedule.created',
      actorId,
      authenticationMethod,
      apiTokenId,
      subjectId: resourceId,
      details: this.scheduleDetails(result),
    });
    return result;
  }

  async update(
    resourceId: number,
    scheduleId: number,
    dto: UpdateMaintenanceScheduleDto,
    actorId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
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
        usageHoursConfig:
          dto.usageHoursConfig ??
          (schedule.usageHoursConfig as { duration: number; unit: UsageDurationUnit } | undefined),
        usageCountConfig: dto.usageCountConfig ?? (schedule.usageCountConfig as { thresholdSessions: number } | undefined),
        timeIntervalConfig:
          dto.timeIntervalConfig ??
          (schedule.timeIntervalConfig as { duration: number; unit: UsageDurationUnit } | undefined),
      });
    }

    const result = await this.getOne(resourceId, scheduleId);
    await this.audit.recordResource({
      action: 'maintenance_schedule.updated',
      actorId,
      authenticationMethod,
      apiTokenId,
      subjectId: resourceId,
      details: this.scheduleDetails(result),
    });
    return result;
  }

  async delete(
    resourceId: number,
    scheduleId: number,
    actorId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    const schedule = await this.getOne(resourceId, scheduleId);
    const details = this.scheduleDetails(schedule);
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
    await this.audit.recordResource({
      action: 'maintenance_schedule.deleted',
      actorId,
      authenticationMethod,
      apiTokenId,
      subjectId: resourceId,
      details,
    });
  }

  private async ensureResourceExists(resourceId: number): Promise<void> {
    const exists = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!exists) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }
  }

  private scheduleDetails(schedule: ResourceMaintenanceSchedule): Record<string, string | number> {
    const details: Record<string, string | number> = {
      scheduleId: schedule.id,
      enabled: schedule.enabled ? 1 : 0,
      triggerType: schedule.triggerType,
    };
    if (schedule.name) details.name = schedule.name.slice(0, 512);
    if (schedule.usageHoursConfig) {
      details.usageDuration = schedule.usageHoursConfig.duration;
      details.usageUnit = schedule.usageHoursConfig.unit;
    }
    if (schedule.usageCountConfig) details.usageThreshold = schedule.usageCountConfig.thresholdSessions;
    if (schedule.timeIntervalConfig) {
      details.usageDuration = schedule.timeIntervalConfig.duration;
      details.usageUnit = schedule.timeIntervalConfig.unit;
    }
    return details;
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
