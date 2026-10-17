import { ResourceGroup } from '@attraccess/application-models';

import { Inject, Injectable } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { GroupPersistence, GROUP_OPERATIONS } from './persistence/port';

import { TransactionScope } from '../../database/transaction-scope';

import { AuditService } from '../../audit/audit.service';

import { MetricsService } from '../../metrics/metrics.service';

import { ResourceGroupNotFoundException } from './errors/groupNotFound.error';

import { CreateResourceGroupDto } from './dto/createGroup.dto';

import { UpdateResourceGroupDto } from './dto/updateGroup.dto';

import { ResourceGroupIntroductionChangedEvent } from './introductions/events/resource-group-introduction-changed.event';

import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';

export interface GetOneSearchOptions {
  id: number;
}

export interface GroupVisibilityContext {
  userId: number;
  canUpdateResources: boolean;
}

@Injectable()
export class ResourceGroupsService {
  constructor(
    @Inject(GroupPersistence) protected readonly persistence: GroupPersistence,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly audit: AuditService,
  ) {}

  public async getMany(visibility?: GroupVisibilityContext): Promise<ResourceGroup[]> {
    return this.persistence.visibleGroups(visibility && !visibility.canUpdateResources ? visibility.userId : undefined);
  }

  public async hasVisibleResources(visibility: GroupVisibilityContext): Promise<boolean> {
    return this.persistence.hasVisibleResources(visibility.canUpdateResources ? undefined : visibility.userId);
  }

  public async getOne(
    searchOptions: GetOneSearchOptions,
    relations?: string[],
    visibility?: GroupVisibilityContext,
  ): Promise<ResourceGroup> {
    const group = await this.persistence.group(searchOptions.id, relations?.includes('resources') ?? false);

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
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<ResourceGroup> {
    const savedResourceGroup = await this.persistence.createGroup({
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
      await this.audit.recordResource({
        action: 'resource_group.created',
        actorId: actor.id,
        authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId,
        subjectType: 'resource_group',
        subjectId: savedResourceGroup.id,
        details: { 'after.name': savedResourceGroup.name, 'after.isHidden': Number(savedResourceGroup.isHidden) },
      });
    }
    return savedResourceGroup;
  }

  public async updateOneById(
    id: number,
    updateDto: UpdateResourceGroupDto,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<ResourceGroup> {
    const resourceGroup = await this.getOne({ id });
    const before = {
      name: resourceGroup.name,
      description: resourceGroup.description,
      retrainingMaxAgeDays: resourceGroup.retrainingMaxAgeDays,
      retrainingMaxInactivityDays: resourceGroup.retrainingMaxInactivityDays,
      retrainingBlocksAccess: resourceGroup.retrainingBlocksAccess,
      isHidden: resourceGroup.isHidden,
    };

    const savedResourceGroup = await this.persistence.saveGroup({
      ...resourceGroup,
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
        await this.audit.recordResource({
          action: 'resource_group.updated',
          actorId: actor.id,
          authenticationMethod: actor.authenticationMethod,
          apiTokenId: actor.apiTokenId,
          subjectType: 'resource_group',
          subjectId: savedResourceGroup.id,
          details,
        });
      }
    }
    return savedResourceGroup;
  }

  public async deleteOne(
    groupId: number,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    const result = await this.persistence.deleteGroup(groupId);
    if (result === 0) {
      throw new ResourceGroupNotFoundException({ id: groupId });
    }
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(
        groupId,
        resourceGroup.resources.map((resource) => resource.id),
      ),
    );
    this.metricsService.resourceGroupsTotal.dec();
    if (actor) {
      await this.audit.recordResource({
        action: 'resource_group.deleted',
        actorId: actor.id,
        authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId,
        subjectType: 'resource_group',
        subjectId: groupId,
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
    if ((await this.persistence.introducerCount(groupId, userId)) > 0) return true;
    return this.persistence.hasActiveIntroduction(groupId, userId);
  }

  public async addResource(
    groupId: number,
    resourceId: number,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);

    const existingResource = resourceGroup.resources.find((resource) => resource.id === resourceId);

    if (existingResource) {
      return;
    }

    const resource = await this.persistence.resource(resourceId);

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    resourceGroup.resources.push(resource);
    const savedResourceGroup = await this.persistence.saveGroup(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id, [resourceId]),
    );
    if (actor) {
      await this.audit.recordResource({
        action: 'resource_group.resource_added',
        actorId: actor.id,
        authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId,
        subjectType: 'resource_group',
        subjectId: groupId,
        details: { resourceId },
      });
    }
  }

  public async removeResource(
    groupId: number,
    resourceId: number,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<void> {
    const resourceGroup = await this.getOne({ id: groupId }, ['resources']);
    const resource = resourceGroup.resources.find((resource) => resource.id === resourceId);

    if (!resource) {
      return;
    }

    resourceGroup.resources = resourceGroup.resources.filter((resource) => resource.id !== resourceId);
    const savedResourceGroup = await this.persistence.saveGroup(resourceGroup);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(savedResourceGroup.id, [resourceId]),
    );
    if (actor) {
      await this.audit.recordResource({
        action: 'resource_group.resource_removed',
        actorId: actor.id,
        authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.apiTokenId,
        subjectType: 'resource_group',
        subjectId: groupId,
        details: { resourceId },
      });
    }
  }

  public async getGroupsOfResource(resourceId: number, scope?: TransactionScope): Promise<ResourceGroup[]> {
    return (scope ? scope.resolve(GROUP_OPERATIONS) : this.persistence).groupsOfResource(resourceId);
  }
}
