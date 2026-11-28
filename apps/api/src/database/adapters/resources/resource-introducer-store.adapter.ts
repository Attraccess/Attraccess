import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Resource, ResourceIntroducer } from '@attraccess/database-entities';
import type { ResourceIntroducerRecord, ResourceIntroducerType } from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import type { ResourceIntroducerStore } from '../../../resources/introducers/resource-introducer-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';
import { toActorUser } from './maintenance-mappers';

export const toIntroducerRecord = (entity: ResourceIntroducer): ResourceIntroducerRecord => {
  const record: ResourceIntroducerRecord = {
    id: entity.id,
    type: entity.type,
    resourceId: entity.resourceId ?? null,
    userId: entity.userId,
    resourceGroupId: entity.resourceGroupId ?? null,
    grantedAt: entity.grantedAt,
  };
  if (entity.user !== undefined) record.user = toActorUser(entity.user);
  return record;
};

@Injectable()
export class TypeOrmResourceIntroducerStore implements ResourceIntroducerStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private repository(context?: ResourcePersistenceContext) {
    return managerFor(context, this.dataSource.manager, this.unitOfWork).getRepository(ResourceIntroducer);
  }

  async findDirect(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
    context?: ResourcePersistenceContext,
  ): Promise<ResourceIntroducerRecord | null> {
    const entity = await this.repository(context).findOne({
      where: { resourceId, userId, ...(type ? { type } : {}) },
    });
    return entity ? toIntroducerRecord(entity) : null;
  }

  async hasGroupGrant(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType | null,
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    const query = this.repository(context)
      .createQueryBuilder('introducer')
      .leftJoin('introducer.resourceGroup', 'group')
      .leftJoin('group.resources', 'resource')
      .where('resource.id = :resourceId', { resourceId })
      .andWhere('introducer.userId = :userId', { userId });
    if (type !== null) query.andWhere('introducer.type = :requiredType', { requiredType: type });
    return (await query.getMany()).length > 0;
  }

  async listDirect(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord[]> {
    const rows = await this.repository().find({
      where: { resourceId, ...(type ? { type } : {}) },
      relations: { user: true },
    });
    return rows.map(toIntroducerRecord);
  }

  async listViaGroups(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord[]> {
    const query = this.repository()
      .createQueryBuilder('introducer')
      .leftJoinAndSelect('introducer.user', 'user')
      .innerJoin('introducer.resourceGroup', 'group')
      .innerJoin('group.resources', 'resource')
      .where('resource.id = :resourceId', { resourceId });
    if (type) query.andWhere('introducer.type = :type', { type });
    return (await query.getMany()).map(toIntroducerRecord);
  }

  async listDirectForResources(
    resourceIds: number[],
    type?: ResourceIntroducerType,
  ): Promise<ResourceIntroducerRecord[]> {
    const rows = await this.repository().find({
      where: { resourceId: In(resourceIds), ...(type ? { type } : {}) },
      relations: { user: true },
    });
    return rows.map(toIntroducerRecord);
  }

  async listViaGroupsForResources(
    resourceIds: number[],
    type?: ResourceIntroducerType,
  ): Promise<Array<{ resourceId: number; grant: ResourceIntroducerRecord }>> {
    const query = this.repository()
      .createQueryBuilder('introducer')
      .leftJoinAndSelect('introducer.user', 'user')
      .innerJoin('introducer.resourceGroup', 'group')
      .innerJoin('group.resources', 'resource')
      .where('resource.id IN (:...resourceIds)', { resourceIds })
      .addSelect('resource.id', 'resourceId');
    if (type) query.andWhere('introducer.type = :type', { type });

    // Preserve TypeORM's introducer_id alias: entity hydration needs the primary key.
    const { raw, entities } = await query.getRawAndEntities();
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return raw.flatMap((row: { introducer_id: number | string; resourceId: number | string }) => {
      const entity = byId.get(Number(row.introducer_id));
      return entity ? [{ resourceId: Number(row.resourceId), grant: toIntroducerRecord(entity) }] : [];
    });
  }

  async insert(resourceId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducerRecord> {
    const repository = this.repository();
    return toIntroducerRecord(await repository.save(repository.create({ resourceId, userId, type })));
  }

  async remove(grantId: number): Promise<void> {
    await this.repository().delete({ id: grantId });
  }

  async findResourceName(resourceId: number): Promise<string | null> {
    const resource = await this.dataSource
      .getRepository(Resource)
      .findOne({ where: { id: resourceId }, select: { id: true, name: true } });
    return resource?.name ?? null;
  }
}
