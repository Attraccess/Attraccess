import {
  Resource,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
} from '@attraccess/database-entities';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MaintenanceScheduleConfigImplementation } from './maintenance-schedule-config';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';

@Injectable()
export class MaintenanceScheduleService extends MaintenanceScheduleConfigImplementation {
  constructor(
    @InjectRepository(ResourceMaintenanceSchedule)
    protected readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>,
    @InjectRepository(ResourceMaintenanceScheduleUsageHoursConfig)
    protected readonly usageHoursConfigRepository: Repository<ResourceMaintenanceScheduleUsageHoursConfig>,
    @InjectRepository(ResourceMaintenanceScheduleUsageCountConfig)
    protected readonly usageCountConfigRepository: Repository<ResourceMaintenanceScheduleUsageCountConfig>,
    @InjectRepository(ResourceMaintenanceScheduleTimeIntervalConfig)
    protected readonly timeIntervalConfigRepository: Repository<ResourceMaintenanceScheduleTimeIntervalConfig>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    protected readonly audit: AuditService,
    protected readonly evaluator: MaintenanceScheduleEvaluatorService,
  ) {
    super();
  }

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
}
