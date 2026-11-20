import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Resource, ResourceGroup, ResourceIntroducer, ResourceIntroduction } from '@attraccess/database-entities';
import type {
  ResourceGroupRecord,
  ResourceIntroducerRecord,
  ResourceIntroducerType,
} from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import type {
  GroupVisibilityContext,
  NewResourceGroup,
  ResourceGroupDetail,
  ResourceGroupIntroducerStore,
  ResourceGroupPatch,
  ResourceGroupStore,
} from '../../../resources/groups/resource-group-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';
import { toGroupRecord } from './introduction-mappers';
import { toIntroducerRecord } from './resource-introducer-store.adapter';
import { findRelations } from '../find-options';

/**
 * SQL fragment (for use against the `group` query-builder alias) that is true when the user has a currently valid
 * (latest history item = GRANT) introduction to the group. Uses the `:userId` named parameter.
 */
const ACTIVE_INTRODUCTION_EXISTS_SQL = `EXISTS (
    SELECT 1 FROM "resource_introduction" "rin"
    WHERE "rin"."resourceGroupId" = group.id AND "rin"."receiverUserId" = :userId
    AND (
      SELECT "h"."action" FROM "resource_introduction_history_item" "h"
      WHERE "h"."introductionId" = "rin"."id"
      ORDER BY "h"."createdAt" DESC, "h"."id" DESC
      LIMIT 1
    ) = 'grant'
  )`;

@Injectable()
export class TypeOrmResourceGroupStore implements ResourceGroupStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private get groups() {
    return this.dataSource.getRepository(ResourceGroup);
  }

  private visibleGroupsQuery(visibility?: GroupVisibilityContext) {
    const query = this.groups.createQueryBuilder('group');
    if (!visibility || visibility.canUpdateResources) return query;

    return query
      .where('group.isHidden = :notHidden', { notHidden: false })
      .orWhere(
        `EXISTS (SELECT 1 FROM "resource_introducer" "ri" WHERE "ri"."resourceGroupId" = group.id AND "ri"."userId" = :userId)`,
        { userId: visibility.userId },
      )
      .orWhere(ACTIVE_INTRODUCTION_EXISTS_SQL, { userId: visibility.userId });
  }

  async listVisible(visibility?: GroupVisibilityContext): Promise<ResourceGroupRecord[]> {
    return (await this.visibleGroupsQuery(visibility).getMany()).map(toGroupRecord);
  }

  async hasVisibleResources(visibility: GroupVisibilityContext): Promise<boolean> {
    const resources = this.dataSource.getRepository(Resource).createQueryBuilder('resource');
    if (visibility.canUpdateResources) return resources.getExists();

    const visibleGroups = this.visibleGroupsQuery(visibility).select('group.id');
    return resources
      .leftJoin('resource.groups', 'resourceGroup')
      .where('resourceGroup.id IS NULL')
      .orWhere(`resourceGroup.id IN (${visibleGroups.getQuery()})`)
      .setParameters(visibleGroups.getParameters())
      .getExists();
  }

  async findById(groupId: number, withResources = false): Promise<ResourceGroupDetail | null> {
    const group = await this.groups.findOne({
      where: { id: groupId },
      relations: findRelations(withResources ? ['resources'] : undefined),
    });
    if (!group) return null;
    return {
      ...toGroupRecord(group),
      ...(withResources ? { resources: (group.resources ?? []).map((resource) => ({ id: resource.id })) } : {}),
    };
  }

  async create(group: NewResourceGroup): Promise<ResourceGroupRecord> {
    return toGroupRecord(await this.groups.save(this.groups.create(group)));
  }

  async update(groupId: number, patch: ResourceGroupPatch): Promise<ResourceGroupRecord> {
    const group = await this.groups.findOneByOrFail({ id: groupId });
    return toGroupRecord(await this.groups.save(Object.assign(group, patch)));
  }

  async delete(groupId: number): Promise<number> {
    const result = await this.groups.delete(groupId);
    return result.affected ?? 0;
  }

  async userIsPartOfGroup(groupId: number, userId: number): Promise<boolean> {
    const introducerCount = await this.dataSource
      .getRepository(ResourceIntroducer)
      .count({ where: { resourceGroupId: groupId, userId } });
    if (introducerCount > 0) {
      return true;
    }

    const activeIntroductions = await this.dataSource.getRepository(ResourceIntroduction).query(
      `SELECT 1 FROM "resource_introduction" "rin"
       WHERE "rin"."resourceGroupId" = $1 AND "rin"."receiverUserId" = $2
       AND (
         SELECT "h"."action" FROM "resource_introduction_history_item" "h"
         WHERE "h"."introductionId" = "rin"."id"
         ORDER BY "h"."createdAt" DESC, "h"."id" DESC
         LIMIT 1
       ) = 'grant'
       LIMIT 1`,
      [groupId, userId],
    );
    return activeIntroductions.length > 0;
  }

  async resourceExists(resourceId: number): Promise<boolean> {
    return (await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } })) !== null;
  }

  async addResource(groupId: number, resourceId: number): Promise<void> {
    const group = await this.groups.findOneOrFail({ where: { id: groupId }, relations: { resources: true } });
    const resource = await this.dataSource.getRepository(Resource).findOneByOrFail({ id: resourceId });
    group.resources.push(resource);
    await this.groups.save(group);
  }

  async removeResource(groupId: number, resourceId: number): Promise<void> {
    const group = await this.groups.findOneOrFail({ where: { id: groupId }, relations: { resources: true } });
    group.resources = group.resources.filter((resource) => resource.id !== resourceId);
    await this.groups.save(group);
  }

  async groupsOfResource(resourceId: number, context?: ResourcePersistenceContext): Promise<ResourceGroupRecord[]> {
    const groups = await managerFor(context, this.dataSource.manager, this.unitOfWork)
      .getRepository(ResourceGroup)
      .find({ where: { resources: { id: resourceId } } });
    return groups.map(toGroupRecord);
  }
}

@Injectable()
export class TypeOrmResourceGroupIntroducerStore implements ResourceGroupIntroducerStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get repository() {
    return this.dataSource.getRepository(ResourceIntroducer);
  }

  async list(groupId: number): Promise<ResourceIntroducerRecord[]> {
    const rows = await this.repository.find({
      where: { resourceGroup: { id: groupId } },
      relations: { user: true },
    });
    return rows.map(toIntroducerRecord);
  }

  async find(groupId: number, userId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord | null> {
    const entity = await this.repository.findOne({
      where: { resourceGroup: { id: groupId }, user: { id: userId }, ...(type ? { type } : {}) },
    });
    return entity ? toIntroducerRecord(entity) : null;
  }

  async insert(groupId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducerRecord> {
    const saved = await this.repository.save(
      this.repository.create({ resourceGroup: { id: groupId }, user: { id: userId }, type }),
      { reload: true },
    );
    return toIntroducerRecord(saved);
  }

  async remove(grantId: number): Promise<void> {
    await this.repository.delete({ id: grantId });
  }
}
