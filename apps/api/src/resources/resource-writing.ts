import { Resource, SupervisionMode } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FileUpload } from '../common/types/file-upload.types';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { LicenseError } from '../license/license.service';
import { CreateResourceDto } from './dtos/createResource.dto';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { ResourceChangedEvent } from './events/resource-changed.event';
import {
  applyResourceFields,
  auditResourceNames,
  resourceAuditSnapshot,
  resourceUpdateAuditDetails,
} from './resources.service.feature-definitions';
import { ResourcesServiceRouteContext } from './resources.service.route-context';
export abstract class ResourceWritingImplementation extends ResourcesServiceRouteContext {
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

    const updatedResource = await this.resourceRepository.save(resource);
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
    const result = await this.resourceRepository.softDelete(id);
    if (result.affected === 0) {
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
