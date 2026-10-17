import { Resource, SupervisionMode } from '@attraccess/application-models';

import { Inject, Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { ResourceCatalogPersistence } from './persistence/port';

import { AuditService } from '../audit/audit.service';

import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';

import { LicenseService, LicenseError } from '../license/license.service';

import { MetricsService } from '../metrics/metrics.service';

import { ResourceImageService } from './resourceImage.service';

import { PaginatedResponse } from '../types/response';

import { FileUpload } from '../common/types/file-upload.types';

import { CreateResourceDto } from './dtos/createResource.dto';

import { UpdateResourceDto } from './dtos/updateResource.dto';

import { ResourceChangedEvent } from './events/resource-changed.event';

export const MAX_AUDIT_DETAILS_BYTES = 4096;

export function auditResourceName(name: string, maxJsonBytes: number): string {
  if (Buffer.byteLength(JSON.stringify(name), 'utf8') <= maxJsonBytes) return name;

  const suffix = '...';
  let result = '';
  for (const character of name) {
    if (Buffer.byteLength(JSON.stringify(result + character + suffix), 'utf8') > maxJsonBytes) break;
    result += character;
  }
  return result + suffix;
}

export function auditResourceNames(
  names: Record<string, string>,
  details: Record<string, string>,
): Record<string, string> {
  const emptyNames = Object.fromEntries(Object.keys(names).map((key) => [key, '']));
  const availableBytes =
    MAX_AUDIT_DETAILS_BYTES - Buffer.byteLength(JSON.stringify({ ...details, ...emptyNames }), 'utf8');
  const maxJsonBytes = Math.floor(availableBytes / Object.keys(names).length);
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [key, auditResourceName(name, maxJsonBytes)]));
}

export function resourceAuditSnapshot(resource: Resource) {
  return {
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
}

export function applyResourceFields(resource: Resource, dto: UpdateResourceDto): void {
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
}

export function resourceUpdateAuditDetails(
  before: ReturnType<typeof resourceAuditSnapshot>,
  updatedResource: Resource,
): Record<string, string> {
  const changedFields = [
    ...(before.name !== updatedResource.name ? ['name'] : []),
    ...(before.type !== updatedResource.type ? ['type'] : []),
    ...(before.separateUnlockAndUnlatch !== updatedResource.separateUnlockAndUnlatch
      ? ['separateUnlockAndUnlatch']
      : []),
    ...(before.description !== updatedResource.description ? ['description'] : []),
    ...(before.documentationType !== updatedResource.documentationType ||
    before.documentationMarkdown !== updatedResource.documentationMarkdown ||
    before.documentationUrl !== updatedResource.documentationUrl
      ? ['documentation']
      : []),
    ...(JSON.stringify(before.metadata ?? {}) !== JSON.stringify(updatedResource.metadata ?? {}) ? ['metadata'] : []),
    ...(before.imageFilename !== updatedResource.imageFilename ? ['image'] : []),
    ...(before.allowTakeOver !== updatedResource.allowTakeOver ? ['allowTakeOver'] : []),
    ...(before.retrainingMaxAgeDays !== updatedResource.retrainingMaxAgeDays ? ['retrainingMaxAgeDays'] : []),
    ...(before.retrainingMaxInactivityDays !== updatedResource.retrainingMaxInactivityDays
      ? ['retrainingMaxInactivityDays']
      : []),
    ...(before.retrainingBlocksAccess !== updatedResource.retrainingBlocksAccess ? ['retrainingBlocksAccess'] : []),
    ...(before.supervisionMode !== updatedResource.supervisionMode ? ['supervisionMode'] : []),
    ...(before.supervisedUsagesUntilIntroduction !== updatedResource.supervisedUsagesUntilIntroduction
      ? ['supervisedUsagesUntilIntroduction']
      : []),
    ...(before.autoIntroductionTarget !== updatedResource.autoIntroductionTarget ? ['autoIntroductionTarget'] : []),
    ...(before.autoIntroductionGroupId !== updatedResource.autoIntroductionGroupId ? ['autoIntroductionGroupId'] : []),
  ];
  const details: Record<string, string> = changedFields.length ? { changedFields: JSON.stringify(changedFields) } : {};
  if (before.type !== updatedResource.type) {
    details['before.type'] = before.type;
    details['after.type'] = updatedResource.type;
  }
  if (before.name !== updatedResource.name) {
    Object.assign(
      details,
      auditResourceNames({ 'before.name': before.name, 'after.name': updatedResource.name }, details),
    );
  }
  return details;
}

@Injectable()
export class ResourcesService {
  constructor(
    protected readonly persistence: ResourceCatalogPersistence,
    protected readonly resourceImageService: ResourceImageService,
    protected readonly licenseService: LicenseService,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly audit: AuditService,
  ) {}

  protected readonly logger = new Logger(ResourcesService.name);

  async getResourceById<Tid extends number | number[]>(
    idOrArrayOfIds: Tid,
  ): Promise<Tid extends number ? Resource | null : Resource[]> {
    const arrayOfIds: number[] = Array.isArray(idOrArrayOfIds) ? idOrArrayOfIds : [idOrArrayOfIds];

    if (arrayOfIds.length === 0) {
      return (typeof idOrArrayOfIds === 'number' ? null : ([] as Resource[])) as Tid extends number
        ? Resource | null
        : Resource[];
    }

    const resources = await this.persistence.resourcesByIds(arrayOfIds);

    if (resources.length !== arrayOfIds.length) {
      throw new ResourceNotFoundException(arrayOfIds.find((id) => !resources.some((resource) => resource.id === id)));
    }

    return (typeof idOrArrayOfIds === 'number' ? resources[0] : resources) as Tid extends number
      ? Resource
      : Resource[];
  }

  public async listResources(options?: {
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

    const [resources, total] = await this.persistence.catalogPage({
      page,
      limit,
      search,
      groupId,
      ids,
      onlyInUseByUserId,
      onlyWithPermissionForUserId,
      onlyInUse,
      returnUsingUser,
    });

    return {
      data: resources,
      total,
      page,
      limit,
    };
  }

  async createResource(
    dto: CreateResourceDto,
    image?: FileUpload,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<Resource> {
    // verifying usage limits
    const currentAmountOfResources = await this.persistence.resourceCount();
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

    let resource = await this.persistence.createResource({
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

    if (image) {
      resource.imageFilename = await this.resourceImageService.saveImage(resource.id, image);
      resource = await this.persistence.saveResource(resource).catch(async (error) => {
        // delete the resource if the image save fails
        await this.persistence.removeResource(resource.id);
        throw error;
      });
    }

    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(resource.id));
    this.metricsService.resourcesTotal.inc();
    if (actor) {
      await this.audit.recordResource({
        action: 'resource.created',
        actorId: actor.id,
        authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId,
        subjectId: resource.id,
        details: {
          ...auditResourceNames({ 'after.name': resource.name }, { 'after.type': resource.type }),
          'after.type': resource.type,
        },
      });
    }

    return resource;
  }

  async updateResource(
    id: number,
    dto: UpdateResourceDto,
    image?: FileUpload,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<Resource> {
    const resource = await this.getResourceById(id);
    const before = resourceAuditSnapshot(resource);

    applyResourceFields(resource, dto);

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

    const updatedResource = await this.persistence.saveResource(resource);
    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(updatedResource.id));
    if (actor) {
      const details = resourceUpdateAuditDetails(before, updatedResource);
      if (Object.keys(details).length) {
        await this.audit.recordResource({
          action: 'resource.updated',
          actorId: actor.id,
          authenticationMethod: actor.authenticationMethod,
          apiTokenId: actor.apiTokenId,
          subjectId: updatedResource.id,
          details,
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
    const removed = await this.persistence.softDeleteResource(id);
    if (!removed) {
      throw new ResourceNotFoundException(id);
    }

    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(id));
    this.metricsService.resourcesTotal.dec();
    if (actor && resource) {
      await this.audit.recordResource({
        action: 'resource.deleted',
        actorId: actor.id,
        authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId,
        subjectId: id,
        details: {
          ...auditResourceNames({ 'before.name': resource.name }, { 'before.type': resource.type }),
          'before.type': resource.type,
        },
      });
    }
  }
}
