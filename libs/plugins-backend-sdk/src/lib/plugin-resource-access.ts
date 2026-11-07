/** Result of {@link PluginResourceAccessContext.canStart}. */
export interface PluginCanStartResult {
  /** The user may start a session on their own right now (introduction valid, no mandatory supervision). */
  allowed: boolean;
  /** The user may only start a session under a supervisor (mandatory, or not introduced yet). */
  requiresSupervision: boolean;
  /** The resource supports supervised sessions at all (supervision allowed or required). */
  supervisionAllowed: boolean;
}

export interface PluginMaintenanceWindow {
  maintenanceId: number;
  resourceId: number;
  startTime: Date;
  /** Null for open-ended maintenance that is still running or announced without an end. */
  endTime: Date | null;
  reason: string | null;
}

export interface PluginActiveSession {
  usageId: number;
  userId: number;
  startTime: Date;
}

/**
 * Read-only access and state queries over core authorization data. Requires the
 * ACCESS_RESOURCES permission. All answers reuse the logic core uses to authorise
 * session starts, so they never drift from what a start would actually allow.
 */
export interface PluginResourceAccessContext {
  /**
   * Whether the user may start a session on the resource. Covers direct and group
   * introductions, retraining blocks, introducers/maintainers and `resources.update`,
   * plus the resource's supervision mode. It does not look at live maintenance or health
   * state; use getMaintenanceWindows for that.
   */
  canStart(userId: number, resourceId: number): Promise<PluginCanStartResult>;

  /** Whether the user can manage maintenance of the resource (permission, introducer/maintainer, group roles). */
  canMaintain(userId: number, resourceId: number): Promise<boolean>;

  /** Whether the user holds the RBAC permission (e.g. `resources.update`). */
  hasPermission(userId: number, permission: string): Promise<boolean>;

  /**
   * Ids of resources the user is introduced to in the sense of canStart's introduction rule:
   * valid, not retraining-blocked direct or group introduction, introducer/maintainer role, or `resources.update`.
   */
  listResourceIdsIntroduced(userId: number): Promise<number[]>;

  /** Ids of resources whose maintenance the user can manage. */
  listResourceIdsMaintained(userId: number): Promise<number[]>;

  /**
   * Maintenance windows overlapping [from, to). A window covers [startTime, endTime ?? infinity), so
   * open-ended maintenance counts from its start until it is finished.
   */
  getMaintenanceWindows(resourceId: number, from: Date, to: Date): Promise<PluginMaintenanceWindow[]>;

  /** Currently running sessions on the resource, earliest first. */
  getActiveSessions(resourceId: number): Promise<PluginActiveSession[]>;
}
