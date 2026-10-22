import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceType,
} from '@attraccess/application-models';

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { MaintenanceSchedulePersistence } from './persistence/port';

import { AuditService } from '../../audit/audit.service';

import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';

import { CreateMaintenanceScheduleDto } from './dtos/create-maintenance-schedule.dto';

import { UpdateMaintenanceScheduleDto } from './dtos/update-maintenance-schedule.dto';

@Injectable()
export class MaintenanceScheduleService {
  constructor(
    protected readonly persistence: MaintenanceSchedulePersistence,
    protected readonly audit: AuditService,
    protected readonly evaluator: MaintenanceScheduleEvaluatorService,
  ) {}

  async findAllByResourceId(resourceId: number): Promise<ResourceMaintenanceSchedule[]> {
    await this.ensureResourceExists(resourceId);
    return this.persistence.schedules(resourceId);
  }

  async getOne(resourceId: number, scheduleId: number): Promise<ResourceMaintenanceSchedule> {
    const schedule = await this.persistence.schedule(resourceId, scheduleId);
    if (!schedule) {
      throw new NotFoundException('Maintenance schedule not found');
    }
    return schedule;
  }

  protected scheduleDetails(schedule: ResourceMaintenanceSchedule): Record<string, string | number> {
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

  protected async removeConfigsForSchedule(scheduleId: number): Promise<void> {
    await this.persistence.removeConfigurations(scheduleId);
  }

  protected async upsertConfigForSchedule(
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
          await this.persistence.createUsageHours(
            scheduleId,
            configs.usageHoursConfig.duration,
            configs.usageHoursConfig.unit,
          );
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT:
        if (configs.usageCountConfig) {
          await this.persistence.createUsageCount(scheduleId, configs.usageCountConfig.thresholdSessions);
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL:
        if (configs.timeIntervalConfig) {
          const { duration, unit } = configs.timeIntervalConfig;
          await this.persistence.createTimeInterval(scheduleId, duration, unit);
        }
        break;
    }
  }

  async create(
    resourceId: number,
    dto: CreateMaintenanceScheduleDto,
    actorId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ResourceMaintenanceSchedule> {
    const resource = await this.ensureResourceExists(resourceId);
    this.validateDurationBasis(resource, dto.durationBasis);

    const saved = await this.persistence.createSchedule({
      resourceId,
      name: dto.name ?? null,
      triggerType: dto.triggerType,
      durationBasis: dto.durationBasis ?? ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
      enabled: dto.enabled ?? true,
    });

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
    if (result.enabled) await this.evaluator.evaluateResource(resourceId);
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
    const durationBasis = dto.durationBasis ?? schedule.durationBasis;
    if (durationBasis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION) {
      this.validateDurationBasis(await this.ensureResourceExists(resourceId), durationBasis);
    }

    if (dto.name !== undefined) schedule.name = dto.name ?? null;
    if (dto.enabled !== undefined) schedule.enabled = dto.enabled;
    if (dto.durationBasis !== undefined) schedule.durationBasis = dto.durationBasis;
    const triggerType = dto.triggerType ?? schedule.triggerType;
    if (dto.triggerType !== undefined) schedule.triggerType = triggerType;

    await this.persistence.saveSchedule(schedule);

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
        usageCountConfig:
          dto.usageCountConfig ?? (schedule.usageCountConfig as { thresholdSessions: number } | undefined),
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
    if (result.enabled) await this.evaluator.evaluateResource(resourceId);
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
    await this.persistence.deleteAndDetachSchedule(schedule);
    await this.audit.recordResource({
      action: 'maintenance_schedule.deleted',
      actorId,
      authenticationMethod,
      apiTokenId,
      subjectId: resourceId,
      details,
    });
  }

  protected async ensureResourceExists(resourceId: number): Promise<Resource> {
    const resource = await this.persistence.resource(resourceId);
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }
    return resource;
  }

  protected validateDurationBasis(resource: Resource, basis?: ResourceMaintenanceScheduleDurationBasis): void {
    if (
      basis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION &&
      resource.type !== ResourceType.Machine
    ) {
      throw new BadRequestException('Operating duration is only supported for machine resources');
    }
  }
}
