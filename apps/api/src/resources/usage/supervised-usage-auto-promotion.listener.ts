// Auto-promotes a user to a full introduction once they complete enough supervised sessions.
// FEATURE: auto-promotion to introduction after X supervised usages (ATT-488)
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AutoIntroductionTarget, Resource, ResourceUsage } from '@attraccess/database-entities';
import { ResourceSupervisedUsageEndedEvent } from './events/resource-usage.events';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';

@Injectable()
export class SupervisedUsageAutoPromotionListener {
  private readonly logger = new Logger(SupervisedUsageAutoPromotionListener.name);

  constructor(
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly resourceIntroductionsService: ResourceIntroductionsService,
    private readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService,
  ) {}

  @OnEvent(ResourceSupervisedUsageEndedEvent.EVENT_NAME)
  async handleSupervisedUsageEnded(event: ResourceSupervisedUsageEndedEvent): Promise<void> {
    try {
      const resource = await this.resourceRepository.findOne({ where: { id: event.resourceId } });
      if (!resource) {
        this.logger.warn(`Supervised usage ended for missing resource ${event.resourceId}; skipping auto-promotion`);
        return;
      }

      const threshold = resource.supervisedUsagesUntilIntroduction;
      // null/0 disables auto-promotion.
      if (threshold == null || threshold <= 0) {
        return;
      }

      // null target defaults to a resource-scoped introduction.
      const target = resource.autoIntroductionTarget ?? AutoIntroductionTarget.RESOURCE;

      if (target === AutoIntroductionTarget.GROUP) {
        await this.promoteForGroup(resource, event, threshold);
        return;
      }

      await this.promoteForResource(event, threshold);
    } catch (error) {
      this.logger.error(
        `Failed to process supervised-usage auto-promotion for resource ${event.resourceId}, user ${event.userId}: ${
          (error as Error).message
        }`,
        (error as Error).stack,
      );
    }
  }

  private async promoteForResource(event: ResourceSupervisedUsageEndedEvent, threshold: number): Promise<void> {
    const { resourceId, userId, supervisorUserId } = event;

    // Idempotent: never create a duplicate introduction.
    if (await this.resourceIntroductionsService.hasValidIntroduction(resourceId, userId)) {
      return;
    }

    const count = await this.countSupervisedUsages([resourceId], userId);
    if (count < threshold) {
      return;
    }

    this.logger.log(
      `Auto-promoting user ${userId} to a resource introduction for resource ${resourceId} ` +
        `after ${count} supervised session(s) (threshold ${threshold})`,
    );
    await this.resourceIntroductionsService.grant(resourceId, userId, undefined, { tutorUserId: supervisorUserId });
  }

  private async promoteForGroup(
    resource: Resource,
    event: ResourceSupervisedUsageEndedEvent,
    threshold: number,
  ): Promise<void> {
    const { userId, supervisorUserId } = event;
    const groupId = resource.autoIntroductionGroupId;
    if (groupId == null) {
      this.logger.warn(
        `Resource ${resource.id} targets a group introduction but has no autoIntroductionGroupId; skipping`,
      );
      return;
    }

    // Idempotent: never create a duplicate group introduction.
    if (await this.resourceGroupsIntroductionsService.hasValidIntroduction({ groupId, userId })) {
      return;
    }

    const resourceIds = await this.getGroupResourceIds(groupId);
    if (resourceIds.length === 0) {
      return;
    }

    // Group-wide: supervised usages on every resource of the group add up toward the threshold.
    const count = await this.countSupervisedUsages(resourceIds, userId);
    if (count < threshold) {
      return;
    }

    this.logger.log(
      `Auto-promoting user ${userId} to a group introduction for group ${groupId} ` +
        `after ${count} supervised session(s) across ${resourceIds.length} resource(s) (threshold ${threshold})`,
    );
    await this.resourceGroupsIntroductionsService.grant(groupId, userId, undefined, { tutorUserId: supervisorUserId });
  }

  // Counts the user's completed supervised sessions across the given resources.
  private async countSupervisedUsages(resourceIds: number[], userId: number): Promise<number> {
    return await this.resourceUsageRepository.count({
      where: {
        resourceId: resourceIds.length === 1 ? resourceIds[0] : In(resourceIds),
        userId,
        supervisorUserId: Not(IsNull()),
        endTime: Not(IsNull()),
      },
    });
  }

  private async getGroupResourceIds(groupId: number): Promise<number[]> {
    const resources = await this.resourceRepository.find({ where: { groups: { id: groupId } } });
    return resources.map((resource) => resource.id);
  }
}
