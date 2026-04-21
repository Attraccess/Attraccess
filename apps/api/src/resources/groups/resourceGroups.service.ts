import { InjectRepository } from '@nestjs/typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { Resource, ResourceGroup } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { CreateResourceGroupDto } from './dto/createGroup.dto';
import { UpdateResourceGroupDto } from './dto/updateGroup.dto';
import { ResourceGroupNotFoundException } from './errors/groupNotFound.error';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroductionChangedEvent } from './introductions/events/resource-group-introduction-changed.event';
import { MetricsService } from '../../metrics/metrics.service';

interface GetOneSearchOptions {
  id: number;
}

@Injectable()
export class ResourceGroupsService {
  constructor(
    @InjectRepository(ResourceGroup)
    private readonly resourceGroupRepository: Repository<ResourceGroup>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
  ) {}

  public async createOne(dto: CreateResourceGroupDto): Promise<ResourceGroup> {
    const resourceGroup = this.resourceGroupRepository.create({
      name: dto.name,
      description: dto.description,
    });
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
    this.metricsService.resourceGroupsTotal.inc();
    return savedResourceGroup;
  }

  public async getMany(): Promise<ResourceGroup[]> {
    return await this.resourceGroupRepository.find();
  }

  public async getOne(searchOptions: GetOneSearchOptions, relations?: string[]): Promise<ResourceGroup> {
    const group = await this.resourceGroupRepository.findOne({
      where: {
        id: searchOptions.id,
      },

      relations,
    });

    if (!group) {
      throw new ResourceGroupNotFoundException({ id: searchOptions.id });
    }

    return group;
  }

  public async updateOneById(id: number, updateDto: UpdateResourceGroupDto): Promise<ResourceGroup> {
    const resourceGroup = await this.getOne({ id });

    const savedResourceGroup = await this.resourceGroupRepository.save({
      ...resourceGroup,
      name: updateDto.name,
      description: updateDto.description,
    });
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
    return savedResourceGroup;
  }

  public async addResource(groupId: number, resourceId: number): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);

    const existingResource = resourceGroup.resources.find((resource) => resource.id === resourceId);

    if (existingResource) {
      return;
    }

    const resource = await this.resourceRepository.findOne({
      where: {
        id: resourceId,
      },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    resourceGroup.resources.push(resource);
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
  }

  public async removeResource(groupId: number, resourceId: number): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    const resource = resourceGroup.resources.find((resource) => resource.id === resourceId);

    if (!resource) {
      return;
    }

    resourceGroup.resources = resourceGroup.resources.filter((resource) => resource.id !== resourceId);
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
  }

  public async deleteOne(groupId: number): Promise<void> {
    const result = await this.resourceGroupRepository.delete(groupId);
    if (result.affected === 0) {
      throw new ResourceGroupNotFoundException({ id: groupId });
    }
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(groupId),
    );
    this.metricsService.resourceGroupsTotal.dec();
  }

  public async getGroupsOfResource(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceGroup[]> {
    const resourceGroupRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceGroup)
      : this.resourceGroupRepository;

    return await resourceGroupRepository.find({
      where: {
        resources: {
          id: resourceId,
        },
      },
    });
  }
}
