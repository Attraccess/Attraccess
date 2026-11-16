import type {
  ResourceHealthRecord,
  ResourceHealthSource,
  ResourceHealthStatus,
  ResourceNotificationRecipient,
} from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../resource-persistence-context';

export const RESOURCE_HEALTH_STORE = Symbol.for('attraccess.resources.health-store');

export interface HealthReport {
  resourceId: number;
  identifier: string;
  status: ResourceHealthStatus;
  reason: string | null;
  source: ResourceHealthSource;
  lastReportedAt: Date;
}

/** Latest health report per resource and source. */
export interface ResourceHealthStore {
  resourceExists(resourceId: number): Promise<boolean>;

  /** Stores the report as the entry of (resource, identifier); `previousStatus` is null for a new entry. */
  upsertReport(
    report: HealthReport,
  ): Promise<{ record: ResourceHealthRecord; previousStatus: ResourceHealthStatus | null }>;

  /** Entries ordered by identifier. */
  listForResource(resourceId: number): Promise<ResourceHealthRecord[]>;

  listForResources(resourceIds: number[]): Promise<ResourceHealthRecord[]>;

  /** Whether any entry of the resource is unhealthy, inside the caller's transaction when one is given. */
  hasUnhealthyEntry(resourceId: number, context?: ResourcePersistenceContext): Promise<boolean>;

  findEntry(resourceId: number, entryId: number): Promise<ResourceHealthRecord | null>;

  removeEntry(entryId: number): Promise<void>;
}

export const RESOURCE_RECIPIENT_STORE = Symbol.for('attraccess.resources.recipient-store');

/** Who is told about something that happens to a resource: managers, and introducers of it and its groups. */
export interface ResourceRecipientStore {
  findResource(resourceId: number): Promise<{ id: number; name: string; groupIds: number[] } | null>;

  findUsersByIds(userIds: number[]): Promise<ResourceNotificationRecipient[]>;

  findIntroducerUsers(resourceId: number, groupIds: number[]): Promise<ResourceNotificationRecipient[]>;
}
