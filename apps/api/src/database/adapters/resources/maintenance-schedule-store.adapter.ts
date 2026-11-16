import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
} from '@attraccess/database-entities';
import {
  ResourceMaintenanceScheduleTriggerType,
  type MaintenanceScheduleRecord,
  type ResourceType,
} from '@attraccess/application-models';
import { AUDIT_RECORDER, type AuditEvent, type AuditRecorder } from '../../../audit/recorder/audit-event';
import type {
  MaintenanceScheduleConfigs,
  MaintenanceSchedulePatch,
  MaintenanceScheduleStore,
  NewMaintenanceSchedule,
} from '../../../resources/maintenances/maintenance-schedule-store.port';
import { toMaintenanceScheduleRecord } from './maintenance-mappers';

const CONFIG_RELATIONS = ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'];

@Injectable()
export class TypeOrmMaintenanceScheduleStore implements MaintenanceScheduleStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async findResourceType(resourceId: number): Promise<{ type: ResourceType } | null> {
    const resource = await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } });
    return resource ? { type: resource.type } : null;
  }

  async listForResource(resourceId: number): Promise<MaintenanceScheduleRecord[]> {
    const rows = await this.dataSource.getRepository(ResourceMaintenanceSchedule).find({
      where: { resourceId },
      relations: CONFIG_RELATIONS,
      order: { id: 'ASC' },
    });
    return rows.map(toMaintenanceScheduleRecord);
  }

  async findOne(resourceId: number, scheduleId: number): Promise<MaintenanceScheduleRecord | null> {
    const entity = await this.dataSource
      .getRepository(ResourceMaintenanceSchedule)
      .findOne({ where: { id: scheduleId, resourceId }, relations: CONFIG_RELATIONS });
    return entity ? toMaintenanceScheduleRecord(entity) : null;
  }

  async create(schedule: NewMaintenanceSchedule): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ResourceMaintenanceSchedule);
      const saved = await repository.save(
        repository.create({
          resourceId: schedule.resourceId,
          name: schedule.name,
          triggerType: schedule.triggerType,
          durationBasis: schedule.durationBasis,
          enabled: schedule.enabled,
        }),
      );
      await this.storeConfig(manager, saved.id, schedule.triggerType, schedule.configs);
      return saved.id;
    });
  }

  async update(
    scheduleId: number,
    patch: MaintenanceSchedulePatch,
    replaceConfigs?: { triggerType: ResourceMaintenanceScheduleTriggerType; configs: MaintenanceScheduleConfigs },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ResourceMaintenanceSchedule);
      const schedule = await repository.findOneByOrFail({ id: scheduleId });
      if (patch.name !== undefined) schedule.name = patch.name;
      if (patch.enabled !== undefined) schedule.enabled = patch.enabled;
      if (patch.durationBasis !== undefined) schedule.durationBasis = patch.durationBasis;
      if (patch.triggerType !== undefined) schedule.triggerType = patch.triggerType;
      await repository.save(schedule);

      if (replaceConfigs) {
        await this.removeConfigs(manager, scheduleId);
        await this.storeConfig(manager, scheduleId, replaceConfigs.triggerType, replaceConfigs.configs);
      }
    });
  }

  async deleteWithAudit(scheduleId: number, auditEvent: AuditEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(ResourceMaintenance)
        .update({ maintenanceSchedule: { id: scheduleId } }, { maintenanceSchedule: null });
      await this.removeConfigs(manager, scheduleId);
      await manager.getRepository(ResourceMaintenanceSchedule).delete({ id: scheduleId });
      await this.audit.record(auditEvent, manager);
    });
  }

  private async removeConfigs(manager: EntityManager, scheduleId: number): Promise<void> {
    await manager.getRepository(ResourceMaintenanceScheduleUsageHoursConfig).delete({ scheduleId });
    await manager.getRepository(ResourceMaintenanceScheduleUsageCountConfig).delete({ scheduleId });
    await manager.getRepository(ResourceMaintenanceScheduleTimeIntervalConfig).delete({ scheduleId });
  }

  private async storeConfig(
    manager: EntityManager,
    scheduleId: number,
    triggerType: ResourceMaintenanceScheduleTriggerType,
    configs: MaintenanceScheduleConfigs,
  ): Promise<void> {
    switch (triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS:
        if (configs.usageHoursConfig) {
          const repository = manager.getRepository(ResourceMaintenanceScheduleUsageHoursConfig);
          await repository.save(
            repository.create({
              scheduleId,
              duration: configs.usageHoursConfig.duration,
              unit: configs.usageHoursConfig.unit,
            }),
          );
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT:
        if (configs.usageCountConfig) {
          const repository = manager.getRepository(ResourceMaintenanceScheduleUsageCountConfig);
          await repository.save(
            repository.create({ scheduleId, thresholdSessions: configs.usageCountConfig.thresholdSessions }),
          );
        }
        break;
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL:
        if (configs.timeIntervalConfig) {
          const repository = manager.getRepository(ResourceMaintenanceScheduleTimeIntervalConfig);
          await repository.save(
            repository.create({
              scheduleId,
              duration: configs.timeIntervalConfig.duration,
              unit: configs.timeIntervalConfig.unit,
            }),
          );
        }
        break;
    }
  }
}
