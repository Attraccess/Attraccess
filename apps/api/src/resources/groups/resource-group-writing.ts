import { ResourceGroup } from '@attraccess/database-entities';
import { CreateResourceGroupDto } from './dto/createGroup.dto';
import { UpdateResourceGroupDto } from './dto/updateGroup.dto';
import { ResourceGroupNotFoundException } from './errors/groupNotFound.error';
import { ResourceGroupIntroductionChangedEvent } from './introductions/events/resource-group-introduction-changed.event';
import { ResourceGroupMembershipImplementation } from './resource-group-membership';
export abstract class ResourceGroupWritingImplementation extends ResourceGroupMembershipImplementation {
  public async createOne(
    dto: CreateResourceGroupDto,
    actor?: { id: number; authenticationMethod?: 'session' | 'api-token'; apiTokenId?: number },
  ): Promise<ResourceGroup> {
    const resourceGroup = this.resourceGroupRepository.create({
      name: dto.name,
      description: dto.description,
      retrainingMaxAgeDays: dto.retrainingMaxAgeDays ?? null,
      retrainingMaxInactivityDays: dto.retrainingMaxInactivityDays ?? null,
      retrainingBlocksAccess: dto.retrainingBlocksAccess ?? false,
      isHidden: dto.isHidden ?? false,
    });
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
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

    const savedResourceGroup = await this.resourceGroupRepository.save({
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
    const result = await this.resourceGroupRepository.delete(groupId);
    if (result.affected === 0) {
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
}
