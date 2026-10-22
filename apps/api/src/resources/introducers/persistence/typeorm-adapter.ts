import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { EntityManager, In } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { ResourceIntroducerPersistence, InheritedResourceGrant } from './port';
export class TypeormResourceIntroducerPersistence extends ResourceIntroducerPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async directGrants(resourceIds: readonly number[], type?: ResourceIntroducerType): Promise<ResourceIntroducer[]> {
    if (!resourceIds.length) return [];
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceIntroducer)
        .find({
          where: {
            resourceId: resourceIds.length === 1 ? resourceIds[0] : In([...resourceIds]),
            ...(type ? { type } : {}),
          },
          relations: ['user'],
        }),
    );
  }
  async groupGrants(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducer[]> {
    const query = this.manager
      .getRepository(ResourceIntroducer)
      .createQueryBuilder('introducer')
      .leftJoinAndSelect('introducer.user', 'user')
      .innerJoin('introducer.resourceGroup', 'group')
      .innerJoin('group.resources', 'resource')
      .where('resource.id = :resourceId', { resourceId });
    if (type) query.andWhere('introducer.type = :type', { type });
    return toApplicationRecord(await query.getMany());
  }
  async inheritedGrants(
    resourceIds: readonly number[],
    type?: ResourceIntroducerType,
  ): Promise<InheritedResourceGrant[]> {
    if (!resourceIds.length) return [];
    const query = this.manager
      .getRepository(ResourceIntroducer)
      .createQueryBuilder('introducer')
      .leftJoinAndSelect('introducer.user', 'user')
      .innerJoin('introducer.resourceGroup', 'group')
      .innerJoin('group.resources', 'resource')
      .where('resource.id IN (:...resourceIds)', { resourceIds: [...resourceIds] })
      .addSelect('resource.id', 'resourceId');
    if (type) query.andWhere('introducer.type = :type', { type });
    // TypeORM's primary-key alias is required for hydration, and never crosses this port.
    const { raw, entities } = await query.getRawAndEntities();
    const grants = new Map(entities.map((grant) => [grant.id, grant]));
    return raw.flatMap(({ introducer_id: grantId, resourceId }) => {
      const grant = grants.get(Number(grantId));
      return grant ? [{ resourceId: Number(resourceId), grant: toApplicationRecord(grant) }] : [];
    });
  }
  async directGrant(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
  ): Promise<ResourceIntroducer | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceIntroducer)
        .findOne({ where: { resourceId, userId, ...(type ? { type } : {}) } }),
    );
  }
  async hasGroupGrant(resourceId: number, userId: number, type: ResourceIntroducerType | null): Promise<boolean> {
    const query = this.manager
      .getRepository(ResourceIntroducer)
      .createQueryBuilder('introducer')
      .leftJoin('introducer.resourceGroup', 'group')
      .leftJoin('group.resources', 'resource')
      .where('resource.id = :resourceId', { resourceId })
      .andWhere('introducer.userId = :userId', { userId });
    if (type !== null) query.andWhere('introducer.type = :requiredType', { requiredType: type });
    return (await query.getMany()).length > 0;
  }
  async recipient(userId: number): Promise<Pick<User, 'id' | 'locale'> | null> {
    return toApplicationRecord(
      await this.manager.getRepository(User).findOne({ where: { id: userId }, select: ['id', 'locale'] }),
    );
  }
  async createGrant(resourceId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducer> {
    const repo = this.manager.getRepository(ResourceIntroducer);
    return toApplicationRecord(await repo.save(repo.create({ resourceId, userId, type })));
  }
  async removeGrant(grant: ResourceIntroducer): Promise<void> {
    await this.manager.getRepository(ResourceIntroducer).remove(grant);
  }
}
