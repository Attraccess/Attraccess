import type { ResourceMaintenanceRecord } from '@attraccess/application-models';

import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { MetricsService } from '../../metrics/metrics.service';

import { RbacService } from '../../users-and-auth/rbac/rbac.service';

import { ListMaintenancesDto } from './dtos/listMaintenances.dto';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { CreateMaintenanceDto } from './dtos/createMaintenance.dto';

import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';

import { RESOURCE_MAINTENANCE_STORE, type ResourceMaintenanceStore } from './maintenance-store.port';

import type { ResourcePersistenceContext } from '../resource-persistence-context';

@Injectable()
export class ResourceMaintenanceService {
  constructor(
    @Inject(RESOURCE_MAINTENANCE_STORE)
    protected readonly store: ResourceMaintenanceStore,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
  ) {}

  protected readonly logger = new Logger(ResourceMaintenanceService.name);

  /**
   * Find maintenances of a given resource with filtering and pagination
   */
  async findMaintenances(
    resourceId: number,
    options: ListMaintenancesDto = {},
  ): Promise<{ data: ResourceMaintenanceRecord[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, includeUpcoming = true, includeActive = true, includePast = false } = options;
    const skip = (page - 1) * limit;

    if (!(await this.store.resourceExists(resourceId))) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    if (!includeUpcoming && !includeActive && !includePast) {
      throw new BadRequestException('At least one filter must be true');
    }

    const { data, total } = await this.store.page(resourceId, {
      includeUpcoming,
      includeActive,
      includePast,
      now: new Date(),
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Get a specific maintenance by ID (includes createdByUser and completedByUser for audit display).
   */
  async getMaintenanceById(maintenanceId: number): Promise<ResourceMaintenanceRecord> {
    const maintenance = await this.store.findById(maintenanceId);

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    return maintenance;
  }

  /**
   * Maintenances whose window overlaps [from, to). A window is [startTime, endTime ?? infinity): open-ended
   * maintenance (running or announced without an end) reaches until it is finished.
   */
  async findOverlappingMaintenances(resourceId: number, from: Date, to: Date): Promise<ResourceMaintenanceRecord[]> {
    return this.store.findOverlapping(resourceId, from, to);
  }

  async hasActiveMaintenance(
    resourceIdOrFilter: number | { resourceId: number; scheduleId?: number },
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    const filter = typeof resourceIdOrFilter === 'number' ? { resourceId: resourceIdOrFilter } : resourceIdOrFilter;
    return this.store.hasActive(filter, new Date(), context);
  }

  async getActiveMaintenanceResourceIds(resourceIds: number[]): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();
    return this.store.activeResourceIds(resourceIds, new Date());
  }

  /**
   * Return every resource from a list whose maintenance a user may manage.
   * One query covers both direct resource roles and roles inherited from groups.
   */
  async getMaintenanceManagedResourceIds(
    user: { id: number } | AuthenticatedUser,
    resourceIds: number[],
    effectivePermissions?: Set<string>,
    context?: ResourcePersistenceContext,
  ): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();

    const permissions =
      effectivePermissions ??
      (user as AuthenticatedUser).effectivePermissions ??
      (await this.rbacService.getEffectivePermissions(user.id));
    if (permissions.has('resources.maintenance.manage')) return new Set(resourceIds);

    try {
      return await this.store.introducerManagedResourceIds(user.id, resourceIds, context);
    } catch (error) {
      this.logger.error(`Error checking maintenance management permissions: ${error.message}`, error.stack);
      return new Set();
    }
  }

  /**
   * Check if a user can manage maintenance for a specific resource
   */
  async canManageMaintenance(
    user: { id: number } | AuthenticatedUser,
    resourceId: number,
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    // Check if the user has system permissions to manage all resources.
    // Fall back to a DB lookup when the user came from a WebSocket/card path (no effectivePermissions attached).
    const effectivePermissions =
      (user as AuthenticatedUser).effectivePermissions ?? (await this.rbacService.getEffectivePermissions(user.id));
    if (effectivePermissions.has('resources.maintenance.manage')) {
      return true;
    }

    try {
      const access = await this.store.lookupMaintenanceAccess(user.id, resourceId, context);
      if (access === 'resource-missing') {
        this.logger.warn(`Resource ${resourceId} not found`);
        return false;
      }
      return access !== 'none';
    } catch (error) {
      this.logger.error(`Error checking maintenance management permissions: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Create a maintenance for a given resource.
   * When called from the API (manual create), pass userId to record the creating user.
   * System-created maintenances (schedule evaluator) omit userId so createdByUser stays null.
   */
  async createMaintenance(
    resourceId: number,
    dto: CreateMaintenanceDto,
    userId?: number,
  ): Promise<ResourceMaintenanceRecord> {
    if (!(await this.store.resourceExists(resourceId))) {
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

    const savedMaintenance = await this.store.createManual({
      resourceId,
      startTime,
      endTime: dto.endTime ? new Date(dto.endTime) : null,
      reason: dto.reason || null,
      createdByUserId: userId,
    });
    this.eventEmitter.emit(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(resourceId, savedMaintenance.id, 'created'),
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
    context?: ResourcePersistenceContext,
    notify = true,
  ): Promise<ResourceMaintenanceRecord> {
    const savedMaintenance = await this.store.createFromSchedule(
      { resourceId, scheduleId, reason, startTime: new Date() },
      context,
    );

    if (!savedMaintenance) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    if (notify) this.emitScheduledMaintenanceCreated(resourceId, savedMaintenance.id);
    return savedMaintenance;
  }

  /** Emit scheduled-maintenance side effects after the containing transaction commits. */
  emitScheduledMaintenanceCreated(resourceId: number, maintenanceId: number): void {
    this.eventEmitter.emit(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(resourceId, maintenanceId, 'created'),
    );
    this.metricsService.resourceMaintenanceTotal.inc({ type: 'scheduled' });
  }

  /**
   * Finish a maintenance (set end time, completedAt, and optionally completedBy from the calling user).
   */
  async finishMaintenance(
    maintenanceId: number,
    options?: { userId?: number; notes?: string },
  ): Promise<ResourceMaintenanceRecord> {
    const maintenance = await this.store.findById(maintenanceId);

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    if (maintenance.endTime) {
      throw new BadRequestException('Maintenance is already finished');
    }

    const savedMaintenance = await this.store.markFinished(maintenanceId, new Date(), options?.userId);
    this.eventEmitter.emit(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(maintenance.resourceId, savedMaintenance.id, 'finished'),
    );
    return savedMaintenance;
  }
}
