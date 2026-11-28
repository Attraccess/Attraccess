import {
  SupervisionMode,
  type AuditAuthenticationMethod as AuthenticationMethod,
  type ResourceRecord,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { AUDIT_RECORDER, AuditRecorder } from '../audit/recorder/audit-event';

import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';

import { LicenseService, LicenseError } from '../license/license.service';

import { MetricsService } from '../metrics/metrics.service';

import { ResourceImageService } from './resourceImage.service';

import { PaginatedResponse } from '../types/response';

import { RESOURCE_STORE, type ResourceStore } from './resource-store.port';

import { FileUpload } from '../common/types/file-upload.types';

import { CreateResourceDto } from './dtos/createResource.dto';

import { UpdateResourceDto } from './dtos/updateResource.dto';

import { ResourceSessionLimitChangedEvent } from './events/resource-session-limit-changed.event';
import { sessionLimitOf } from './usage/sessions/active-usage';
import { ResourceChangedEvent } from './events/resource-changed.event';

import { assertDoorOptions } from './door-options';
import {
  normalizeSessionDurationSettings,
  sessionDurationSettingsProblem,
} from './usage/session-duration/session-duration.rules';
import { AUDIT_DETAILS_BYTE_LIMIT, fitAuditText, fitAuditTexts } from '../audit/policies/projection';

export const MAX_AUDIT_DETAILS_BYTES = AUDIT_DETAILS_BYTE_LIMIT;

export const auditResourceName = fitAuditText;

export const auditResourceNames = fitAuditTexts;

export function resourceAuditSnapshot(resource: ResourceRecord) {
  return {
    name: resource.name,
    type: resource.type,
    separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
    accessOnly: resource.accessOnly,
    description: resource.description,
    documentationType: resource.documentationType,
    documentationMarkdown: resource.documentationMarkdown,
    documentationUrl: resource.documentationUrl,
    metadata: resource.metadata,
    imageFilename: resource.imageFilename,
    allowTakeOver: resource.allowTakeOver,
    maxParallelSessions: resource.maxParallelSessions,
    maxSessionDurationMinutes: resource.maxSessionDurationMinutes,
    requireSessionDurationEstimate: resource.requireSessionDurationEstimate,
    defaultSessionDurationEstimateMinutes: resource.defaultSessionDurationEstimateMinutes,
    retrainingMaxAgeDays: resource.retrainingMaxAgeDays,
    retrainingMaxInactivityDays: resource.retrainingMaxInactivityDays,
    retrainingBlocksAccess: resource.retrainingBlocksAccess,
    supervisionMode: resource.supervisionMode,
    supervisedUsagesUntilIntroduction: resource.supervisedUsagesUntilIntroduction,
    autoIntroductionTarget: resource.autoIntroductionTarget,
    autoIntroductionGroupId: resource.autoIntroductionGroupId,
  };
}

function assertSessionDurationSettings(settings: Parameters<typeof sessionDurationSettingsProblem>[0]): void {
  const problem = sessionDurationSettingsProblem(settings);
  if (problem) throw new BadRequestException(problem);
}

export function applyResourceFields(resource: ResourceRecord, dto: UpdateResourceDto): void {
  // Update only provided fields
  if (dto.name !== undefined) resource.name = dto.name;
  if (dto.type !== undefined) resource.type = dto.type;
  if (dto.separateUnlockAndUnlatch !== undefined) resource.separateUnlockAndUnlatch = dto.separateUnlockAndUnlatch;
  if (dto.accessOnly !== undefined) resource.accessOnly = dto.accessOnly;
  if (dto.description !== undefined) resource.description = dto.description;
  if (dto.metadata !== undefined) resource.metadata = dto.metadata;

  // Handle documentation fields
  if (dto.documentationType !== undefined) resource.documentationType = dto.documentationType;
  if (dto.documentationMarkdown !== undefined) resource.documentationMarkdown = dto.documentationMarkdown;
  if (dto.documentationUrl !== undefined) resource.documentationUrl = dto.documentationUrl;

  // Handle allowTakeOver field
  if (dto.allowTakeOver !== undefined) resource.allowTakeOver = dto.allowTakeOver;
  if (dto.maxParallelSessions !== undefined) resource.maxParallelSessions = dto.maxParallelSessions;
  if (dto.maxSessionDurationMinutes !== undefined) resource.maxSessionDurationMinutes = dto.maxSessionDurationMinutes;
  if (dto.requireSessionDurationEstimate !== undefined)
    resource.requireSessionDurationEstimate = dto.requireSessionDurationEstimate;
  if (dto.defaultSessionDurationEstimateMinutes !== undefined)
    resource.defaultSessionDurationEstimateMinutes = dto.defaultSessionDurationEstimateMinutes;

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
  updatedResource: ResourceRecord,
): Record<string, string> {
  const changedFields = [
    ...(before.name !== updatedResource.name ? ['name'] : []),
    ...(before.type !== updatedResource.type ? ['type'] : []),
    ...(before.separateUnlockAndUnlatch !== updatedResource.separateUnlockAndUnlatch
      ? ['separateUnlockAndUnlatch']
      : []),
    ...(before.accessOnly !== updatedResource.accessOnly ? ['accessOnly'] : []),
    ...(before.description !== updatedResource.description ? ['description'] : []),
    ...(before.documentationType !== updatedResource.documentationType ||
    before.documentationMarkdown !== updatedResource.documentationMarkdown ||
    before.documentationUrl !== updatedResource.documentationUrl
      ? ['documentation']
      : []),
    ...(JSON.stringify(before.metadata ?? {}) !== JSON.stringify(updatedResource.metadata ?? {}) ? ['metadata'] : []),
    ...(before.imageFilename !== updatedResource.imageFilename ? ['image'] : []),
    ...(before.allowTakeOver !== updatedResource.allowTakeOver ? ['allowTakeOver'] : []),
    ...(before.maxParallelSessions !== updatedResource.maxParallelSessions ? ['maxParallelSessions'] : []),
    ...(before.maxSessionDurationMinutes !== updatedResource.maxSessionDurationMinutes
      ? ['maxSessionDurationMinutes']
      : []),
    ...(before.requireSessionDurationEstimate !== updatedResource.requireSessionDurationEstimate
      ? ['requireSessionDurationEstimate']
      : []),
    ...(before.defaultSessionDurationEstimateMinutes !== updatedResource.defaultSessionDurationEstimateMinutes
      ? ['defaultSessionDurationEstimateMinutes']
      : []),
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
    @Inject(RESOURCE_STORE)
    protected readonly store: ResourceStore,
    protected readonly resourceImageService: ResourceImageService,
    protected readonly licenseService: LicenseService,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(ResourcesService.name);

  async getResourceById<Tid extends number | number[]>(
    idOrArrayOfIds: Tid,
  ): Promise<Tid extends number ? ResourceRecord | null : ResourceRecord[]> {
    const arrayOfIds: number[] = Array.isArray(idOrArrayOfIds) ? idOrArrayOfIds : [idOrArrayOfIds];

    if (arrayOfIds.length === 0) {
      return (typeof idOrArrayOfIds === 'number' ? null : ([] as ResourceRecord[])) as Tid extends number
        ? ResourceRecord | null
        : ResourceRecord[];
    }

    const resources = await this.store.findDetailed(arrayOfIds);

    if (resources.length !== arrayOfIds.length) {
      throw new ResourceNotFoundException(arrayOfIds.find((id) => !resources.some((resource) => resource.id === id)));
    }

    return (typeof idOrArrayOfIds === 'number' ? resources[0] : resources) as Tid extends number
      ? ResourceRecord
      : ResourceRecord[];
  }

  public async listResources(options?: {
    page?: number;
    limit?: number;
    search?: string;
    groupId?: number;
    ids?: number[] | number;
    onlyInUseByUserId?: number;
    onlyWithPermissionForUserId?: number;
    permittedForUserId?: number;
    onlyInUse?: boolean;
    returnUsingUser?: boolean;
  }): Promise<PaginatedResponse<ResourceRecord>> {
    const { page = 1, limit = 10, ids, ...filters } = options ?? {};

    const { data, total } = await this.store.list({
      ...filters,
      page,
      limit,
      ids: typeof ids === 'number' ? [ids] : ids,
    });

    return { data, total, page, limit };
  }

  async createResource(
    dto: CreateResourceDto,
    image?: FileUpload,
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<ResourceRecord> {
    // verifying usage limits
    const currentAmountOfResources = await this.store.count();
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

    assertDoorOptions({
      type: dto.type,
      accessOnly: dto.accessOnly || false,
      separateUnlockAndUnlatch: dto.separateUnlockAndUnlatch || false,
    });

    const durationSettings = normalizeSessionDurationSettings({
      type: dto.type,
      maxSessionDurationMinutes: dto.maxSessionDurationMinutes ?? null,
      requireSessionDurationEstimate: dto.requireSessionDurationEstimate ?? false,
      defaultSessionDurationEstimateMinutes: dto.defaultSessionDurationEstimateMinutes ?? null,
    });
    assertSessionDurationSettings(durationSettings);

    const resource = await this.store.create({
      name: dto.name,
      description: dto.description,
      documentationType: dto.documentationType || null,
      documentationMarkdown: dto.documentationMarkdown || null,
      documentationUrl: dto.documentationUrl || null,
      allowTakeOver: dto.allowTakeOver || false,
      maxParallelSessions: dto.maxParallelSessions ?? 1,
      ...durationSettings,
      type: dto.type,
      separateUnlockAndUnlatch: dto.separateUnlockAndUnlatch || false,
      accessOnly: dto.accessOnly || false,
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
      await this.store.setImageFilename(resource.id, resource.imageFilename).catch(async (error) => {
        // delete the resource if the image save fails
        await this.store.hardDelete(resource.id);
        throw error;
      });
    }

    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(resource.id));
    this.metricsService.resourcesTotal.inc();
    if (actor) {
      await this.audit.record({
        domain: 'resource',
        action: 'resource.created',
        actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
        subject: { type: 'resource', id: resource.id },
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
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<ResourceRecord> {
    const resource = await this.getResourceById(id);
    const before = resourceAuditSnapshot(resource);

    applyResourceFields(resource, dto);
    assertDoorOptions(resource);
    normalizeSessionDurationSettings(resource);
    assertSessionDurationSettings(resource);

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

    const updatedResource = await this.store.save(resource);
    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(updatedResource.id));
    const previousLimit = sessionLimitOf(before);
    const newLimit = sessionLimitOf(updatedResource);
    if (previousLimit !== newLimit) {
      this.eventEmitter.emit(
        ResourceSessionLimitChangedEvent.EVENT_NAME,
        new ResourceSessionLimitChangedEvent(updatedResource.id, previousLimit, newLimit, actor?.id ?? null),
      );
    }
    if (actor) {
      const details = resourceUpdateAuditDetails(before, updatedResource);
      if (Object.keys(details).length) {
        await this.audit.record({
          domain: 'resource',
          action: 'resource.updated',
          actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
          subject: { type: 'resource', id: updatedResource.id },
          details: details,
        });
      }
    }
    return updatedResource;
  }

  async deleteResource(
    id: number,
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<void> {
    const resource = actor ? await this.getResourceById(id) : undefined;
    // A soft delete keeps the flow rows; the counts say what flow the resource had when it was deleted.
    const { nodes: flowNodeCount, edges: flowEdgeCount } = actor
      ? await this.store.countFlowParts(id)
      : { nodes: 0, edges: 0 };
    if ((await this.store.softDelete(id)) === 0) {
      throw new ResourceNotFoundException(id);
    }

    this.eventEmitter.emit(ResourceChangedEvent.EVENT_NAME, new ResourceChangedEvent(id));
    this.metricsService.resourcesTotal.dec();
    if (actor && resource) {
      await this.audit.record({
        domain: 'resource',
        action: 'resource.deleted',
        actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
        subject: { type: 'resource', id: id },
        details: {
          ...auditResourceNames(
            { 'before.name': resource.name },
            {
              'before.type': resource.type,
              flowNodeCount: String(flowNodeCount),
              flowEdgeCount: String(flowEdgeCount),
            },
          ),
          'before.type': resource.type,
          flowNodeCount,
          flowEdgeCount,
        },
      });
    }
  }
}
