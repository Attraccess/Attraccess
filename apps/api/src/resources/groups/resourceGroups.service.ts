import type { ResourceGroupRecord } from '@attraccess/application-models';

import { Inject, Injectable } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';

import { MetricsService } from '../../metrics/metrics.service';

import { ResourceGroupNotFoundException } from './errors/groupNotFound.error';

import { CreateResourceGroupDto } from './dto/createGroup.dto';

import { UpdateResourceGroupDto } from './dto/updateGroup.dto';

import { ResourceGroupIntroductionChangedEvent } from './introductions/events/resource-group-introduction-changed.event';

import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';

import {
  RESOURCE_GROUP_STORE,
  type GroupVisibilityContext,
  type ResourceGroupDetail,
  type ResourceGroupStore,
} from './resource-group-store.port';

import type { ResourcePersistenceContext } from '../resource-persistence-context';
import type { AuthenticationMethod } from '@attraccess/application-models';

export interface GetOneSearchOptions {
  id: number;
}

export type { GroupVisibilityContext };

@Injectable()
export class ResourceGroupsService {
  constructor(
    @Inject(RESOURCE_GROUP_STORE)
    protected readonly store: ResourceGroupStore,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  public async getMany(visibility?: GroupVisibilityContext): Promise<ResourceGroupRecord[]> {
    return this.store.listVisible(visibility);
  }

  public async hasVisibleResources(visibility: GroupVisibilityContext): Promise<boolean> {
    return this.store.hasVisibleResources(visibility);
  }

  public async getOne(
    searchOptions: GetOneSearchOptions,
    relations?: string[],
    visibility?: GroupVisibilityContext,
  ): Promise<ResourceGroupDetail> {
    const group = await this.store.findById(searchOptions.id, relations?.includes('resources') === true);

    if (!group) {
      throw new ResourceGroupNotFoundException({ id: searchOptions.id });
    }

    // Hidden groups are only visible to managers and users that are part of the group.
    if (group.isHidden && visibility && !visibility.canUpdateResources) {
      const isPartOfGroup = await this.userIsPartOfGroup(group.id, visibility.userId);
      if (!isPartOfGroup) {
        throw new ResourceGroupNotFoundException({ id: searchOptions.id });
      }
    }

    return group;
  }

  public async createOne(
    dto: CreateResourceGroupDto,
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<ResourceGroupRecord> {
    const savedResourceGroup = await this.store.create({
      name: dto.name,
      description: dto.description,
      retrainingMaxAgeDays: dto.retrainingMaxAgeDays ?? null,
      retrainingMaxInactivityDays: dto.retrainingMaxInactivityDays ?? null,
      retrainingBlocksAccess: dto.retrainingBlocksAccess ?? false,
      isHidden: dto.isHidden ?? false,
    });
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
    this.metricsService.resourceGroupsTotal.inc();
    if (actor) {
      await this.audit.record({
        domain: 'resource',
        action: 'resource_group.created',
        actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
        subject: { type: 'resource_group', id: savedResourceGroup.id },
        details: { 'after.name': savedResourceGroup.name, 'after.isHidden': Number(savedResourceGroup.isHidden) },
      });
    }
    return savedResourceGroup;
  }

  public async updateOneById(
    id: number,
    updateDto: UpdateResourceGroupDto,
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<ResourceGroupRecord> {
    const resourceGroup = await this.getOne({ id });
    const before = {
      name: resourceGroup.name,
      description: resourceGroup.description,
      retrainingMaxAgeDays: resourceGroup.retrainingMaxAgeDays,
      retrainingMaxInactivityDays: resourceGroup.retrainingMaxInactivityDays,
      retrainingBlocksAccess: resourceGroup.retrainingBlocksAccess,
      isHidden: resourceGroup.isHidden,
    };

    const savedResourceGroup = await this.store.update(id, {
      name: updateDto.name !== undefined ? updateDto.name : resourceGroup.name,
      description: updateDto.description !== undefined ? updateDto.description : resourceGroup.description,
      retrainingMaxAgeDays:
        updateDto.retrainingMaxAgeDays !== undefined
          ? updateDto.retrainingMaxAgeDays
          : resourceGroup.retrainingMaxAgeDays,
      retrainingMaxInactivityDays:
        updateDto.retrainingMaxInactivityDays !== undefined
          ? updateDto.retrainingMaxInactivityDays
          : resourceGroup.retrainingMaxInactivityDays,
      retrainingBlocksAccess:
        updateDto.retrainingBlocksAccess !== undefined
          ? updateDto.retrainingBlocksAccess
          : resourceGroup.retrainingBlocksAccess,
      isHidden: updateDto.isHidden !== undefined ? updateDto.isHidden : resourceGroup.isHidden,
    });
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id),
    );
    if (actor) {
      const details: Record<string, string | number> = {};
      if (before.name !== savedResourceGroup.name) {
        details['before.name'] = before.name;
        details['after.name'] = savedResourceGroup.name;
      }
      if (before.isHidden !== savedResourceGroup.isHidden) {
        details['before.isHidden'] = Number(before.isHidden);
        details['after.isHidden'] = Number(savedResourceGroup.isHidden);
      }
      const changedFields = [
        ...(before.name !== savedResourceGroup.name ? ['name'] : []),
        ...(before.description !== savedResourceGroup.description ? ['description'] : []),
        ...(before.retrainingMaxAgeDays !== savedResourceGroup.retrainingMaxAgeDays ? ['retrainingMaxAgeDays'] : []),
        ...(before.retrainingMaxInactivityDays !== savedResourceGroup.retrainingMaxInactivityDays
          ? ['retrainingMaxInactivityDays']
          : []),
        ...(before.retrainingBlocksAccess !== savedResourceGroup.retrainingBlocksAccess
          ? ['retrainingBlocksAccess']
          : []),
        ...(before.isHidden !== savedResourceGroup.isHidden ? ['isHidden'] : []),
      ];
      if (changedFields.length) details.changedFields = JSON.stringify(changedFields);
      if (Object.keys(details).length) {
        await this.audit.record({
          domain: 'resource',
          action: 'resource_group.updated',
          actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
          subject: { type: 'resource_group', id: savedResourceGroup.id },
          details: details,
        });
      }
    }
    return savedResourceGroup;
  }

  public async deleteOne(
    groupId: number,
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    if ((await this.store.delete(groupId)) === 0) {
      throw new ResourceGroupNotFoundException({ id: groupId });
    }
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(
        groupId,
        (resourceGroup.resources ?? []).map((resource) => resource.id),
      ),
    );
    this.metricsService.resourceGroupsTotal.dec();
    if (actor) {
      await this.audit.record({
        domain: 'resource',
        action: 'resource_group.deleted',
        actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
        subject: { type: 'resource_group', id: groupId },
        details: { 'before.name': resourceGroup.name, 'before.isHidden': Number(resourceGroup.isHidden) },
      });
    }
  }

  /**
   * Whether the user is "part of" the group: an introducer/maintainer of it, or has a currently
   * valid introduction to it.
   *
   * An introduction counts only if its latest history item is a GRANT — revoked introductions keep
   * their row (and a REVOKE history item) in the database but must not grant visibility.
   */
  public async userIsPartOfGroup(groupId: number, userId: number): Promise<boolean> {
    return this.store.userIsPartOfGroup(groupId, userId);
  }

  public async addResource(
    groupId: number,
    resourceId: number,
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);

    const existingResource = (resourceGroup.resources ?? []).find((resource) => resource.id === resourceId);

    if (existingResource) {
      return;
    }

    if (!(await this.store.resourceExists(resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }

    await this.store.addResource(groupId, resourceId);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(resourceGroup.id, [resourceId]),
    );
    if (actor) {
      await this.audit.record({
        domain: 'resource',
        action: 'resource_group.resource_added',
        actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
        subject: { type: 'resource_group', id: groupId },
        details: { resourceId },
      });
    }
  }

  public async removeResource(
    groupId: number,
    resourceId: number,
    actor?: { id: number; authenticationMethod?: AuthenticationMethod; apiTokenId?: number },
  ): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    const resource = (resourceGroup.resources ?? []).find((resource) => resource.id === resourceId);

    if (!resource) {
      return;
    }

    await this.store.removeResource(groupId, resourceId);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(resourceGroup.id, [resourceId]),
    );
    if (actor) {
      await this.audit.record({
        domain: 'resource',
        action: 'resource_group.resource_removed',
        actor: { id: actor.id, authenticationMethod: actor.authenticationMethod, apiTokenId: actor.apiTokenId },
        subject: { type: 'resource_group', id: groupId },
        details: { resourceId },
      });
    }
  }

  public async getGroupsOfResource(
    resourceId: number,
    context?: ResourcePersistenceContext,
  ): Promise<ResourceGroupRecord[]> {
    return await this.store.groupsOfResource(resourceId, context);
  }
}
