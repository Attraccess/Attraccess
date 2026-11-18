import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSession, UsageSessionUser } from '@attraccess/application-models';

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import { UsageResourceGate } from '../authorization/usage-resource-gate';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { USAGE_SESSION_STORE, UsageSessionStore } from '../usage-session-store.port';

import { UsageSessionNotifications } from './usage-session-notifications';

type DoorActionUser = UsageSessionUser;

/** Door lock, unlock and unlatch: stored as already-ended usage records. */
@Injectable()
export class UsageDoorActions {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    @Inject(USAGE_SESSION_STORE) private readonly sessions: UsageSessionStore,
    private readonly gate: UsageResourceGate,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  private async handleDoorAction(
    resourceId: number,
    user: DoorActionUser,
    action: ResourceUsageAction,
  ): Promise<UsageSession> {
    this.logger.debug(`persisting door action for resource ${resourceId}`, { resourceId, action, userId: user.id });

    const usage = await this.sessions.recordDoorAction({ resourceId, userId: user.id, action });

    await this.notifications.emitUsageEvent(usage.id);

    return usage;
  }

  async lockDoor(resourceId: number, user: DoorActionUser): Promise<UsageSession> {
    const resource = await this.gate.getResource(resourceId, user, {
      checkMaintenance: true,
      checkControlPermission: true,
    });

    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException('Resource is not a door');
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorLock);
  }

  async unlockDoor(resourceId: number, user: DoorActionUser): Promise<UsageSession> {
    const resource = await this.gate.getResource(resourceId, user, {
      checkMaintenance: true,
      checkControlPermission: true,
    });
    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException('Resource is not a door');
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorUnlock);
  }

  async unlatchDoor(resourceId: number, user: DoorActionUser): Promise<UsageSession> {
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
