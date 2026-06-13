import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ResourceIntroducerChangedEvent } from './events/resource-introducer-changed.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

@Injectable()
export class ResourceIntroducersService {
  private readonly logger = new Logger(ResourceIntroducersService.name);

  constructor(
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private notifyAccessChange(resourceId: number, userId: number, type: ResourceIntroducerType, granted: boolean): void {
    const role = type === ResourceIntroducerType.MAINTAINER ? 'maintainer' : 'introducer';
    void this.notifications.dispatch({
      category: NotificationCategory.ACCESS_CHANGES,
      recipients: [{ id: userId } as User],
      title: 'Your resource access changed',
      body: granted
        ? `You were made an ${role} for resource #${resourceId}.`.replace('an maintainer', 'a maintainer')
        : `Your ${role} status for resource #${resourceId} was revoked.`,
      url: `/resources/${resourceId}`,
      dedupeKey: `resource-access-${resourceId}-${userId}-${role}-${granted ? 'granted' : 'revoked'}`,
    }).catch((error) => {
      this.logger.error(`Failed to notify user ${userId} about resource access changes: ${(error as Error).message}`);
    });
  }

  public async getMany(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducer[]> {
    const directIntroducers = await this.resourceIntroducerRepository.find({
      where: { resourceId, ...(type ? { type } : {}) },
      relations: ['user'],
    });

    // Introducers granted at the group level apply to every resource in the group,
    // so they must be listed alongside the resource's own introducers.
    const groupQuery = this.resourceIntroducerRepository
      .createQueryBuilder('introducer')
      .leftJoinAndSelect('introducer.user', 'user')
      .innerJoin('introducer.resourceGroup', 'group')
      .innerJoin('group.resources', 'resource')
      .where('resource.id = :resourceId', { resourceId });

    if (type) {
      groupQuery.andWhere('introducer.type = :type', { type });
    }

    const groupIntroducers = await groupQuery.getMany();

    // A user can be both a direct and a group introducer; show them once.
    const byUserId = new Map<number, ResourceIntroducer>();
    for (const introducer of [...directIntroducers, ...groupIntroducers]) {
      if (!byUserId.has(introducer.userId)) {
        byUserId.set(introducer.userId, introducer);
      }
    }

    return Array.from(byUserId.values());
  }

  public async getByResourceIdAndUserId(
    resourceId: number,
    userId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroducer | null> {
    const resourceIntroducerRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceIntroducer)
      : this.resourceIntroducerRepository;

    return await resourceIntroducerRepository.findOne({ where: { resourceId, userId } });
  }

  public async grant(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducer> {
    const existingIntroducer = await this.getByResourceIdAndUserId(resourceId, userId);
    if (existingIntroducer) {
      if (existingIntroducer.type !== type) {
        existingIntroducer.type = type;
        await this.resourceIntroducerRepository.save(existingIntroducer);
        this.notifyAccessChange(resourceId, userId, type, true);
        this.eventEmitter.emit(
          ResourceIntroducerChangedEvent.EVENT_NAME,
          new ResourceIntroducerChangedEvent(resourceId, userId),
        );
      }
      return existingIntroducer;
    }

    const introducer = this.resourceIntroducerRepository.create({ resourceId, userId, type });
    const savedIntroducer = await this.resourceIntroducerRepository.save(introducer);
    this.notifyAccessChange(resourceId, userId, type, true);
    this.eventEmitter.emit(
      ResourceIntroducerChangedEvent.EVENT_NAME,
      new ResourceIntroducerChangedEvent(resourceId, userId),
    );
    return savedIntroducer;
  }

  public async revoke(resourceId: number, userId: number): Promise<void> {
    const introducer = await this.getByResourceIdAndUserId(resourceId, userId);
    if (!introducer) {
      return;
    }

    await this.resourceIntroducerRepository.remove(introducer);
    this.notifyAccessChange(resourceId, userId, introducer.type, false);
    this.eventEmitter.emit(
      ResourceIntroducerChangedEvent.EVENT_NAME,
      new ResourceIntroducerChangedEvent(resourceId, userId),
    );
  }

  public async isIntroducer(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    return this.hasAccess(resourceId, userId, includeGroups, ResourceIntroducerType.INTRODUCER, transactionalEntityManager);
  }

  public async canMaintain(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    return this.hasAccess(resourceId, userId, includeGroups, null, transactionalEntityManager);
  }

  private async hasAccess(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    requiredType: ResourceIntroducerType | null,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    const introducer = await this.getByResourceIdAndUserId(resourceId, userId, transactionalEntityManager);

    if (introducer && (requiredType === null || introducer.type === requiredType)) {
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
