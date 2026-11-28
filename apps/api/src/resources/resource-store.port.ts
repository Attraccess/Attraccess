import type {
  AutoIntroductionTarget,
  DocumentationType,
  ResourceRecord,
  ResourceType,
  SupervisionMode,
} from '@attraccess/application-models';

export const RESOURCE_STORE = Symbol.for('attraccess.resources.resource-store');

export interface ListResourcesQuery {
  page: number;
  limit: number;
  search?: string;
  /** A group id, or -1 for resources without a group. */
  groupId?: number;
  ids?: number[];
  onlyInUseByUserId?: number;
  onlyWithPermissionForUserId?: number;
  /** Narrows the page, and its total, to the machines this user may see under "permitted-only" (ATT-843). */
  permittedForUserId?: number;
  onlyInUse?: boolean;
  /** Embeds the running sessions with their users. */
  returnUsingUser?: boolean;
}

export interface NewResource {
  name: string;
  description?: string | null;
  documentationType: DocumentationType | null;
  documentationMarkdown: string | null;
  documentationUrl: string | null;
  allowTakeOver: boolean;
  maxParallelSessions: number;
  maxSessionDurationMinutes: number | null;
  requireSessionDurationEstimate: boolean;
  defaultSessionDurationEstimateMinutes: number | null;
  type: ResourceType;
  separateUnlockAndUnlatch: boolean;
  accessOnly: boolean;
  metadata: Record<string, unknown> | null;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
  supervisionMode: SupervisionMode;
  supervisedUsagesUntilIntroduction: number | null;
  autoIntroductionTarget: AutoIntroductionTarget | null;
  autoIntroductionGroupId: number | null;
}

/** Resources (machines and doors) and what the resource endpoints and live updates read about them. */
export interface ResourceStore {
  /** The resources with their introductions, sessions and groups, in the order the database returns them. */
  findDetailed(ids: number[]): Promise<ResourceRecord[]>;

  /** One page of resources by name, with their groups, and the total count. */
  list(query: ListResourcesQuery): Promise<{ data: ResourceRecord[]; total: number }>;

  /** Which of the ids are machines the user may see under "permitted-only" (ATT-843). Deleted machines are never. */
  permittedIds(userId: number, ids: number[]): Promise<number[]>;

  count(): Promise<number>;

  create(resource: NewResource): Promise<ResourceRecord>;

  /**
   * Stores the columns of the record and returns it with its refreshed update time. Relations
   * (groups, introductions, usages) are not written and come back exactly as passed in.
   */
  save(resource: ResourceRecord): Promise<ResourceRecord>;

  setImageFilename(resourceId: number, filename: string): Promise<void>;

  /** Removes the row for good (a resource whose creation failed half way). */
  hardDelete(resourceId: number): Promise<void>;

  /** Marks the resource deleted; the number of resources that changed. */
  softDelete(resourceId: number): Promise<number>;

  /** How many flow nodes and edges the resource has. */
  countFlowParts(resourceId: number): Promise<{ nodes: number; edges: number }>;

  /** Which of the ids are resources. */
  existingIds(ids: number[]): Promise<number[]>;

  findCapacity(resourceId: number): Promise<{ type: ResourceType; maxParallelSessions: number } | null>;

  /** The number of published sessions without an end. */
  countActiveSessions(resourceId: number): Promise<number>;
}
