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

/**
 * Emitted when a user attaches a note to a usage session (on start or end).
 * Drives notifications to the resource's introducers, maintainers and admins.
 */
export class ResourceUsageNoteAddedEvent {
  public static readonly EVENT_NAME = 'resource.usage.note_added';

  constructor(
    public readonly resourceId: number,
    public readonly note: string,
    public readonly phase: 'start' | 'end',
    public readonly author: Pick<User, 'id' | 'username'>
  ) {}
}

/**
 * Emitted whenever a supervised usage session starts. Acts as the counter signal consumed by the
 * supervised-usage auto-promotion follow-up (ATT-486), which decides when to auto-create an
 * introduction for the supervised user.
 */
export class SupervisedUsageStartedEvent {
  public static readonly EVENT_NAME = 'resource.usage.supervised_started';

  constructor(
    public readonly resourceId: number,
    public readonly userId: number,
    public readonly supervisorUserId: number,
    public readonly usageId: number
  ) {}
}
