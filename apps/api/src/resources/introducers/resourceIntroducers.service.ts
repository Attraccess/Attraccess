import { ResourceIntroducer } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class ResourceIntroducersService {
  constructor(
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>
  ) {}

  public async getMany(resourceId: number): Promise<ResourceIntroducer[]> {
    return await this.resourceIntroducerRepository.find({ where: { resourceId }, relations: ['user'] });
  }

  public async getByResourceIdAndUserId(resourceId: number, userId: number): Promise<ResourceIntroducer | null> {
    return await this.resourceIntroducerRepository.findOne({ where: { resourceId, userId } });
  }

  public async grant(resourceId: number, userId: number): Promise<ResourceIntroducer> {
    const existingIntroducer = await this.getByResourceIdAndUserId(resourceId, userId);
    if (existingIntroducer) {
      return existingIntroducer;
    }

    const introducer = this.resourceIntroducerRepository.create({ resourceId, userId });
    return await this.resourceIntroducerRepository.save(introducer);
  }

  public async revoke(resourceId: number, userId: number): Promise<void> {
    const introducer = await this.getByResourceIdAndUserId(resourceId, userId);
    if (!introducer) {
      return;
    }

    await this.resourceIntroducerRepository.remove(introducer);
  }

  public async isIntroducer(resourceId: number, userId: number, includeGroups: boolean): Promise<boolean> {
    const introducer = await this.getByResourceIdAndUserId(resourceId, userId);

    if (introducer) {
      return true;
    }

    if (includeGroups) {
      const groupIntroducers = await this.resourceIntroducerRepository
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
