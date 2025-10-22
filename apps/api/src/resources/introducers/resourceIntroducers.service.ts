import { ResourceIntroducer } from '@attraccess/database-entities';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ResourceIntroducerChangedEvent } from './events/resource-introducer-changed.event';

@Injectable()
export class ResourceIntroducersService {
  constructor(
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async getMany(resourceId: number): Promise<ResourceIntroducer[]> {
    return await this.resourceIntroducerRepository.find({ where: { resourceId }, relations: ['user'] });
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

  public async grant(resourceId: number, userId: number): Promise<ResourceIntroducer> {
    const existingIntroducer = await this.getByResourceIdAndUserId(resourceId, userId);
    if (existingIntroducer) {
      return existingIntroducer;
    }

    const introducer = this.resourceIntroducerRepository.create({ resourceId, userId });
    const savedIntroducer = await this.resourceIntroducerRepository.save(introducer);
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
    const introducer = await this.getByResourceIdAndUserId(resourceId, userId, transactionalEntityManager);

    if (introducer) {
      return true;
    }

    if (includeGroups) {
      const resourceIntroducerRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(ResourceIntroducer)
        : this.resourceIntroducerRepository;

      const groupIntroducers = await resourceIntroducerRepository
        .createQueryBuilder('introducer')
        .leftJoin('introducer.resourceGroup', 'group')
        .leftJoin('group.resources', 'resource')
        .where('resource.id = :resourceId', { resourceId })
        .andWhere('introducer.userId = :userId', { userId })
        .getMany();

      return groupIntroducers.length > 0;
    }

    return false;
  }
}
