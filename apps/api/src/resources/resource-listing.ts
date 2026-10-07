import { Resource } from '@attraccess/database-entities';
import { Brackets } from 'typeorm';
import { PaginatedResponse } from '../types/response';
import { ResourceWritingImplementation } from './resource-writing';
import { activeUsageSql } from './usage/active-usage';

export abstract class ResourceListingImplementation extends ResourceWritingImplementation {
  public async listResources(options?: {
    page?: number;
    limit?: number;
    search?: string;
    groupId?: number;
    ids?: number[] | number;
    onlyInUseByUserId?: number;
    onlyWithPermissionForUserId?: number;
    onlyInUse?: boolean;
    returnUsingUser?: boolean;
  }): Promise<PaginatedResponse<Resource>> {
    if (!options) {
      options = {};
    }

    const {
      page = 1,
      limit = 10,
      search,
      groupId,
      onlyInUseByUserId,
      onlyWithPermissionForUserId,
      onlyInUse,
      returnUsingUser,
    } = options;

    let ids = options.ids;
    if (typeof ids === 'number') {
      ids = [ids];
    }

    // Create the query builder
    const queryBuilder = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.groups', 'groups')
      .orderBy('resource.name', 'ASC');

    if (onlyInUse || onlyInUseByUserId !== undefined || returnUsingUser) {
      if (returnUsingUser) {
        queryBuilder.leftJoinAndSelect('resource.usages', 'usage', activeUsageSql('usage'));
      } else {
        queryBuilder.leftJoin('resource.usages', 'usage', activeUsageSql('usage'));
      }
    }

    if (returnUsingUser) {
      queryBuilder.leftJoinAndSelect('usage.user', 'usingUser');
    }

    if (onlyInUse) {
      queryBuilder.andWhere('usage.endTime IS NULL').andWhere('usage.startTime IS NOT NULL');
    }

    if (onlyInUseByUserId !== undefined) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('usage.userId = :userId', { userId: onlyInUseByUserId });
          qb.andWhere('usage.endTime IS NULL');
        }),
      );
    }

    if (onlyWithPermissionForUserId !== undefined) {
      queryBuilder.leftJoin('resource.introducers', 'introducer');

      queryBuilder.leftJoin('resource.introductions', 'introduction');
      queryBuilder.leftJoin('introduction.history', 'resourceIntroductionHistory');
      queryBuilder.leftJoin(
        'introduction.history',
        'laterResourceIntroductionHistory',
        'laterResourceIntroductionHistory.introductionId = resourceIntroductionHistory.introductionId \
         AND laterResourceIntroductionHistory.createdAt > resourceIntroductionHistory.createdAt',
      );

      queryBuilder.leftJoin('resource.groups', 'resourceGroup');
      queryBuilder.leftJoin('resourceGroup.introducers', 'groupIntroducer');
      queryBuilder.leftJoin('resourceGroup.introductions', 'groupIntroduction');
      queryBuilder.leftJoin('groupIntroduction.history', 'groupIntroductionHistory');
      queryBuilder.leftJoin(
        'groupIntroduction.history',
        'laterGroupIntroductionHistory',
        'laterGroupIntroductionHistory.introductionId = groupIntroductionHistory.introductionId \
         AND laterGroupIntroductionHistory.createdAt > groupIntroductionHistory.createdAt',
      );

      queryBuilder.andWhere(
        new Brackets((resourceQb) => {
          // Direct resource introducers
          resourceQb.where('introducer.userId = :userId', { userId: onlyWithPermissionForUserId });

          // Group introducers
          resourceQb.orWhere('groupIntroducer.userId = :userId', { userId: onlyWithPermissionForUserId });

          // Direct resource introductions (users who received introduction to specific resource)
          resourceQb.orWhere(
            new Brackets((introductionQb) => {
              introductionQb
                .where('introduction.receiverUserId = :userId', { userId: onlyWithPermissionForUserId })
                .andWhere('resourceIntroductionHistory.action = :action', { action: 'grant' })
                .andWhere('laterResourceIntroductionHistory.id IS NULL');
            }),
          );

          // Group introductions (users who received introduction to resource group)
          resourceQb.orWhere(
            new Brackets((groupIntroductionQb) => {
              groupIntroductionQb
                .where('groupIntroduction.receiverUserId = :userId', { userId: onlyWithPermissionForUserId })
                .andWhere('groupIntroductionHistory.action = :action', { action: 'grant' })
                .andWhere('laterGroupIntroductionHistory.id IS NULL');
            }),
          );
        }),
      );
    }

    // Handle IDs filtering
    if (ids && ids.length > 0) {
      queryBuilder.andWhere('resource.id IN (:...ids)', { ids });
    }

    // Handle group filtering
    if (groupId !== undefined) {
      if (groupId === -1) {
        // Special case: resources with no groups
        queryBuilder.andWhere('groups.id IS NULL');
      } else {
        // Resources belonging to a specific group
        queryBuilder.andWhere('groups.id = :groupId', { groupId });
      }
    }

    // Handle search filtering (OR condition for name and description)
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        {
          search: `%${search}%`,
        },
      );
    }

    // Execute query with pagination
    const [resources, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: resources,
      total,
      page,
      limit,
    };
  }
}
