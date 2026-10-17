import { ResourceMaintenance, User, ResourceMaintenanceSchedule } from '@attraccess/application-models';

import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { MaintenancePersistence, MAINTENANCE_OPERATIONS } from './persistence/port';

import { TransactionScope } from '../../database/transaction-scope';

import { MetricsService } from '../../metrics/metrics.service';

import { RbacService } from '../../users-and-auth/rbac/rbac.service';

import { ListMaintenancesDto } from './dtos/listMaintenances.dto';

import { PaginatedMaintenanceResponse } from './dtos/paginatedMaintenanceResponse.dto';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk/v2';

import { CreateMaintenanceDto } from './dtos/createMaintenance.dto';

import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';

@Injectable()
export class ResourceMaintenanceService {
  constructor(
    @Inject(MaintenancePersistence) protected readonly persistence: MaintenancePersistence,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
  ) {}

  protected operations(scope?: TransactionScope): MaintenancePersistence {
    return scope ? scope.resolve(MAINTENANCE_OPERATIONS) : this.persistence;
  }

  protected readonly logger = new Logger(ResourceMaintenanceService.name);

  /**
   * Find maintenances of a given resource with filtering and pagination
   */
  async findMaintenances(resourceId: number, options: ListMaintenancesDto = {}): Promise<PaginatedMaintenanceResponse> {
    const { page = 1, limit = 10, includeUpcoming = true, includeActive = true, includePast = false } = options;
    const skip = (page - 1) * limit;

    // Verify the resource exists
    const resource = await this.persistence.resource(resourceId);

    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    if (!includeUpcoming && !includeActive && !includePast)
      throw new BadRequestException('At least one filter must be true');
    const [data, total] = await this.persistence.page(resourceId, {
      now: new Date(),
      includeUpcoming,
      includeActive,
      includePast,
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  /**
   * Get a specific maintenance by ID (includes createdByUser and completedByUser for audit display).
   */
  async getMaintenanceById(maintenanceId: number): Promise<ResourceMaintenance> {
    const maintenance = await this.persistence.maintenance(maintenanceId, true);

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    return maintenance;
  }

  async hasActiveMaintenance(
    resourceIdOrFilter: number | { resourceId: number; scheduleId?: number },
    transactionalEntityManager?: TransactionScope,
  ): Promise<boolean> {
    const resourceId = typeof resourceIdOrFilter === 'number' ? resourceIdOrFilter : resourceIdOrFilter.resourceId;
    const scheduleId = typeof resourceIdOrFilter === 'number' ? undefined : resourceIdOrFilter.scheduleId;

    const now = new Date();

    return this.operations(transactionalEntityManager).hasActive(resourceId, scheduleId, now);
  }

  async getActiveMaintenanceResourceIds(resourceIds: number[]): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();
    return new Set(await this.persistence.activeResourceIds(resourceIds, new Date()));
  }

  /**
   * Return every resource from a list whose maintenance a user may manage.
   * One query covers both direct resource roles and roles inherited from groups.
   */
  async getMaintenanceManagedResourceIds(
    user: User | AuthenticatedUser,
    resourceIds: number[],
    effectivePermissions?: Set<string>,
    transactionalEntityManager?: TransactionScope,
  ): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();

    const permissions =
      effectivePermissions ??
      (user as AuthenticatedUser).effectivePermissions ??
      (await this.rbacService.getEffectivePermissions(user.id));
    if (permissions.has('resources.maintenance.manage')) return new Set(resourceIds);

    try {
      const matches = await this.operations(transactionalEntityManager).managedResourcePairs(user.id, resourceIds);

      return new Set(
        matches.flatMap((match) =>
          [match.resourceId, match.groupResourceId].filter((id): id is number => id != null).map(Number),
        ),
      );
    } catch (error) {
      this.logger.error(`Error checking maintenance management permissions: ${error.message}`, error.stack);
      return new Set();
    }
  }

  /**
   * Check if a user can manage maintenance for a specific resource
   */
  async canManageMaintenance(
    user: User | AuthenticatedUser,
    resourceId: number,
    transactionalEntityManager?: TransactionScope,
  ): Promise<boolean> {
    // Check if the user has system permissions to manage all resources.
    // Fall back to a DB lookup when the entity came from a WebSocket/card path (no effectivePermissions attached).
    const effectivePermissions =
      (user as AuthenticatedUser).effectivePermissions ?? (await this.rbacService.getEffectivePermissions(user.id));
    if (effectivePermissions.has('resources.maintenance.manage')) {
      return true;
    }

    try {
      const resourceIntroducer = await this.operations(transactionalEntityManager).directIntroducer(
        user.id,
        resourceId,
      );

      if (resourceIntroducer) {
        return true;
      }

      const resource = await this.operations(transactionalEntityManager).resource(resourceId, true);

      if (!resource) {
        this.logger.warn(`Resource ${resourceId} not found`);
        return false;
      }

      // Check if user is introducer for any of the resource's groups
      const groupIntroducer = await this.operations(transactionalEntityManager).groupIntroducer(
        user.id,
        resource.groups.map((group) => group.id),
      );

      if (groupIntroducer) {
        return true;
      }

      return false;
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
  ): Promise<ResourceMaintenance> {
    // Verify the resource exists
    const resource = await this.persistence.resource(resourceId);

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

    const savedMaintenance = await this.persistence.createMaintenance({
      resource,
      startTime,
      endTime: dto.endTime ? new Date(dto.endTime) : null,
      reason: dto.reason || null,
      createdByUser: userId != null ? ({ id: userId } as User) : undefined,
    });

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
    transactionalEntityManager?: TransactionScope,
    notify = true,
  ): Promise<ResourceMaintenance> {
    const persistence = this.operations(transactionalEntityManager);
    const resource = await persistence.resource(resourceId);

    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const now = new Date();
    const savedMaintenance = await persistence.createMaintenance({
      resource,
      startTime: now,
      endTime: null,
      reason,
      maintenanceSchedule: { id: scheduleId } as ResourceMaintenanceSchedule,
    });

    if (notify) {
      if (transactionalEntityManager)
        transactionalEntityManager.afterCommit(() =>
          this.emitScheduledMaintenanceCreated(resourceId, savedMaintenance.id),
        );
      else this.emitScheduledMaintenanceCreated(resourceId, savedMaintenance.id);
    }
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
    const maintenance = await this.persistence.maintenance(maintenanceId, false);

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
    const savedMaintenance = await this.persistence.saveMaintenance(maintenance);
    this.eventEmitter.emit(
      ResourceMaintenanceChangedEvent.EVENT_NAME,
      new ResourceMaintenanceChangedEvent(maintenance.resourceId, savedMaintenance.id),
    );
    return savedMaintenance;
  }
}
