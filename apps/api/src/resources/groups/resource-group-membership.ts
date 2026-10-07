import { ResourceGroup } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceGroupIntroductionChangedEvent } from './introductions/events/resource-group-introduction-changed.event';
import { ResourceGroupsServiceRouteContext } from './resourceGroups.service.route-context';
export abstract class ResourceGroupMembershipImplementation extends ResourceGroupsServiceRouteContext {
  /**
   * Whether the user is "part of" the group: an introducer/maintainer of it, or has a currently
   * valid introduction to it.
   *
   * An introduction counts only if its latest history item is a GRANT — revoked introductions keep
   * their row (and a REVOKE history item) in the database but must not grant visibility.
   */
  public async userIsPartOfGroup(groupId: number, userId: number): Promise<boolean> {
    const introducerCount = await this.resourceIntroducerRepository.count({
      where: { resourceGroupId: groupId, userId },
    });
    if (introducerCount > 0) {
      return true;
    }

    const activeIntroductions = await this.resourceIntroductionRepository.query(
      `SELECT 1 FROM "resource_introduction" "rin"
       WHERE "rin"."resourceGroupId" = ? AND "rin"."receiverUserId" = ?
       AND (
         SELECT "h"."action" FROM "resource_introduction_history_item" "h"
         WHERE "h"."introductionId" = "rin"."id"
         ORDER BY "h"."createdAt" DESC, "h"."id" DESC
         LIMIT 1
       ) = 'grant'
       LIMIT 1`,
      [groupId, userId],
    );
    return activeIntroductions.length > 0;
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
    const savedResourceGroup = await this.resourceGroupRepository.save(resourceGroup);
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
