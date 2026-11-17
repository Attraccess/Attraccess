import type { PluginResourceModel } from '@attraccess/application-models';

/**
 * Read-only host data a plugin may look up. It replaces direct access to host tables: every answer is a neutral
 * model or a plain value, never an entity or a query handle, so it does not depend on the database engine.
 * Every group has its own permission; calling a method without it throws a PluginPermissionError.
 */

/** Resource lookups. Requires ACCESS_RESOURCES. Unknown and deleted resources are skipped. */
export interface PluginResourceDirectory {
  get(resourceId: number): Promise<PluginResourceModel | null>;
  /** Names of the existing resources among `resourceIds`. */
  getNames(resourceIds: number[]): Promise<Map<number, string>>;
  /**
   * The subset of `resourceIds` (existing resources) the user may see. Core hides resources that only belong to hidden
   * resource groups unless the user is an introducer of the group or holds a granted group introduction.
   * `seeAll` skips that rule, for callers that already established `resources.update`.
   */
  filterVisible(userId: number, resourceIds: number[], options?: { seeAll?: boolean }): Promise<number[]>;
  /** The subset of `resourceIds` whose sessions always need a supervisor (`supervision_required`). */
  filterRequiringSupervision(resourceIds: number[]): Promise<number[]>;
  /** Ids of all resources in the given resource groups. */
  listIdsInGroups(groupIds: number[]): Promise<number[]>;
  /** Health entries of the resource that are currently unhealthy (a resource may carry several). */
  countUnhealthyEntries(resourceId: number): Promise<number>;
  /**
   * Ids of users who are introducers or maintainers of the resource or of one of its groups. Soft-deleted users
   * are skipped.
   */
  listIntroducerUserIds(resourceId: number): Promise<number[]>;
}

/** User lookups. Requires READ_USERS. Soft-deleted users are skipped, unless stated otherwise. */
export interface PluginUserDirectory {
  getUsernames(userIds: number[]): Promise<Map<number, string>>;
  /** The preferred language tag of each existing user (null when the user stored none). */
  getLocales(userIds: number[]): Promise<Map<number, string | null>>;
  /** Whether the account exists, is not soft-deleted and not disabled. */
  isActive(userId: number): Promise<boolean>;
  /** Ids of users who hold at least one of the RBAC permissions through a role. */
  listIdsWithAnyPermission(permissionKeys: string[]): Promise<number[]>;
}

/** Application settings. Requires READ_SETTINGS. */
export interface PluginSettingsDirectory {
  /** Value of an application setting (`app/<key>`), trimmed; null when unset or blank. */
  getApp(key: string): Promise<string | null>;
}

/** A flow node as the host stores it, with the names of its owner. */
export interface PluginFlowNodeReference {
  id: string;
  type: string;
  /** Owning resource, or null for a node of a global flow. */
  resourceId: number | null;
  resourceName: string | null;
  /** Owning global flow, or null for a node of a resource flow. */
  flowId: number | null;
  flowName: string | null;
  data: Record<string, unknown>;
}

/**
 * Selects flow nodes. All given conditions must match. `data` conditions compare a top-level key of the node data
 * (keys are plain identifiers).
 */
export interface PluginFlowNodeQuery {
  /** Exact node type, for example `plugin.wago.command`. */
  type?: string;
  /** Node types starting with this prefix, for example `plugin.wago.`. */
  typePrefix?: string;
  /** Top-level data keys that must equal the value. */
  dataEquals?: Record<string, string | number>;
  /** Top-level data keys whose value must be one of the listed values. */
  dataIn?: Record<string, ReadonlyArray<string | number>>;
  /** Nodes owned by this resource. */
  resourceId?: number;
  /** Excludes nodes owned by this resource; nodes of global flows stay. */
  excludeResourceId?: number;
  /** Excludes nodes of this global flow; nodes of resource flows stay. */
  excludeFlowId?: number;
  /** Ascending node id order and a row limit (default order is unspecified). */
  orderById?: boolean;
  limit?: number;
}

/** Flow node lookups. Requires DATABASE_ACCESS. */
export interface PluginFlowDirectory {
  findNodes(query: PluginFlowNodeQuery): Promise<PluginFlowNodeReference[]>;
}

/** Read-only host data, grouped by the permission that guards it. */
export interface PluginHostDataContext {
  readonly resources: PluginResourceDirectory;
  readonly users: PluginUserDirectory;
  readonly settings: PluginSettingsDirectory;
  readonly flows: PluginFlowDirectory;
}
