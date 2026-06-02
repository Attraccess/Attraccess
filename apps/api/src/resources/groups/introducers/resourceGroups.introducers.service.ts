import { InjectRepository } from '@nestjs/typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { ResourceIntroducer, ResourceIntroducerType } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroducerChangedEvent } from './events/resource-group-introducer-changed.event';

@Injectable()
export class ResourceGroupsIntroducersService {
  constructor(
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async getMany(groupId: number): Promise<ResourceIntroducer[]> {
    return this.resourceIntroducerRepository.find({
      where: {
        resourceGroup: {
          id: groupId,
        },
      },
      relations: ['user'],
    });
  }

  public async grant(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducer> {
    const existingIntroducer = await this.getByResourceGroupIdAndUserId(groupId, userId);

    if (existingIntroducer) {
      if (existingIntroducer.type !== type) {
        existingIntroducer.type = type;
        await this.resourceIntroducerRepository.save(existingIntroducer);
        this.eventEmitter.emit(
          ResourceGroupIntroducerChangedEvent.EVENT_NAME,
          new ResourceGroupIntroducerChangedEvent(groupId),
        );
      }
      return existingIntroducer;
    }

    const savedIntroducer = await this.createOne(groupId, userId, type);
    this.eventEmitter.emit(
      ResourceGroupIntroducerChangedEvent.EVENT_NAME,
      new ResourceGroupIntroducerChangedEvent(groupId),
    );
    return savedIntroducer;
  }

  private async createOne(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType,
  ): Promise<ResourceIntroducer> {
    const introducer = this.resourceIntroducerRepository.create({
      resourceGroup: { id: groupId },
      user: { id: userId },
      type,
    });

    return await this.resourceIntroducerRepository.save(introducer, { reload: true });
  }

  public async revoke(groupId: number, userId: number): Promise<ResourceIntroducer> {
    const introducer = await this.getByResourceGroupIdAndUserId(groupId, userId);

    if (!introducer) {
      return;
    }

    const savedIntroducer = await this.resourceIntroducerRepository.remove(introducer);
    this.eventEmitter.emit(
      ResourceGroupIntroducerChangedEvent.EVENT_NAME,
      new ResourceGroupIntroducerChangedEvent(groupId),
    );
    return savedIntroducer;
  }

  public async getByResourceGroupIdAndUserId(groupId: number, userId: number): Promise<ResourceIntroducer | null> {
    return await this.resourceIntroducerRepository.findOne({
      where: {
        resourceGroup: { id: groupId },
        user: { id: userId },
      },
    });
  }

  public async isIntroducer({ groupId, userId }: { groupId: number; userId: number }): Promise<boolean> {
    const introducer = await this.getByResourceGroupIdAndUserId(groupId, userId);

    return introducer?.type === ResourceIntroducerType.INTRODUCER;
  }
}
