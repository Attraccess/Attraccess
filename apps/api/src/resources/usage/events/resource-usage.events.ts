/**
 * Events emitted when resource usage status changes
 */

import { Resource, User } from '@attraccess/database-entities';

export class ResourceUsageStartedEvent {
  public static readonly eventName = 'resource.usage.started';

  constructor(
    public readonly resource: Pick<Resource, 'id' | 'name'>,
    public readonly startTime: Date,
    public readonly user: User
  ) {}
}

export class ResourceUsageEndedEvent {
  public static readonly eventName = 'resource.usage.ended';

  constructor(
    public readonly resource: Pick<Resource, 'id' | 'name'>,
    public readonly startTime: Date,
    public readonly endTime: Date,
    public readonly user: User
  ) {
    console.log('ResourceUsageEndedEvent', resource, startTime, endTime, user);
  }
}

export class ResourceUsageTakenOverEvent {
  public static readonly eventName = 'resource.usage.taken_over';

  constructor(
    public readonly resource: Pick<Resource, 'id' | 'name'>,
    public readonly takeoverTime: Date,
    public readonly newUser: User,
    public readonly previousUser: User | null // Previous user might not exist if resource was free
  ) {}
}
