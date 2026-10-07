import { Resource, ResourceMaintenance, ResourceMaintenanceSchedule, User } from '@attraccess/database-entities';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateMaintenanceDto } from './dtos/createMaintenance.dto';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';
import { ResourceMaintenanceServiceRouteContext } from './maintenance.service.route-context';
export abstract class MaintenanceWritingImplementation extends ResourceMaintenanceServiceRouteContext {
  /**
   * Create a maintenance for a given resource.
   * When called from the API (manual create), pass userId to record the creating user.
   * System-created maintenances (schedule evaluator) omit userId so createdByUser stays null.
   */
  async createMaintenance(
    resourceId: number,
    dto: CreateMaintenanceDto,
    userId?: number,
  ): Promise<ResourceMaintenance> {
    // Verify the resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const startTime = new Date(dto.startTime);

    // Validate that end time is after start time if provided
    if (dto.endTime) {
      const endTime = new Date(dto.endTime);
      if (endTime <= startTime) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    const maintenance = this.maintenanceRepository.create({
      resource,
      startTime,
      endTime: dto.endTime ? new Date(dto.endTime) : null,
      reason: dto.reason || null,
      createdByUser: userId != null ? ({ id: userId } as User) : undefined,
    });

    const savedMaintenance = await this.maintenanceRepository.save(maintenance);
    this.eventEmitter.emit(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(resourceId, savedMaintenance.id),
    );
    this.metricsService.resourceMaintenanceTotal.inc({ type: 'manual' });
    return savedMaintenance;
  }

  /**
   * Create a maintenance from a schedule trigger (system-created). Used by the schedule evaluator.
   */
  async createMaintenanceFromSchedule(
    resourceId: number,
    scheduleId: number,
    reason: string,
    transactionalEntityManager?: EntityManager,
    notify = true,
  ): Promise<ResourceMaintenance> {
    const resourceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(Resource)
      : this.resourceRepository;
    const maintenanceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceMaintenance)
      : this.maintenanceRepository;

    const resource = await resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const now = new Date();
    const maintenance = maintenanceRepository.create({
      resource,
      startTime: now,
      endTime: null,
      reason,
      maintenanceSchedule: { id: scheduleId } as ResourceMaintenanceSchedule,
    });

    const savedMaintenance = await maintenanceRepository.save(maintenance);
    if (notify) this.emitScheduledMaintenanceCreated(resourceId, savedMaintenance.id);
    return savedMaintenance;
  }

  /** Emit scheduled-maintenance side effects after the containing transaction commits. */
  emitScheduledMaintenanceCreated(resourceId: number, maintenanceId: number): void {
    this.eventEmitter.emit(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(resourceId, maintenanceId),
    );
    this.metricsService.resourceMaintenanceTotal.inc({ type: 'scheduled' });
  }

  /**
   * Finish a maintenance (set end time, completedAt, and optionally completedBy from the calling user).
   */
  async finishMaintenance(
    maintenanceId: number,
    options?: { userId?: number; notes?: string },
  ): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceRepository.findOne({
      where: { id: maintenanceId },
    });

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    if (maintenance.endTime) {
      throw new BadRequestException('Maintenance is already finished');
    }

    const now = new Date();
    maintenance.endTime = now;
    maintenance.completedAt = now;
    if (options?.userId != null) {
      maintenance.completedByUser = { id: options.userId } as User;
    }
    const savedMaintenance = await this.maintenanceRepository.save(maintenance);
    this.eventEmitter.emit(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(maintenance.resourceId, savedMaintenance.id),
    );
    return savedMaintenance;
  }
}
