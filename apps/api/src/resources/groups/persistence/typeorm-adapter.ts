import {
  ResourceIntroducer,
  ResourceIntroducerType,
  ResourceGroup,
  Resource,
  ResourceIntroduction,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { GroupIntroducerPersistence, GroupPersistence } from './port';

@Injectable()
export class TypeormGroupIntroducerPersistence extends GroupIntroducerPersistence {
  constructor(@InjectRepository(ResourceIntroducer) private readonly introducers: Repository<ResourceIntroducer>) {
    super();
  }
  async grants(groupId: number): Promise<ResourceIntroducer[]> {
    return toApplicationRecord(
      await this.introducers.find({ where: { resourceGroup: { id: groupId } }, relations: ['user'] }),
    );
  }
  async grant(groupId: number, userId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducer | null> {
    return toApplicationRecord(
      await this.introducers.findOne({
        where: { resourceGroup: { id: groupId }, user: { id: userId }, ...(type ? { type } : {}) },
      }),
    );
  }
  async createGrant(groupId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducer> {
    return toApplicationRecord(
      await this.introducers.save(
        this.introducers.create({ resourceGroup: { id: groupId }, user: { id: userId }, type }),
        { reload: true },
      ),
    );
  }
  async removeGrant(grant: ResourceIntroducer): Promise<ResourceIntroducer> {
    return toApplicationRecord(await this.introducers.remove(grant));
  }
}

const ACTIVE_GROUP_INTRODUCTION_SQL = `EXISTS (
    SELECT 1 FROM "resource_introduction" "rin"
    WHERE "rin"."resourceGroupId" = group.id AND "rin"."receiverUserId" = :userId
    AND (
      SELECT "h"."action" FROM "resource_introduction_history_item" "h"
      WHERE "h"."introductionId" = "rin"."id"
      ORDER BY "h"."createdAt" DESC, "h"."id" DESC
      LIMIT 1
    ) = 'grant'
  )`;
export class TypeormGroupPersistence extends GroupPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  private visibleQuery(userId?: number) {
    const query = this.manager.getRepository(ResourceGroup).createQueryBuilder('group');
    if (userId === undefined) return query;
    return query
      .where('group.isHidden = :notHidden', { notHidden: false })
      .orWhere(
        `EXISTS (SELECT 1 FROM "resource_introducer" "ri" WHERE "ri"."resourceGroupId" = group.id AND "ri"."userId" = :userId)`,
        { userId },
      )
      .orWhere(ACTIVE_GROUP_INTRODUCTION_SQL, { userId });
  }
  async visibleGroups(userId?: number): Promise<ResourceGroup[]> {
    return toApplicationRecord(await this.visibleQuery(userId).getMany());
  }
  async hasVisibleResources(userId?: number): Promise<boolean> {
    const resources = this.manager.getRepository(Resource).createQueryBuilder('resource');
    if (userId === undefined) return resources.getExists();
    const groups = this.visibleQuery(userId).select('group.id');
    return resources
      .leftJoin('resource.groups', 'resourceGroup')
      .where('resourceGroup.id IS NULL')
      .orWhere(`resourceGroup.id IN (${groups.getQuery()})`)
      .setParameters(groups.getParameters())
      .getExists();
  }
  async group(id: number, withResources: boolean): Promise<ResourceGroup | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceGroup)
        .findOne({ where: { id }, relations: withResources ? ['resources'] : undefined }),
    );
  }
  async resource(id: number): Promise<Resource | null> {
    return toApplicationRecord(await this.manager.getRepository(Resource).findOne({ where: { id } }));
  }
  async createGroup(data: Partial<ResourceGroup>): Promise<ResourceGroup> {
    const repo = this.manager.getRepository(ResourceGroup);
    return toApplicationRecord(await repo.save(repo.create(data)));
  }
  async saveGroup(data: Partial<ResourceGroup>): Promise<ResourceGroup> {
    return toApplicationRecord(await this.manager.getRepository(ResourceGroup).save(data));
  }
  async deleteGroup(id: number): Promise<number> {
    return (await this.manager.getRepository(ResourceGroup).delete(id)).affected ?? 0;
  }
  introducerCount(groupId: number, userId: number): Promise<number> {
    return this.manager.getRepository(ResourceIntroducer).count({ where: { resourceGroupId: groupId, userId } });
  }
  async hasActiveIntroduction(groupId: number, userId: number): Promise<boolean> {
    const rows = await this.manager.getRepository(ResourceIntroduction).query(
      `SELECT 1 FROM "resource_introduction" "rin"
       WHERE "rin"."resourceGroupId" = ? AND "rin"."receiverUserId" = ?
       AND (
         SELECT "h"."action" FROM "resource_introduction_history_item" "h"
         WHERE "h"."introductionId" = "rin"."id"
         ORDER BY "h"."createdAt" DESC, "h"."id" DESC
         LIMIT 1
       ) = 'grant'
       LIMIT 1`,
      [groupId, userId],
    );
    return rows.length > 0;
  }
  async groupsOfResource(resourceId: number): Promise<ResourceGroup[]> {
    return toApplicationRecord(
      await this.manager.getRepository(ResourceGroup).find({ where: { resources: { id: resourceId } } }),
    );
  }
}
