import { BadRequestException, Injectable, Logger, ForbiddenException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import { Resource, SupervisionMode } from '@attraccess/database-entities';
import { CreateResourceDto } from './dtos/createResource.dto';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { PaginatedResponse } from '../types/response';
import { ResourceImageService } from './resourceImage.service';
import { FileUpload } from '../common/types/file-upload.types';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { LicenseError, LicenseService } from '../license/license.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceChangedEvent } from './events/resource-changed.event';
import { MetricsService } from '../metrics/metrics.service';
import { AuditService } from '../audit/audit.service';

const MAX_AUDIT_DETAILS_BYTES = 4096;

function auditResourceName(name: string, maxJsonBytes: number): string {
  if (Buffer.byteLength(JSON.stringify(name), 'utf8') <= maxJsonBytes) return name;

  const suffix = '...';
  let result = '';
  for (const character of name) {
    if (Buffer.byteLength(JSON.stringify(result + character + suffix), 'utf8') > maxJsonBytes) break;
    result += character;
  }
  return result + suffix;
}

function auditResourceNames(names: Record<string, string>, details: Record<string, string>): Record<string, string> {
  const emptyNames = Object.fromEntries(Object.keys(names).map((key) => [key, '']));
  const availableBytes = MAX_AUDIT_DETAILS_BYTES - Buffer.byteLength(JSON.stringify({ ...details, ...emptyNames }), 'utf8');
  const maxJsonBytes = Math.floor(availableBytes / Object.keys(names).length);
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [key, auditResourceName(name, maxJsonBytes)]));
}

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly resourceImageService: ResourceImageService,
    private readonly licenseService: LicenseService,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
    private readonly audit: AuditService,
  ) {}

  async createResource(
    dto: CreateResourceDto,
    image?: FileUpload,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<Resource> {
    // verifying usage limits
    const currentAmountOfResources = await this.resourceRepository.count();
    try {
      await this.licenseService.verifyLicense({
        usageLimits: {
          resources: currentAmountOfResources,
        },
      });
    } catch (error) {
      if (error instanceof LicenseError) {
        this.logger.warn(`Blocking resource creation due to license: ${error.reason}`);
        throw new ForbiddenException(error.reason);
      }
      throw error;
    }

    const resource = this.resourceRepository.create({
      name: dto.name,
      description: dto.description,
      documentationType: dto.documentationType || null,
      documentationMarkdown: dto.documentationMarkdown || null,
      documentationUrl: dto.documentationUrl || null,
      allowTakeOver: dto.allowTakeOver || false,
      type: dto.type,
      separateUnlockAndUnlatch: dto.separateUnlockAndUnlatch || false,
      metadata: dto.metadata ?? null,
      retrainingMaxAgeDays: dto.retrainingMaxAgeDays ?? null,
      retrainingMaxInactivityDays: dto.retrainingMaxInactivityDays ?? null,
      retrainingBlocksAccess: dto.retrainingBlocksAccess ?? false,
      supervisionMode: dto.supervisionMode ?? SupervisionMode.INTRODUCTION_REQUIRED,
      supervisedUsagesUntilIntroduction: dto.supervisedUsagesUntilIntroduction ?? null,
      autoIntroductionTarget: dto.autoIntroductionTarget ?? null,
      autoIntroductionGroupId: dto.autoIntroductionGroupId ?? null,
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

    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(resource.id));
    this.metricsService.resourcesTotal.inc();
    if (actor) {
      await this.audit.recordResource({
        action: 'resource.created', actorId: actor.id, authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId, subjectId: resource.id,
        details: { ...auditResourceNames({ 'after.name': resource.name }, { 'after.type': resource.type }), 'after.type': resource.type },
      });
    }

    return resource;
  }

  async getResourceById<Tid extends number | number[]>(
    idOrArrayOfIds: Tid,
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

  async updateResource(
    id: number,
    dto: UpdateResourceDto,
    image?: FileUpload,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<Resource> {
    const resource = await this.getResourceById(id);
    const before = {
      name: resource.name,
      type: resource.type,
      separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
      description: resource.description,
      documentationType: resource.documentationType,
      documentationMarkdown: resource.documentationMarkdown,
      documentationUrl: resource.documentationUrl,
      metadata: resource.metadata,
      imageFilename: resource.imageFilename,
      allowTakeOver: resource.allowTakeOver,
      retrainingMaxAgeDays: resource.retrainingMaxAgeDays,
      retrainingMaxInactivityDays: resource.retrainingMaxInactivityDays,
      retrainingBlocksAccess: resource.retrainingBlocksAccess,
      supervisionMode: resource.supervisionMode,
      supervisedUsagesUntilIntroduction: resource.supervisedUsagesUntilIntroduction,
      autoIntroductionTarget: resource.autoIntroductionTarget,
      autoIntroductionGroupId: resource.autoIntroductionGroupId,
    };

    // Update only provided fields
    if (dto.name !== undefined) resource.name = dto.name;
    if (dto.type !== undefined) resource.type = dto.type;
    if (dto.separateUnlockAndUnlatch !== undefined) resource.separateUnlockAndUnlatch = dto.separateUnlockAndUnlatch;
    if (dto.description !== undefined) resource.description = dto.description;
    if (dto.metadata !== undefined) resource.metadata = dto.metadata;

    // Handle documentation fields
    if (dto.documentationType !== undefined) resource.documentationType = dto.documentationType;
    if (dto.documentationMarkdown !== undefined) resource.documentationMarkdown = dto.documentationMarkdown;
    if (dto.documentationUrl !== undefined) resource.documentationUrl = dto.documentationUrl;

    // Handle allowTakeOver field
    if (dto.allowTakeOver !== undefined) resource.allowTakeOver = dto.allowTakeOver;

    if (dto.retrainingMaxAgeDays !== undefined) resource.retrainingMaxAgeDays = dto.retrainingMaxAgeDays;
    if (dto.retrainingMaxInactivityDays !== undefined)
      resource.retrainingMaxInactivityDays = dto.retrainingMaxInactivityDays;
    if (dto.retrainingBlocksAccess !== undefined) resource.retrainingBlocksAccess = dto.retrainingBlocksAccess;

    // Supervision + auto-promotion settings
    if (dto.supervisionMode !== undefined) resource.supervisionMode = dto.supervisionMode;
    if (dto.supervisedUsagesUntilIntroduction !== undefined)
      resource.supervisedUsagesUntilIntroduction = dto.supervisedUsagesUntilIntroduction;
    if (dto.autoIntroductionTarget !== undefined) resource.autoIntroductionTarget = dto.autoIntroductionTarget;
    if (dto.autoIntroductionGroupId !== undefined) resource.autoIntroductionGroupId = dto.autoIntroductionGroupId;

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

    const updatedResource = await this.resourceRepository.save(resource);
    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(updatedResource.id));
    if (actor) {
      const changedFields = [
        ...(before.name !== updatedResource.name ? ['name'] : []),
        ...(before.type !== updatedResource.type ? ['type'] : []),
        ...(before.separateUnlockAndUnlatch !== updatedResource.separateUnlockAndUnlatch ? ['separateUnlockAndUnlatch'] : []),
        ...(before.description !== updatedResource.description ? ['description'] : []),
        ...(before.documentationType !== updatedResource.documentationType ||
        before.documentationMarkdown !== updatedResource.documentationMarkdown ||
        before.documentationUrl !== updatedResource.documentationUrl ? ['documentation'] : []),
        ...(JSON.stringify(before.metadata) !== JSON.stringify(updatedResource.metadata) ? ['metadata'] : []),
        ...(before.imageFilename !== updatedResource.imageFilename ? ['image'] : []),
        ...(before.allowTakeOver !== updatedResource.allowTakeOver ? ['allowTakeOver'] : []),
        ...(before.retrainingMaxAgeDays !== updatedResource.retrainingMaxAgeDays ? ['retrainingMaxAgeDays'] : []),
        ...(before.retrainingMaxInactivityDays !== updatedResource.retrainingMaxInactivityDays ? ['retrainingMaxInactivityDays'] : []),
        ...(before.retrainingBlocksAccess !== updatedResource.retrainingBlocksAccess ? ['retrainingBlocksAccess'] : []),
        ...(before.supervisionMode !== updatedResource.supervisionMode ? ['supervisionMode'] : []),
        ...(before.supervisedUsagesUntilIntroduction !== updatedResource.supervisedUsagesUntilIntroduction ? ['supervisedUsagesUntilIntroduction'] : []),
        ...(before.autoIntroductionTarget !== updatedResource.autoIntroductionTarget ? ['autoIntroductionTarget'] : []),
        ...(before.autoIntroductionGroupId !== updatedResource.autoIntroductionGroupId ? ['autoIntroductionGroupId'] : []),
      ];
      const details: Record<string, string> = changedFields.length ? { changedFields: JSON.stringify(changedFields) } : {};
      if (before.type !== updatedResource.type) {
        details['before.type'] = before.type;
        details['after.type'] = updatedResource.type;
      }
      if (before.name !== updatedResource.name) {
        Object.assign(details, auditResourceNames(
          { 'before.name': before.name, 'after.name': updatedResource.name },
          details,
        ));
      }
      if (Object.keys(details).length) {
        await this.audit.recordResource({
          action: 'resource.updated', actorId: actor.id, authenticationMethod: actor.authenticationMethod,
          apiTokenId: actor.apiTokenId, subjectId: updatedResource.id, details,
        });
      }
    }
    return updatedResource;
  }

  async deleteResource(
    id: number,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<void> {
    const resource = actor ? await this.getResourceById(id) : undefined;
    const result = await this.resourceRepository.softDelete(id);
    if (result.affected === 0) {
      throw new ResourceNotFoundException(id);
    }

    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(id));
    this.metricsService.resourcesTotal.dec();
    if (actor && resource) {
      await this.audit.recordResource({
        action: 'resource.deleted', actorId: actor.id, authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId, subjectId: id,
        details: { ...auditResourceNames({ 'before.name': resource.name }, { 'before.type': resource.type }), 'before.type': resource.type },
      });
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
      .orderBy('resource.name', 'ASC');

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
        }),
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
         AND laterResourceIntroductionHistory.createdAt > resourceIntroductionHistory.createdAt',
      );

      queryBuilder.leftJoin('resource.groups', 'resourceGroup');
      queryBuilder.leftJoin('resourceGroup.introducers', 'groupIntroducer');
      queryBuilder.leftJoin('resourceGroup.introductions', 'groupIntroduction');
      queryBuilder.leftJoin('groupIntroduction.history', 'groupIntroductionHistory');
      queryBuilder.leftJoin(
        'groupIntroduction.history',
        'laterGroupIntroductionHistory',
        'laterGroupIntroductionHistory.introductionId = groupIntroductionHistory.introductionId \
         AND laterGroupIntroductionHistory.createdAt > groupIntroductionHistory.createdAt',
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
            }),
          );

          // Group introductions (users who received introduction to resource group)
          resourceQb.orWhere(
            new Brackets((groupIntroductionQb) => {
              groupIntroductionQb
                .where('groupIntroduction.receiverUserId = :userId', { userId: onlyWithPermissionForUserId })
                .andWhere('groupIntroductionHistory.action = :action', { action: 'grant' })
                .andWhere('laterGroupIntroductionHistory.id IS NULL');
            }),
          );
        }),
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
        },
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
