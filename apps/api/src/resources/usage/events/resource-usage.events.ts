/**
 * Events emitted when resource usage status changes
 */

import { Resource, ResourceUsage, User } from '@attraccess/database-entities';

export class ResourceUsageEvent {
  public static readonly EVENT_NAME = 'resource.usage';

  constructor(public readonly usage: ResourceUsage) {}
}

export class ResourceUsageTakenOverEvent {
  public static readonly EVENT_NAME = 'resource.usage.taken_over';

  constructor(
    public readonly resource: Pick<Resource, 'id' | 'name'>,
    public readonly takeoverTime: Date,
    public readonly newUser: User,
    public readonly previousUser: User | null // Previous user might not exist if resource was free
  ) {}
}
