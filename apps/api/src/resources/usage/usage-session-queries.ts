import { ResourceUsage } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { NotFoundException } from '@nestjs/common';
import { EntityManager, FindOneOptions, In, IsNull } from 'typeorm';
import { UsageDoorActionsImplementation } from './usage-door-actions';
export abstract class UsageSessionQueriesImplementation extends UsageDoorActionsImplementation {
  async getActiveSession(
    resourceId: number,
    onlyFinalized: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceUsage | null> {
    const resourceUsageRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceUsage)
      : this.resourceUsageRepository;

    return await resourceUsageRepository.findOne({
      where: {
        resourceId,
        endTime: IsNull(),
        isFinalized: onlyFinalized ? true : undefined,
        lifecyclePending: false,
      },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
  }

  async getActiveSessions(resourceIds: number[]): Promise<Map<number, ResourceUsage | null>> {
    const map = new Map<number, ResourceUsage | null>(resourceIds.map((id) => [id, null]));
    if (resourceIds.length === 0) return map;
    const sessions = await this.resourceUsageRepository.find({
      where: { resourceId: In(resourceIds), endTime: IsNull(), isFinalized: true, lifecyclePending: false },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
    for (const session of sessions) {
      map.set(session.resourceId, session);
    }
    return map;
  }

  async getSessionDetails(resourceId: number, usageId: number, user: AuthenticatedUser): Promise<ResourceUsage> {
    const usage = await this.resourceUsageRepository.findOne({
      where: { id: usageId, resourceId, lifecyclePending: false },
      relations: this.DETAIL_RELATIONS,
    });
    if (!usage) throw new NotFoundException('Usage session not found');

    if (usage.userId !== user.id && !user.effectivePermissions?.has('resources.update')) {
      if (!usage.projectId) throw new NotFoundException('Usage session not found');
      await this.projectsService.findOneById(user.id, usage.projectId);
    }

    return usage;
  }

  async getResourceUsageHistory(
    resourceId: number,
    page = 1,
    limit = 10,
    userId?: number,
  ): Promise<{ data: ResourceUsage[]; total: number }> {
    const whereClause: FindOneOptions<ResourceUsage>['where'] = { resourceId, lifecyclePending: false };

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
      relations: this.DETAIL_RELATIONS,
    });

    this.logger.debug(`Found ${data.length} usage records out of ${total} total for resource ${resourceId}`);

    return { data, total };
  }
}
