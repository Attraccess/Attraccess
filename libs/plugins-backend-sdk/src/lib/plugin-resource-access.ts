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
 * A request-bound user: the authenticated principal of an HTTP request. `request.user` of an `@Auth()`
 * route (`AuthenticatedUser`) fits as is.
 */
export interface PluginAccessPrincipalUser {
  id: number;
  /**
   * Permissions this request may use. For API-token requests core narrows them to the token's scope. When set,
   * permission-based grants are limited to these permissions (intersected with the user's current RBAC
   * permissions). Introducer/maintainer roles and introductions still apply, exactly as core applies them to an
   * API-token request.
   */
  effectivePermissions?: Iterable<string>;
}

/**
 * Whom an access query is about. Pass `request.user` for request-driven checks so API-token scopes apply. A plain
 * user id resolves the user's full RBAC permissions; use it for background work such as schedulers.
 */
export type PluginAccessPrincipal = number | PluginAccessPrincipalUser;

/**
 * Read-only access and state queries over core authorization data. Requires the
 * ACCESS_RESOURCES permission. All answers reuse the logic core uses to authorise
 * session starts, so they never drift from what a start would actually allow.
 *
 * Methods that take a {@link PluginAccessPrincipal} accept either a user id or the request's user. Unknown users
 * and unknown resources yield negative answers (`false`, all-false results, empty lists) rather than errors.
 */
export interface PluginResourceAccessContext {
  /**
   * Whether the user may start a session on the resource. Covers direct and group
   * introductions, retraining blocks, introducers/maintainers and `resources.update`,
   * plus the resource's supervision mode. It does not look at live maintenance or health
   * state; use getMaintenanceWindows for that. Returns all-false for an unknown user or resource.
   */
  canStart(principal: PluginAccessPrincipal, resourceId: number): Promise<PluginCanStartResult>;

  /**
   * Whether the user can manage maintenance of the resource: `resources.maintenance.manage`, or an
   * introducer/maintainer role on the resource or one of its groups. Same check core's maintenance API uses.
   */
  canMaintain(principal: PluginAccessPrincipal, resourceId: number): Promise<boolean>;

  /**
   * Whether the user may see WHO is using the resource: the same rule core applies to the current user's name in
   * the resource UI and API (`full` activity access). `resources.update` and `resources.access.manage` holders,
   * people introduced to the machine (or its introducers/maintainers) and, when the instance shows activity to
   * everyone, every reader qualify. Machines whose activity is hidden from the user, and unknown users or
   * resources, answer `false`. A plugin that shows a person's name next to a machine (for example who holds a
   * reservation) should follow this answer instead of keeping its own rule.
   */
  canSeeUsageAttribution(principal: PluginAccessPrincipal, resourceId: number): Promise<boolean>;

  /** Whether the user holds the RBAC permission (e.g. `resources.update`), limited to a request's scope. */
  hasPermission(principal: PluginAccessPrincipal, permission: string): Promise<boolean>;

  /**
   * Ids of resources the user is introduced to in the sense of canStart's introduction rule:
   * valid, not retraining-blocked direct or group introduction, introducer/maintainer role, or `resources.update`.
   */
  listResourceIdsIntroduced(principal: PluginAccessPrincipal): Promise<number[]>;

  /** Ids of resources whose maintenance the user can manage. */
  listResourceIdsMaintained(principal: PluginAccessPrincipal): Promise<number[]>;

  /**
   * Maintenance windows overlapping [from, to). A window covers [startTime, endTime ?? infinity), so
   * open-ended maintenance counts from its start until it is finished.
   */
  getMaintenanceWindows(resourceId: number, from: Date, to: Date): Promise<PluginMaintenanceWindow[]>;

  /** Currently running sessions on the resource, earliest first. */
  getActiveSessions(resourceId: number): Promise<PluginActiveSession[]>;
}
