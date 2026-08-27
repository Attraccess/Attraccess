import { Injectable, Logger, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import {
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  Resource,
  ResourceIntroducer,
  User,
} from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { CreateMaintenanceDto } from './dtos/createMaintenance.dto';
import { ListMaintenancesDto } from './dtos/listMaintenances.dto';
import { PaginatedMaintenanceResponse } from './dtos/paginatedMaintenanceResponse.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class ResourceMaintenanceService {
  private readonly logger = new Logger(ResourceMaintenanceService.name);

  constructor(
    @InjectRepository(ResourceMaintenance)
    private readonly maintenanceRepository: Repository<ResourceMaintenance>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
    private readonly rbacService: RbacService,
  ) {}

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

  /**
   * Find maintenances of a given resource with filtering and pagination
   */
  async findMaintenances(resourceId: number, options: ListMaintenancesDto = {}): Promise<PaginatedMaintenanceResponse> {
    const { page = 1, limit = 10, includeUpcoming = true, includeActive = true, includePast = false } = options;
    const skip = (page - 1) * limit;

    // Verify the resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    // Build query based on filter options
    const queryBuilder = this.maintenanceRepository
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId });

    const now = new Date();

    // Build dynamic conditions based on filter flags
    if (includeUpcoming && includeActive && includePast) {
      // All maintenances - no additional filtering needed
    } else if (!includeUpcoming && !includeActive && !includePast) {
      throw new BadRequestException('At least one filter must be true');
    } else {
      // Build specific conditions
      const conditions = [];

      if (includeUpcoming) {
        conditions.push('maintenance.startTime > :now');
      }

      if (includeActive) {
        conditions.push(
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NULL OR maintenance.endTime > :now))',
        );
      }

      if (includePast) {
        conditions.push(
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NOT NULL AND maintenance.endTime < :now))',
        );
      }

      if (conditions.length > 0) {
        queryBuilder.andWhere(`(${conditions.join(' OR ')})`, { now });
      }
    }

    // Order by start time (soonest first)
    queryBuilder.orderBy('maintenance.startTime', 'ASC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Load audit relations for "who did maintenance when" display
    queryBuilder
      .leftJoinAndSelect('maintenance.createdByUser', 'createdByUser')
      .leftJoinAndSelect('maintenance.completedByUser', 'completedByUser');

    // Get paginated results
    const data = await queryBuilder.skip(skip).take(limit).getMany();

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
    const maintenance = await this.maintenanceRepository.findOne({
      where: { id: maintenanceId },
      relations: ['createdByUser', 'completedByUser'],
    });

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    return maintenance;
  }

  /**
   * Check if there's an active maintenance window for a resource.
   * This is the single source of truth for "resource in maintenance mode".
   * Active = resourceId match, startTime <= now, endTime IS NULL. No distinction between
   * manual and schedule-triggered maintenances; both block usage for non–maintenance users.
   */
  async hasActiveMaintenance(resourceId: number, transactionalEntityManager?: EntityManager): Promise<boolean>;
  async hasActiveMaintenance(
    filter: { resourceId: number; scheduleId: number },
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean>;
  async hasActiveMaintenance(
    resourceIdOrFilter: number | { resourceId: number; scheduleId?: number },
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    const resourceId = typeof resourceIdOrFilter === 'number' ? resourceIdOrFilter : resourceIdOrFilter.resourceId;
    const scheduleId = typeof resourceIdOrFilter === 'number' ? undefined : resourceIdOrFilter.scheduleId;

    const now = new Date();

    const maintenanceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceMaintenance)
      : this.maintenanceRepository;

    const query = maintenanceRepository
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId })
      .andWhere('maintenance.startTime <= :now', { now })
      .andWhere('maintenance.endTime IS NULL');

    if (scheduleId) {
      query.andWhere('maintenance.maintenanceScheduleId = :scheduleId', { scheduleId });
    }

    const activeMaintenance = await query.getOne();

    return !!activeMaintenance;
  }

  async getActiveMaintenanceResourceIds(resourceIds: number[]): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();
    const now = new Date();
    const active = await this.maintenanceRepository
      .createQueryBuilder('maintenance')
      .select('DISTINCT maintenance.resourceId', 'resourceId')
      .where('maintenance.resourceId IN (:...resourceIds)', { resourceIds })
      .andWhere('maintenance.startTime <= :now', { now })
      .andWhere('maintenance.endTime IS NULL')
      .getRawMany<{ resourceId: number }>();
    return new Set(active.map((r) => Number(r.resourceId)));
  }

  /**
   * Check if a user can manage maintenance for a specific resource
   */
  async canManageMaintenance(
    user: User | AuthenticatedUser,
    resourceId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    // Check if the user has system permissions to manage all resources.
    // Fall back to a DB lookup when the entity came from a WebSocket/card path (no effectivePermissions attached).
    const effectivePermissions =
      (user as AuthenticatedUser).effectivePermissions ?? (await this.rbacService.getEffectivePermissions(user.id));
    if (effectivePermissions.has('resources.maintenance.manage')) {
      return true;
    }

    try {
      const resourceIntroducerRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(ResourceIntroducer)
        : this.resourceIntroducerRepository;

      // First, check if the user is an introducer for this specific resource
      const resourceIntroducer = await resourceIntroducerRepository.findOne({
        where: {
          user: {
            id: user.id,
          },
          resource: {
            id: resourceId,
          },
        },
      });

      if (resourceIntroducer) {
        return true;
      }

      const resourceRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(Resource)
        : this.resourceRepository;

      // If not a direct resource introducer, check if the user is an introducer for any group the resource belongs to
      const resource = await resourceRepository.findOne({
        where: { id: resourceId },
        relations: ['groups'],
      });

      if (!resource) {
        this.logger.warn(`Resource ${resourceId} not found`);
        return false;
      }

      // Check if user is introducer for any of the resource's groups
      const groupIntroducer = await resourceIntroducerRepository.findOne({
        where: {
          user: {
            id: user.id,
          },
          resourceGroup: {
            id: In(resource.groups.map((group) => group.id)),
          },
        },
      });

      if (groupIntroducer) {
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking maintenance management permissions: ${error.message}`, error.stack);
      return false;
    }
  }
}
