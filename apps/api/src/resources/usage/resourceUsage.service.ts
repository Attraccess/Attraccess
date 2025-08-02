import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, FindOneOptions } from 'typeorm';
import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ResourceUsageStartedEvent,
  ResourceUsageEndedEvent,
  ResourceUsageTakenOverEvent,
} from './events/resource-usage.events';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';

@Injectable()
export class ResourceUsageService {
  private readonly logger = new Logger(ResourceUsageService.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    private readonly resourceIntroductionService: ResourceIntroductionsService,
    private readonly resourceIntroducersService: ResourceIntroducersService,
    private readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService,
    private readonly resourceGroupsIntroducersService: ResourceGroupsIntroducersService,
    private readonly resourceGroupsService: ResourceGroupsService,
    private readonly resourceMaintenanceService: ResourceMaintenanceService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  public async canControllResource(resourceId: number, user: User): Promise<boolean> {
    this.logger.debug(`Checking if user ${user.id} can control resource ${resourceId}`);

    if (user.systemPermissions?.canManageResources) {
      this.logger.debug(`User ${user.id} has system permissions to manage resources`);
      return true;
    }

    if (await this.resourceIntroductionService.hasValidIntroduction(resourceId, user.id)) {
      this.logger.debug(`User ${user.id} has valid introduction for resource ${resourceId}`);
      return true;
    }

    if (await this.resourceIntroducersService.isIntroducer(resourceId, user.id)) {
      this.logger.debug(`User ${user.id} is an introducer for resource ${resourceId}`);
      return true;
    }

    const groupsOfResource = await this.resourceGroupsService.getGroupsOfResource(resourceId);
    for (const group of groupsOfResource) {
      if (await this.resourceGroupsIntroductionsService.hasValidIntroduction({ groupId: group.id, userId: user.id })) {
        this.logger.debug(`User ${user.id} has valid group introduction for resource ${resourceId}`);
        return true;
      }

      if (await this.resourceGroupsIntroducersService.isIntroducer({ groupId: group.id, userId: user.id })) {
        this.logger.debug(`User ${user.id} is a group introducer for resource ${resourceId}`);
        return true;
      }
    }

    this.logger.debug(`User ${user.id} cannot control resource ${resourceId}`);
    return false;
  }

  async startSession(resourceId: number, user: User, dto: StartUsageSessionDto): Promise<ResourceUsage> {
    this.logger.debug(`Starting session for resource ${resourceId} by user ${user.id}`, { dto });

    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      this.logger.warn(`Resource ${resourceId} not found`);
      throw new ResourceNotFoundException(resourceId);
    }
    this.logger.debug(`Found resource ${resourceId}: ${resource.name}`);

    // Check if there's an active maintenance window
    const hasActiveMaintenance = await this.resourceMaintenanceService.hasActiveMaintenance(resourceId);
    if (hasActiveMaintenance) {
      // Check if user can manage maintenance (which allows them to use during maintenance)
      const canManageMaintenance = await this.resourceMaintenanceService.canManageMaintenance(user, resourceId);

      if (!canManageMaintenance) {
        this.logger.warn(
          `User ${user.id} attempted to use resource ${resourceId} during maintenance window without permissions`
        );
        throw new ResourceUsageImpossibleMaintenanceInProgressException(resourceId);
      }

      this.logger.debug(`User ${user.id} has maintenance permissions, allowing usage during maintenance window`);
    }

    const canStartSession = await this.canControllResource(resourceId, user);

    if (!canStartSession) {
      this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
      throw new BadRequestException('You must complete the resource introduction before using it');
    }

    const existingActiveSession = await this.getActiveSession(resourceId);
    if (existingActiveSession) {
      this.logger.debug(
        `Found existing active session for resource ${resourceId} by user ${existingActiveSession.user.id}`
      );

      // If there's an active session, check if takeover is allowed
      if (dto.forceTakeOver && resource.allowTakeOver) {
        this.logger.debug(
          `Forcing takeover of resource ${resourceId} from user ${existingActiveSession.user.id} to user ${user.id}`
        );

        const takeoverEndTime = new Date();

        // End the existing session with a note about takeover
        await this.resourceUsageRepository
          .createQueryBuilder()
          .update(ResourceUsage)
          .set({
            endTime: takeoverEndTime,
            endNotes: `Session ended due to takeover by user ${user.id}`,
          })
          .where('id = :id', { id: existingActiveSession.id })
          .execute();

        // Emit event for the ended session
        this.eventEmitter.emit(
          ResourceUsageEndedEvent.EVENT_NAME,
          new ResourceUsageEndedEvent(
            existingActiveSession.resource,
            existingActiveSession.startTime,
            takeoverEndTime,
            existingActiveSession.user
          )
        );
      } else if (dto.forceTakeOver && !resource.allowTakeOver) {
        this.logger.warn(`Takeover attempted for resource ${resourceId} but not allowed`);
        throw new BadRequestException('This resource does not allow overtaking');
      } else {
        this.logger.warn(`Resource ${resourceId} is currently in use by user ${existingActiveSession.user.id}`);
        throw new BadRequestException('Resource is currently in use by another user');
      }
    }

    const usageData = {
      resourceId,
      userId: user.id,
      startTime: new Date(),
      startNotes: dto.notes,
      endTime: null,
      endNotes: null,
    };

    this.logger.debug(`Creating new usage session for resource ${resourceId}`, { usageData });

    await this.resourceUsageRepository.createQueryBuilder().insert().into(ResourceUsage).values(usageData).execute();

    const newSession = await this.resourceUsageRepository.findOne({
      where: {
        resourceId,
        userId: user.id,
        endTime: IsNull(),
      },
      order: {
        startTime: 'DESC',
      },
      relations: ['resource', 'user'],
    });

    if (!newSession) {
      this.logger.error(`Failed to retrieve newly created session for resource ${resourceId} and user ${user.id}`);
      throw new Error('Failed to retrieve the newly created session.');
    }

    this.logger.debug(`Successfully created session ${newSession.id} for resource ${resourceId} by user ${user.id}`);

    if (existingActiveSession) {
      const now = new Date();
      // Emit event for the takeover
      this.eventEmitter.emit(
        ResourceUsageTakenOverEvent.EVENT_NAME,
        new ResourceUsageTakenOverEvent(resource, now, user, existingActiveSession.user)
      );
    } else {
      // Emit event after successful save
      this.eventEmitter.emit(
        ResourceUsageStartedEvent.EVENT_NAME,
        new ResourceUsageStartedEvent(resource, usageData.startTime, user)
      );
    }

    return newSession;
  }

  async endSession(resourceId: number, user: User, dto: EndUsageSessionDto): Promise<ResourceUsage> {
    this.logger.debug(`Ending session for resource ${resourceId} by user ${user.id}`, { dto });

    // Find active session
    const activeSession = await this.getActiveSession(resourceId);
    if (!activeSession) {
      throw new BadRequestException('No active session found');
    }

    // Check if the user is authorized to end the session
    const canManageResources = user.systemPermissions?.canManageResources || false;
    const isSessionOwner = activeSession.user.id === user.id; // Use loaded user ID

    if (!isSessionOwner && !canManageResources) {
      this.logger.warn(
        `User ${user.id} not authorized to end session ${activeSession.id} owned by user ${activeSession.user.id}`
      );
      throw new ForbiddenException('You are not authorized to end this session');
    }

    const endTime = new Date();

    this.logger.debug(`Ending session ${activeSession.id} at ${endTime.toISOString()}`);

    // Update session with end time and notes - using explicit update to avoid the generated column
    await this.resourceUsageRepository
      .createQueryBuilder()
      .update(ResourceUsage)
      .set({
        endTime,
        endNotes: dto.notes,
      })
      .where('id = :id', { id: activeSession.id })
      .execute();

    this.logger.debug(`Successfully ended session ${activeSession.id}`);

    // Emit event after successful save
    this.eventEmitter.emit(
      ResourceUsageEndedEvent.EVENT_NAME,
      new ResourceUsageEndedEvent(activeSession.resource, activeSession.startTime, endTime, activeSession.user)
    );

    // Fetch the updated record
    return await this.resourceUsageRepository.findOne({
      where: { id: activeSession.id },
      relations: ['resource', 'user'],
    });
  }

  async getActiveSession(resourceId: number): Promise<ResourceUsage | null> {
    return await this.resourceUsageRepository.findOne({
      where: {
        resourceId,
        endTime: IsNull(),
      },
      relations: ['user', 'resource'],
    });
  }

  async getResourceUsageHistory(
    resourceId: number,
    page = 1,
    limit = 10,
    userId?: number
  ): Promise<{ data: ResourceUsage[]; total: number }> {
    const whereClause: FindOneOptions<ResourceUsage>['where'] = { resourceId };

    // Add userId filter if provided
    if (userId) {
      whereClause.userId = userId;
      this.logger.debug(`Filtering usage history by userId ${userId}`);
    }

    const [data, total] = await this.resourceUsageRepository.findAndCount({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      order: { startTime: 'DESC' },
      relations: ['user'],
    });

    this.logger.debug(`Found ${data.length} usage records out of ${total} total for resource ${resourceId}`);

    return { data, total };
  }

  async getUserUsageHistory(userId: number, page = 1, limit = 10): Promise<{ data: ResourceUsage[]; total: number }> {
    this.logger.debug(`Getting usage history for user ${userId}`, { page, limit });

    const [data, total] = await this.resourceUsageRepository.findAndCount({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      order: { startTime: 'DESC' },
      relations: ['resource'],
    });

    this.logger.debug(`Found ${data.length} usage records out of ${total} total for user ${userId}`);

    return { data, total };
  }
}
