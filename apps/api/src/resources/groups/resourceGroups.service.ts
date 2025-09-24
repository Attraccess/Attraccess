import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Resource, ResourceGroup } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { CreateResourceGroupDto } from './dto/createGroup.dto';
import { UpdateResourceGroupDto } from './dto/updateGroup.dto';
import { ResourceGroupNotFoundException } from './errors/groupNotFound.error';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';

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
  ) {}

  public async createOne(dto: CreateResourceGroupDto): Promise<ResourceGroup> {
    const resourceGroup = this.resourceGroupRepository.create({
      name: dto.name,
      description: dto.description,
    });
    return await this.resourceGroupRepository.save(resourceGroup);
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

    return await this.resourceGroupRepository.save({
      ...resourceGroup,
      name: updateDto.name,
      description: updateDto.description,
    });
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
    await this.resourceGroupRepository.save(resourceGroup);
  }

  public async removeResource(groupId: number, resourceId: number): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    const resource = resourceGroup.resources.find((resource) => resource.id === resourceId);

    if (!resource) {
      return;
    }

    resourceGroup.resources = resourceGroup.resources.filter((resource) => resource.id !== resourceId);
    await this.resourceGroupRepository.save(resourceGroup);
  }

  public async deleteOne(groupId: number): Promise<void> {
    const result = await this.resourceGroupRepository.delete(groupId);
    if (result.affected === 0) {
      throw new ResourceGroupNotFoundException({ id: groupId });
    }
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
