import {
  type MaintenanceScheduleRecord,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceType,
} from '@attraccess/application-models';

import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';

import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';

import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';

import { CreateMaintenanceScheduleDto } from './dtos/create-maintenance-schedule.dto';

import { UpdateMaintenanceScheduleDto } from './dtos/update-maintenance-schedule.dto';
import type { AuthenticationMethod } from '@attraccess/application-models';

import {
  MAINTENANCE_SCHEDULE_STORE,
  type MaintenanceScheduleConfigs,
  type MaintenanceScheduleStore,
} from './maintenance-schedule-store.port';

@Injectable()
export class MaintenanceScheduleService {
  constructor(
    @Inject(MAINTENANCE_SCHEDULE_STORE)
    protected readonly store: MaintenanceScheduleStore,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
    protected readonly evaluator: MaintenanceScheduleEvaluatorService,
  ) {}

  async findAllByResourceId(resourceId: number): Promise<MaintenanceScheduleRecord[]> {
    await this.ensureResourceExists(resourceId);
    return this.store.listForResource(resourceId);
  }

  async getOne(resourceId: number, scheduleId: number): Promise<MaintenanceScheduleRecord> {
    const schedule = await this.store.findOne(resourceId, scheduleId);
    if (!schedule) {
      throw new NotFoundException('Maintenance schedule not found');
    }
    return schedule;
  }

  protected scheduleDetails(schedule: MaintenanceScheduleRecord): Record<string, string | number> {
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

  async create(
    resourceId: number,
    dto: CreateMaintenanceScheduleDto,
    actorId: number,
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<MaintenanceScheduleRecord> {
    const resource = await this.ensureResourceExists(resourceId);
    this.validateDurationBasis(resource, dto.durationBasis);

    const scheduleId = await this.store.create({
      resourceId,
      name: dto.name ?? null,
      triggerType: dto.triggerType,
      durationBasis: dto.durationBasis ?? ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
      enabled: dto.enabled ?? true,
      configs: {
        usageHoursConfig: dto.usageHoursConfig,
        usageCountConfig: dto.usageCountConfig,
        timeIntervalConfig: dto.timeIntervalConfig,
      },
    });

    const result = await this.getOne(resourceId, scheduleId);
    await this.audit.record({
      domain: 'resource',
      action: 'maintenance_schedule.created',
      actor: { id: actorId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'resource', id: resourceId },
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
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<MaintenanceScheduleRecord> {
    const schedule = await this.getOne(resourceId, scheduleId);
    const durationBasis = dto.durationBasis ?? schedule.durationBasis;
    if (durationBasis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION) {
      this.validateDurationBasis(await this.ensureResourceExists(resourceId), durationBasis);
    }

    const triggerType = dto.triggerType ?? schedule.triggerType;
    const configsChanged =
      dto.triggerType !== undefined ||
      dto.usageHoursConfig !== undefined ||
      dto.usageCountConfig !== undefined ||
      dto.timeIntervalConfig !== undefined;

    await this.store.update(
      scheduleId,
      {
        ...(dto.name !== undefined && { name: dto.name ?? null }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.durationBasis !== undefined && { durationBasis: dto.durationBasis }),
        ...(dto.triggerType !== undefined && { triggerType }),
      },
      configsChanged ? { triggerType, configs: this.mergedConfigs(dto, schedule) } : undefined,
    );

    const result = await this.getOne(resourceId, scheduleId);
    await this.audit.record({
      domain: 'resource',
      action: 'maintenance_schedule.updated',
      actor: { id: actorId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'resource', id: resourceId },
      details: this.scheduleDetails(result),
    });
    if (result.enabled) await this.evaluator.evaluateResource(resourceId);
    return result;
  }

  /** The request's configs win; the stored ones stay for the trigger types the request does not mention. */
  protected mergedConfigs(
    dto: UpdateMaintenanceScheduleDto,
    schedule: MaintenanceScheduleRecord,
  ): MaintenanceScheduleConfigs {
    const hours = schedule.usageHoursConfig;
    const count = schedule.usageCountConfig;
    const interval = schedule.timeIntervalConfig;
    return {
      usageHoursConfig: dto.usageHoursConfig ?? (hours ? { duration: hours.duration, unit: hours.unit } : undefined),
      usageCountConfig: dto.usageCountConfig ?? (count ? { thresholdSessions: count.thresholdSessions } : undefined),
      timeIntervalConfig:
        dto.timeIntervalConfig ?? (interval ? { duration: interval.duration, unit: interval.unit } : undefined),
    };
  }

  async delete(
    resourceId: number,
    scheduleId: number,
    actorId: number,
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    const schedule = await this.getOne(resourceId, scheduleId);
    await this.store.deleteWithAudit(scheduleId, {
      domain: 'resource',
      action: 'maintenance_schedule.deleted',
      actor: { id: actorId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'resource', id: resourceId },
      details: this.scheduleDetails(schedule),
    });
  }

  protected async ensureResourceExists(resourceId: number): Promise<{ type: ResourceType }> {
    const resource = await this.store.findResourceType(resourceId);
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }
    return resource;
  }

  protected validateDurationBasis(
    resource: { type: ResourceType },
    basis?: ResourceMaintenanceScheduleDurationBasis,
  ): void {
    if (
      basis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION &&
      resource.type !== ResourceType.Machine
    ) {
      throw new BadRequestException('Operating duration is only supported for machine resources');
    }
  }
}
