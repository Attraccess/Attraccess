import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import { Resource } from '@attraccess/database-entities';
import { CreateResourceDto } from './dtos/createResource.dto';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { PaginatedResponse } from '../types/response';
import { ResourceImageService } from './resourceImage.service';
import { FileUpload } from '../common/types/file-upload.types';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly resourceImageService: ResourceImageService
  ) {}

  async createResource(dto: CreateResourceDto, image?: FileUpload): Promise<Resource> {
    const resource = this.resourceRepository.create({
      name: dto.name,
      description: dto.description,
      documentationType: dto.documentationType || null,
      documentationMarkdown: dto.documentationMarkdown || null,
      documentationUrl: dto.documentationUrl || null,
      allowTakeOver: dto.allowTakeOver || false,
    });

    // Save the resource first to get an ID
    await this.resourceRepository.save(resource);

    if (image) {
      resource.imageFilename = await this.resourceImageService.saveImage(resource.id, image);
      await this.resourceRepository.save(resource).catch(async (error) => {
        // delete the resource if the image save fails
        await this.resourceRepository.delete(resource.id);
        throw error;
      });
    }

    return resource;
  }

  async getResourceById<Tid extends number | number[]>(
    idOrArrayOfIds: Tid
  ): Promise<Tid extends number ? Resource | null : Resource[]> {
    const arrayOfIds: number[] = Array.isArray(idOrArrayOfIds) ? idOrArrayOfIds : [idOrArrayOfIds];

    if (arrayOfIds.length === 0) {
      return (typeof idOrArrayOfIds === 'number' ? null : ([] as Resource[])) as Tid extends number
        ? Resource | null
        : Resource[];
    }

    const resources = await this.resourceRepository.find({
      where: { id: In(arrayOfIds) },
      relations: ['introductions', 'usages', 'groups'],
    });

    if (resources.length !== arrayOfIds.length) {
      throw new ResourceNotFoundException(arrayOfIds.find((id) => !resources.some((resource) => resource.id === id)));
    }

    return (typeof idOrArrayOfIds === 'number' ? resources[0] : resources) as Tid extends number
      ? Resource
      : Resource[];
  }

  async updateResource(id: number, dto: UpdateResourceDto, image?: FileUpload): Promise<Resource> {
    const resource = await this.getResourceById(id);

    // Update only provided fields
    if (dto.name !== undefined) resource.name = dto.name;
    if (dto.description !== undefined) resource.description = dto.description;

    // Handle documentation fields
    if (dto.documentationType !== undefined) resource.documentationType = dto.documentationType;
    if (dto.documentationMarkdown !== undefined) resource.documentationMarkdown = dto.documentationMarkdown;
    if (dto.documentationUrl !== undefined) resource.documentationUrl = dto.documentationUrl;

    // Handle allowTakeOver field
    if (dto.allowTakeOver !== undefined) resource.allowTakeOver = dto.allowTakeOver;

    if (image && dto.deleteImage) {
      throw new BadRequestException('Image and deleteImage cannot be used together');
    }

    if (image) {
      // Delete old image if it exists
      if (resource.imageFilename) {
        await this.resourceImageService.deleteImage(id, resource.imageFilename);
      }
      resource.imageFilename = await this.resourceImageService.saveImage(id, image);
    }

    if (dto.deleteImage && resource.imageFilename) {
      await this.resourceImageService.deleteImage(id, resource.imageFilename);
      resource.imageFilename = null;
    }

    return this.resourceRepository.save(resource);
  }

  async deleteResource(id: number): Promise<void> {
    const resource = await this.getResourceById(id);

    // Delete associated image if it exists
    if (resource.imageFilename) {
      await this.resourceImageService.deleteImage(id, resource.imageFilename);
    }

    const result = await this.resourceRepository.delete(id);
    if (result.affected === 0) {
      throw new ResourceNotFoundException(id);
    }
  }

  async listResources(options?: {
    page?: number;
    limit?: number;
    search?: string;
    groupId?: number;
    ids?: number[] | number;
    onlyInUseByUserId?: number;
    onlyWithPermissionForUserId?: number;
    onlyInUse?: boolean;
    returnUsingUser?: boolean;
  }): Promise<PaginatedResponse<Resource>> {
    if (!options) {
      options = {};
    }

    const {
      page = 1,
      limit = 10,
      search,
      groupId,
      onlyInUseByUserId,
      onlyWithPermissionForUserId,
      onlyInUse,
      returnUsingUser,
    } = options;

    let ids = options.ids;
    if (typeof ids === 'number') {
      ids = [ids];
    }

    // Create the query builder
    const queryBuilder = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.groups', 'groups')
      .orderBy('resource.createdAt', 'DESC');

    if (onlyInUse || onlyInUseByUserId !== undefined || returnUsingUser) {
      if (returnUsingUser) {
        queryBuilder.leftJoinAndSelect('resource.usages', 'usage');
      } else {
        queryBuilder.leftJoin('resource.usages', 'usage', 'usage.endTime IS NULL');
      }
    }

    if (returnUsingUser) {
      queryBuilder.leftJoinAndSelect('usage.user', 'usingUser');
    }

    if (onlyInUse) {
      queryBuilder.andWhere('usage.endTime IS NULL').andWhere('usage.startTime IS NOT NULL');
    }

    if (onlyInUseByUserId !== undefined) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('usage.userId = :userId', { userId: onlyInUseByUserId });
          qb.andWhere('usage.endTime IS NULL');
        })
      );
    }

    if (onlyWithPermissionForUserId !== undefined) {
      queryBuilder.leftJoin('resource.introducers', 'introducer');

      queryBuilder.leftJoin('resource.introductions', 'introduction');
      queryBuilder.leftJoin('introduction.history', 'resourceIntroductionHistory');
      queryBuilder.leftJoin(
        'introduction.history',
        'laterResourceIntroductionHistory',
        'laterResourceIntroductionHistory.introductionId = resourceIntroductionHistory.introductionId \
         AND laterResourceIntroductionHistory.createdAt > resourceIntroductionHistory.createdAt'
      );

      queryBuilder.leftJoin('resource.groups', 'resourceGroup');
      queryBuilder.leftJoin('resourceGroup.introducers', 'groupIntroducer');
      queryBuilder.leftJoin('resourceGroup.introductions', 'groupIntroduction');
      queryBuilder.leftJoin('groupIntroduction.history', 'groupIntroductionHistory');
      queryBuilder.leftJoin(
        'groupIntroduction.history',
        'laterGroupIntroductionHistory',
        'laterGroupIntroductionHistory.introductionId = groupIntroductionHistory.introductionId \
         AND laterGroupIntroductionHistory.createdAt > groupIntroductionHistory.createdAt'
      );

      queryBuilder.andWhere(
        new Brackets((resourceQb) => {
          // Direct resource introducers
          resourceQb.where('introducer.userId = :userId', { userId: onlyWithPermissionForUserId });

          // Group introducers
          resourceQb.orWhere('groupIntroducer.userId = :userId', { userId: onlyWithPermissionForUserId });

          // Direct resource introductions (users who received introduction to specific resource)
          resourceQb.orWhere(
            new Brackets((introductionQb) => {
              introductionQb
                .where('introduction.receiverUserId = :userId', { userId: onlyWithPermissionForUserId })
                .andWhere('resourceIntroductionHistory.action = :action', { action: 'grant' })
                .andWhere('laterResourceIntroductionHistory.id IS NULL');
            })
          );

          // Group introductions (users who received introduction to resource group)
          resourceQb.orWhere(
            new Brackets((groupIntroductionQb) => {
              groupIntroductionQb
                .where('groupIntroduction.receiverUserId = :userId', { userId: onlyWithPermissionForUserId })
                .andWhere('groupIntroductionHistory.action = :action', { action: 'grant' })
                .andWhere('laterGroupIntroductionHistory.id IS NULL');
            })
          );
        })
      );
    }

    // Handle IDs filtering
    if (ids && ids.length > 0) {
      queryBuilder.andWhere('resource.id IN (:...ids)', { ids });
    }

    // Handle group filtering
    if (groupId !== undefined) {
      if (groupId === -1) {
        // Special case: resources with no groups
        queryBuilder.andWhere('groups.id IS NULL');
      } else {
        // Resources belonging to a specific group
        queryBuilder.andWhere('groups.id = :groupId', { groupId });
      }
    }

    // Handle search filtering (OR condition for name and description)
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        {
          search: `%${search}%`,
        }
      );
    }

    // Execute query with pagination
    const [resources, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: resources,
      total,
      page,
      limit,
    };
  }
}
