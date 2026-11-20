import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { Resource, ResourceGroup, ResourceUsage } from '@attraccess/database-entities';
import type { RetrainingStore, RetrainingTarget } from '../../../resources/retraining/retraining-store.port';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';
import type { MassIntroductionTargetStore } from '../../../resources/mass-introductions/mass-introduction-target-store.port';

const toTarget = (entity: Resource | ResourceGroup): RetrainingTarget => ({
  id: entity.id,
  name: entity.name,
  retrainingMaxAgeDays: entity.retrainingMaxAgeDays,
  retrainingMaxInactivityDays: entity.retrainingMaxInactivityDays,
  retrainingBlocksAccess: entity.retrainingBlocksAccess,
});

@Injectable()
export class TypeOrmRetrainingStore implements RetrainingStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  /** The caller's transaction when it has one: a read made while a transaction is open must not take a second connection. */
  private manager(context?: ResourcePersistenceContext): EntityManager {
    return managerFor(context, this.dataSource.manager, this.unitOfWork);
  }

  async findResourceTarget(resourceId: number, context?: ResourcePersistenceContext): Promise<RetrainingTarget | null> {
    const resource = await this.manager(context)
      .getRepository(Resource)
      .findOne({ where: { id: resourceId } });
    return resource ? toTarget(resource) : null;
  }

  async findGroupTarget(groupId: number, context?: ResourcePersistenceContext): Promise<RetrainingTarget | null> {
    const group = await this.manager(context)
      .getRepository(ResourceGroup)
      .findOne({ where: { id: groupId } });
    return group ? toTarget(group) : null;
  }

  async lastResourceUseAt(
    resourceId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<Date | null> {
    const lastUsage = await this.manager(context)
      .getRepository(ResourceUsage)
      .findOne({
        where: { resourceId, userId, endTime: Not(IsNull()) },
        order: { endTime: 'DESC' },
      });
    return lastUsage?.endTime ?? null;
  }

  async lastGroupUseAt(groupId: number, userId: number, context?: ResourcePersistenceContext): Promise<Date | null> {
    const manager = this.manager(context);
    const group = await manager
      .getRepository(ResourceGroup)
      .findOne({ where: { id: groupId }, relations: { resources: true } });
    const resourceIds = (group?.resources ?? []).map((resource) => resource.id);
    if (resourceIds.length === 0) {
      return null;
    }

    const lastUsage = await manager.getRepository(ResourceUsage).findOne({
      where: { resourceId: In(resourceIds), userId, endTime: Not(IsNull()) },
      order: { endTime: 'DESC' },
    });
    return lastUsage?.endTime ?? null;
  }
}

@Injectable()
export class TypeOrmMassIntroductionTargetStore implements MassIntroductionTargetStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findResourceName(resourceId: number): Promise<{ id: number; name: string } | null> {
    const resource = await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } });
    return resource ? { id: resource.id, name: resource.name } : null;
  }

  async findGroupName(groupId: number): Promise<{ id: number; name: string } | null> {
    const group = await this.dataSource.getRepository(ResourceGroup).findOne({ where: { id: groupId } });
    return group ? { id: group.id, name: group.name } : null;
  }

  async resourceIdsOfGroup(groupId: number): Promise<number[]> {
    const resources = await this.dataSource
      .getRepository(Resource)
      .find({ where: { groups: { id: groupId } }, select: { id: true } });
    return resources.map((resource) => resource.id);
  }
}
