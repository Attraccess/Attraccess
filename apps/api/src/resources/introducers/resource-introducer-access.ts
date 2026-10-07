import { ResourceIntroducer, ResourceIntroducerType } from '@attraccess/database-entities';
import { EntityManager, In } from 'typeorm';
import { ResourceIntroducersServiceRouteContext } from './resourceIntroducers.service.route-context';
export abstract class ResourceIntroducerAccessImplementation extends ResourceIntroducersServiceRouteContext {
  public async getManyForResources(
    resourceIds: number[],
    type?: ResourceIntroducerType,
  ): Promise<Map<number, ResourceIntroducer[]>> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    const introducersByResourceId = new Map<number, Map<number, ResourceIntroducer>>(
      uniqueResourceIds.map((resourceId) => [resourceId, new Map()]),
    );

    if (uniqueResourceIds.length === 0) {
      return new Map();
    }

    const directIntroducers = await this.resourceIntroducerRepository.find({
      where: { resourceId: In(uniqueResourceIds), ...(type ? { type } : {}) },
      relations: ['user'],
    });
    for (const introducer of directIntroducers) {
      if (introducer.user) introducersByResourceId.get(introducer.resourceId)?.set(introducer.userId, introducer);
    }

    const groupQuery = this.resourceIntroducerRepository
      .createQueryBuilder('introducer')
      .leftJoinAndSelect('introducer.user', 'user')
      .innerJoin('introducer.resourceGroup', 'group')
      .innerJoin('group.resources', 'resource')
      .where('resource.id IN (:...resourceIds)', { resourceIds: uniqueResourceIds })
      .addSelect('resource.id', 'resourceId');

    if (type) {
      groupQuery.andWhere('introducer.type = :type', { type });
    }

    // Preserve TypeORM's introducer_id alias: entity hydration needs the primary key.
    const { raw, entities: groupIntroducers } = await groupQuery.getRawAndEntities();
    const groupIntroducersById = new Map(groupIntroducers.map((introducer) => [introducer.id, introducer]));
    for (const { introducer_id: introducerId, resourceId } of raw) {
      const introducer = groupIntroducersById.get(Number(introducerId));
      if (introducer?.user) {
        introducersByResourceId.get(Number(resourceId))?.set(introducer.userId, introducer);
      }
    }

    return new Map(
      Array.from(introducersByResourceId, ([resourceId, introducers]) => [
        resourceId,
        Array.from(introducers.values()),
      ]),
    );
  }

  public async isIntroducer(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    return this.hasAccess(
      resourceId,
      userId,
      includeGroups,
      ResourceIntroducerType.INTRODUCER,
      transactionalEntityManager,
    );
  }

  public async canMaintain(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    return this.hasAccess(resourceId, userId, includeGroups, null, transactionalEntityManager);
  }

  protected async hasAccess(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    requiredType: ResourceIntroducerType | null,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    const introducer = await this.getByResourceIdAndUserId(
      resourceId,
      userId,
      requiredType ?? undefined,
      transactionalEntityManager,
    );

    if (introducer) {
      return true;
    }

    if (includeGroups) {
      const resourceIntroducerRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(ResourceIntroducer)
        : this.resourceIntroducerRepository;

      const query = resourceIntroducerRepository
        .createQueryBuilder('introducer')
        .leftJoin('introducer.resourceGroup', 'group')
        .leftJoin('group.resources', 'resource')
        .where('resource.id = :resourceId', { resourceId })
        .andWhere('introducer.userId = :userId', { userId });

      if (requiredType !== null) {
        query.andWhere('introducer.type = :requiredType', { requiredType });
      }

      const groupIntroducers = await query.getMany();

      return groupIntroducers.length > 0;
    }

    return false;
  }
}
