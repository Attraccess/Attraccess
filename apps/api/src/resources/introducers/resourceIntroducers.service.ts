import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { ResourceIntroducerWritingImplementation } from './resource-introducer-writing';

@Injectable()
export class ResourceIntroducersService extends ResourceIntroducerWritingImplementation {
  protected readonly logger = new Logger(ResourceIntroducersService.name);

  constructor(
    @InjectRepository(ResourceIntroducer)
    protected readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly notifications: NotificationDispatchService,
  ) {
    super();
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

    // A user can have both roles; prefer a direct grant over an inherited grant of the same role.
    const byUserAndType = new Map<string, ResourceIntroducer>();
    for (const introducer of [...directIntroducers, ...groupIntroducers]) {
      if (!introducer.user) continue;
      const key = `${introducer.userId}:${introducer.type}`;
      if (!byUserAndType.has(key)) {
        byUserAndType.set(key, introducer);
      }
    }

    return Array.from(byUserAndType.values());
  }

  public async getByResourceIdAndUserId(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroducer | null> {
    const resourceIntroducerRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceIntroducer)
      : this.resourceIntroducerRepository;

    return await resourceIntroducerRepository.findOne({ where: { resourceId, userId, ...(type ? { type } : {}) } });
  }
}
