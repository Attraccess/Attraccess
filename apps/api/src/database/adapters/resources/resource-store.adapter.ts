import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, In } from 'typeorm';
import {
  DashboardPin,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceUsage,
} from '@attraccess/database-entities';
import type { ResourceRecord, ResourceType } from '@attraccess/application-models';
import type { ListResourcesQuery, NewResource, ResourceStore } from '../../../resources/resource-store.port';
import { activeUsageSql, activeUsageWhere } from '../usage/active-usage-queries';
import { toUsageSession } from '../usage/usage-session-mapping';
import { toResourceRecord as toResourceRecordBase } from './resource-mapping';
import { VIEWER_PARAMETER, permittedResourceSql } from './permitted-resource-sql';

/** A resource row as a record, with its embedded sessions mapped like every other session read. */
export const toResourceRecord = (entity: Resource): ResourceRecord => {
  const record = toResourceRecordBase(entity);
  if (entity.usages !== undefined) record.usages = entity.usages.map(toUsageSession);
  return record;
};

@Injectable()
export class TypeOrmResourceStore implements ResourceStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get resources() {
    return this.dataSource.getRepository(Resource);
  }

  async findDetailed(ids: number[]): Promise<ResourceRecord[]> {
    const rows = await this.resources.find({
      where: { id: In(ids) },
      relations: { introductions: true, usages: true, groups: true },
    });
    return rows.map(toResourceRecord);
  }

  async list(query: ListResourcesQuery): Promise<{ data: ResourceRecord[]; total: number }> {
    const {
      page,
      limit,
      search,
      groupId,
      ids,
      onlyInUseByUserId,
      onlyWithPermissionForUserId,
      permittedForUserId,
      onlyInUse,
      returnUsingUser,
    } = query;

    // Create the query builder
    const queryBuilder = this.resources
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.groups', 'groups')
      .orderBy('resource.name', 'ASC')
      // Same-named resources keep a stable order across pages.
      .addOrderBy('resource.id', 'ASC');

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

    if (permittedForUserId !== undefined) {
      queryBuilder.andWhere(permittedResourceSql('resource.id'), { [VIEWER_PARAMETER]: permittedForUserId });
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

    return { data: resources.map(toResourceRecord), total };
  }

  async permittedIds(userId: number, ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const rows = await this.resources
      .createQueryBuilder('resource')
      .select('resource.id', 'id')
      .where('resource.id IN (:...ids)', { ids })
      .andWhere(permittedResourceSql('resource.id'), { [VIEWER_PARAMETER]: userId })
      .getRawMany<{ id: number }>();
    return rows.map((row) => Number(row.id));
  }

  async count(): Promise<number> {
    return this.resources.count();
  }

  async create(resource: NewResource): Promise<ResourceRecord> {
    return toResourceRecord(await this.resources.save(this.resources.create(resource)));
  }

  async save(record: ResourceRecord): Promise<ResourceRecord> {
    // Writes only the columns; the relations the caller already loaded go back unchanged, so an
    // update does not read every usage session of the resource a second time.
    const entity = this.resources.create({
      id: record.id,
      name: record.name,
      type: record.type,
      separateUnlockAndUnlatch: record.separateUnlockAndUnlatch,
      accessOnly: record.accessOnly,
      description: record.description,
      imageFilename: record.imageFilename,
      documentationType: record.documentationType,
      documentationMarkdown: record.documentationMarkdown,
      documentationUrl: record.documentationUrl,
      metadata: record.metadata,
      allowTakeOver: record.allowTakeOver,
      maxParallelSessions: record.maxParallelSessions,
      retrainingMaxAgeDays: record.retrainingMaxAgeDays,
      retrainingMaxInactivityDays: record.retrainingMaxInactivityDays,
      retrainingBlocksAccess: record.retrainingBlocksAccess,
      supervisionMode: record.supervisionMode,
      supervisedUsagesUntilIntroduction: record.supervisedUsagesUntilIntroduction,
      autoIntroductionTarget: record.autoIntroductionTarget,
      autoIntroductionGroupId: record.autoIntroductionGroupId,
    });
    const saved = await this.resources.save(entity);
    return { ...record, updatedAt: saved.updatedAt ?? record.updatedAt };
  }

  async setImageFilename(resourceId: number, filename: string): Promise<void> {
    await this.resources.update(resourceId, { imageFilename: filename });
  }

  async hardDelete(resourceId: number): Promise<void> {
    await this.resources.delete(resourceId);
  }

  async softDelete(resourceId: number): Promise<number> {
    const result = await this.resources.softDelete(resourceId);
    const affected = result.affected ?? 0;
    if (affected === 0) return 0;
    // A soft delete keeps the row, so the database cannot cascade to the dashboard pins of the resource.
    await this.dataSource.manager.delete(DashboardPin, { itemType: 'resource', itemId: String(resourceId) });
    return affected;
  }

  async countFlowParts(resourceId: number): Promise<{ nodes: number; edges: number }> {
    const [nodes, edges] = await Promise.all([
      this.dataSource.manager.count(ResourceFlowNode, { where: { resourceId } }),
      this.dataSource.manager.count(ResourceFlowEdge, { where: { resourceId } }),
    ]);
    return { nodes, edges };
  }

  async existingIds(ids: number[]): Promise<number[]> {
    const rows = await this.resources.find({ where: { id: In(ids) }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async findCapacity(resourceId: number): Promise<{ type: ResourceType; maxParallelSessions: number } | null> {
    const row = await this.resources.findOne({
      where: { id: resourceId },
      select: { id: true, type: true, maxParallelSessions: true },
    });
    return row ? { type: row.type, maxParallelSessions: row.maxParallelSessions } : null;
  }

  async countActiveSessions(resourceId: number): Promise<number> {
    return this.dataSource.getRepository(ResourceUsage).count({ where: { resourceId, ...activeUsageWhere() } });
  }
}
