import type { AutoEndReason } from '../session-duration/session-duration.rules';
/**
 * Events emitted when resource usage status changes
 */

import type {
  UsageSession,
  UsageSessionResource,
  UsageSessionUser,
  UsageSessionUserRecord,
} from '@attraccess/application-models';

export class ResourceSessionStartedEvent {
  public static readonly EVENT_NAME = 'resource.usage.session_started';

  constructor(public readonly usage: UsageSession) {}
}

export class ResourceUsageSessionTakenOverEvent {
  public static readonly EVENT_NAME = 'resource.usage.session_taken_over';

  constructor(
    public readonly resource: Pick<UsageSessionResource, 'id' | 'name'>,
    public readonly takeoverTime: Date,
    public readonly newUser: UsageSessionUser,
    public readonly previousUser: UsageSessionUserRecord | null, // Previous user might not exist if resource was free
  ) {}
}

export class ResourceUsageSessionEndedEvent {
  public static readonly EVENT_NAME = 'resource.usage.session_ended';

  constructor(
    public readonly usage: UsageSession,
    public readonly endedBy: Pick<UsageSessionUser, 'id' | 'username' | 'firstName' | 'lastName'> | null,
    /** Set when the server ended the session at its deadline: why. */
    public readonly autoEndReason?: AutoEndReason,
  ) {}
}

/**
 * The owner moved their running session to another project: the previous usage ended and the new one continues it
 * under the other project. The machine kept running, so no start, end or take-over event is emitted for it.
 */
export class ResourceUsageProjectSwitchedEvent {
  public static readonly EVENT_NAME = 'resource.usage.project_switched';

  constructor(
    public readonly resourceId: number,
    public readonly userId: number,
    public readonly previousUsageId: number,
    public readonly usageId: number,
    public readonly previousProjectId: number | null,
    public readonly projectId: number | null,
    public readonly switchTime: Date,
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
    public readonly author: Pick<UsageSessionUser, 'id' | 'username' | 'firstName' | 'lastName'>,
  ) {}
}

/**
 * Emitted whenever a supervised usage session starts. Acts as the counter signal consumed by the
 * supervised-usage auto-promotion follow-up (ATT-486), which decides when to auto-create an
 * introduction for the supervised user.
 */
export class ResourceSupervisedUsageStartedEvent {
  public static readonly EVENT_NAME = 'resource.usage.supervised_started';

  constructor(
    public readonly resourceId: number,
    public readonly userId: number,
    public readonly supervisorUserId: number,
    public readonly usageId: number,
  ) {}
}

/**
 * Emitted whenever a supervised usage session ends successfully. Consumed by the supervised-usage
 * auto-promotion listener (ATT-488), which counts the user's completed supervised sessions and
 * auto-creates an introduction once the configured threshold is reached.
 */
export class ResourceSupervisedUsageEndedEvent {
  public static readonly EVENT_NAME = 'resource.usage.supervised_ended';

  constructor(
    public readonly resourceId: number,
    public readonly userId: number,
    public readonly supervisorUserId: number,
    public readonly usageId: number,
  ) {}
}
/** A failed/interrupted attempt released its duration cap; no usage started or ended. */
export class ResourceUsageLifecycleAbortedEvent {
  static readonly EVENT_NAME = 'resource.usage.lifecycle.aborted';
  constructor(public readonly resourceId: number) {}
}

/**
 * Emitted when the automatic end of a running session was moved. Drives the live feed of the web and the reader
 * lists. It carries the session, not a response: the live feed reduces it for viewers that may not see the owner.
 */
export class ResourceUsageSessionExtendedEvent {
  public static readonly EVENT_NAME = 'resource.usage.session_extended';

  constructor(public readonly usage: UsageSession) {}
}
