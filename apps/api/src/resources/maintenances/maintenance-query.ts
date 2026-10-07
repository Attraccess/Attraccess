import { ResourceMaintenance } from '@attraccess/database-entities';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ListMaintenancesDto } from './dtos/listMaintenances.dto';
import { PaginatedMaintenanceResponse } from './dtos/paginatedMaintenanceResponse.dto';
import { MaintenanceManagementAccessImplementation } from './maintenance-management-access';
export abstract class MaintenanceQueryImplementation extends MaintenanceManagementAccessImplementation {
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
}
