import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ResourceMaintenance, Resource, ResourceIntroducer, User } from '@attraccess/database-entities';
import { CreateMaintenanceDto } from './dtos/createMaintenance.dto';
import { UpdateMaintenanceDto } from './dtos/updateMaintenance.dto';
import { ListMaintenancesDto } from './dtos/listMaintenances.dto';
import { PaginatedMaintenanceResponse } from './dtos/paginatedMaintenanceResponse.dto';

@Injectable()
export class ResourceMaintenanceService {
  private readonly logger = new Logger(ResourceMaintenanceService.name);

  constructor(
    @InjectRepository(ResourceMaintenance)
    private readonly maintenanceRepository: Repository<ResourceMaintenance>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>
  ) {}

  /**
   * Create a maintenance for a given resource
   */
  async createMaintenance(resourceId: number, dto: CreateMaintenanceDto): Promise<ResourceMaintenance> {
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
    });

    return await this.maintenanceRepository.save(maintenance);
  }

  /**
   * Finish a maintenance (set end time to current time)
   */
  async finishMaintenance(maintenanceId: number): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceRepository.findOne({
      where: { id: maintenanceId },
    });

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    if (maintenance.endTime) {
      throw new BadRequestException('Maintenance is already finished');
    }

    maintenance.endTime = new Date();
    return await this.maintenanceRepository.save(maintenance);
  }

  /**
   * Update a maintenance with new start time, end time, and/or reason
   */
  async updateMaintenance(maintenanceId: number, dto: UpdateMaintenanceDto): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceRepository.findOne({
      where: { id: maintenanceId },
    });

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    // Update start time if provided
    if (dto.startTime) {
      const startTime = new Date(dto.startTime);
      maintenance.startTime = startTime;
    }

    // Update end time if provided
    if (dto.endTime !== undefined) {
      const endTime = dto.endTime ? new Date(dto.endTime) : null;
      maintenance.endTime = endTime;
    }

    // Update reason if provided
    if (dto.reason !== undefined) {
      maintenance.reason = dto.reason;
    }

    // Validate that end time is after start time if both are set
    if (maintenance.endTime && maintenance.startTime >= maintenance.endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    return await this.maintenanceRepository.save(maintenance);
  }

  /**
   * Cancel a maintenance (delete it)
   */
  async cancelMaintenance(maintenanceId: number): Promise<void> {
    const maintenance = await this.maintenanceRepository.findOne({
      where: { id: maintenanceId },
    });

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    await this.maintenanceRepository.remove(maintenance);
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
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NULL OR maintenance.endTime > :now))'
        );
      }

      if (includePast) {
        conditions.push(
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NOT NULL AND maintenance.endTime < :now))'
        );
      }

      if (conditions.length > 0) {
        queryBuilder.andWhere(`(${conditions.join(' OR ')})`, { now });
      }
    }

    // Order by start time (soonest first)
    queryBuilder.orderBy('maintenance.startTime', 'ASC');

    this.logger.debug(queryBuilder.getSql());

    // Get total count
    const total = await queryBuilder.getCount();

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
   * Get a specific maintenance by ID
   */
  async getMaintenanceById(maintenanceId: number): Promise<ResourceMaintenance> {
    const maintenance = await this.maintenanceRepository.findOne({
      where: { id: maintenanceId },
    });

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with ID ${maintenanceId} not found`);
    }

    return maintenance;
  }

  /**
   * Check if there's an active maintenance window for a resource
   */
  async hasActiveMaintenance(resourceId: number): Promise<boolean> {
    const now = new Date();

    const activeMaintenance = await this.maintenanceRepository
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId })
      .andWhere('maintenance.startTime <= :now', { now })
      .andWhere('maintenance.endTime IS NULL')
      .getOne();

    return !!activeMaintenance;
  }

  /**
   * Check if a user can manage maintenance for a specific resource
   */
  async canManageMaintenance(user: User, resourceId: number): Promise<boolean> {
    // Check if the user has system permissions to manage all resources
    if (user.systemPermissions && user.systemPermissions.canManageResources === true) {
      return true;
    }

    try {
      // First, check if the user is an introducer for this specific resource
      const resourceIntroducer = await this.resourceIntroducerRepository.findOne({
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

      // If not a direct resource introducer, check if the user is an introducer for any group the resource belongs to
      const resource = await this.resourceRepository.findOne({
        where: { id: resourceId },
        relations: ['groups'],
      });

      if (!resource) {
        this.logger.warn(`Resource ${resourceId} not found`);
        return false;
      }

      // Check if user is introducer for any of the resource's groups
      const groupIntroducer = await this.resourceIntroducerRepository.findOne({
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
