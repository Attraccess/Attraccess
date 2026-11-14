import { ResourceType, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { UsageResourceGate } from '../authorization/usage-resource-gate';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { UsageSessionNotifications } from './usage-session-notifications';

/** Door lock, unlock and unlatch: stored as already-ended usage records. */
@Injectable()
export class UsageDoorActions {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    private readonly gate: UsageResourceGate,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  private async handleDoorAction(resourceId: number, user: User, action: ResourceUsageAction): Promise<ResourceUsage> {
    const usageData = {
      resourceId,
      usageAction: action,
      userId: user.id,
      startTime: new Date(),
      startNotes: null,
      endTime: new Date(),
      endNotes: null,
    };

    this.logger.debug(`persisting door action for resource ${resourceId}`, { usageData });

    let usage = await this.resourceUsageRepository.save(usageData, { reload: true });
    usage = await this.resourceUsageRepository.findOne({ where: { id: usage.id }, relations: ['user', 'resource'] });

    await this.notifications.emitUsageEvent(usage.id);

    return usage;
  }

  async lockDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    const resource = await this.gate.getResource(resourceId, user, {
      checkMaintenance: true,
      checkControlPermission: true,
    });

    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException('Resource is not a door');
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorLock);
  }

  async unlockDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    const resource = await this.gate.getResource(resourceId, user, {
      checkMaintenance: true,
      checkControlPermission: true,
    });
    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException('Resource is not a door');
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorUnlock);
  }

  async unlatchDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    const resource = await this.gate.getResource(resourceId, user, {
      checkMaintenance: true,
      checkControlPermission: true,
    });
    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException(
        `Resource (ID: ${resourceId}${resource.name ? `, Name: ${resource.name}` : ''}) is not a door`,
      );
    }

    if (!resource.separateUnlockAndUnlatch) {
      throw new BadRequestException(
        `Door (ID: ${resourceId}${resource.name ? `, Name: ${resource.name}` : ''}) does not support unlatching`,
      );
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorUnlatch);
  }
}
