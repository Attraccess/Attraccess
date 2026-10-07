import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceType,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateMaintenanceScheduleDto } from './dtos/create-maintenance-schedule.dto';
import { UpdateMaintenanceScheduleDto } from './dtos/update-maintenance-schedule.dto';
import { MaintenanceScheduleServiceRouteContext } from './maintenance-schedule.service.route-context';
export abstract class MaintenanceScheduleWritingImplementation extends MaintenanceScheduleServiceRouteContext {
  async create(
    resourceId: number,
    dto: CreateMaintenanceScheduleDto,
    actorId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ResourceMaintenanceSchedule> {
    const resource = await this.ensureResourceExists(resourceId);
    this.validateDurationBasis(resource, dto.durationBasis);

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
    await this.scheduleRepository.manager.transaction(async (manager) => {
      await manager
        .getRepository(ResourceMaintenance)
        .update({ maintenanceSchedule: { id: scheduleId } }, { maintenanceSchedule: null });
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

  protected async ensureResourceExists(resourceId: number): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
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
