import type { Resource, ResourceHealthState, ResourceIntroducer, User } from '@attraccess/application-models';

export type NewHealthEntry = Pick<
  ResourceHealthState,
  'resourceId' | 'identifier' | 'status' | 'reason' | 'source' | 'lastReportedAt'
>;

export abstract class ResourceHealthPersistence {
  abstract findEntry(resourceId: number, identifier: string): Promise<ResourceHealthState | null>;
  abstract findEntryById(resourceId: number, entryId: number): Promise<ResourceHealthState | null>;
  abstract storeEntry(record: NewHealthEntry | ResourceHealthState): Promise<ResourceHealthState>;
  abstract listEntries(resourceIds: readonly number[]): Promise<ResourceHealthState[]>;
  abstract findResource(resourceId: number): Promise<Resource | null>;
  abstract countUnhealthy(resourceId: number): Promise<number>;
  abstract removeEntry(entry: ResourceHealthState): Promise<void>;
}

/** Selection data only. Permission decisions, recipient filtering and delivery remain application policy. */
export abstract class ResourceHealthRecipients {
  abstract resourceWithGroups(resourceId: number): Promise<Resource | null>;
  abstract usersByIds(userIds: readonly number[]): Promise<User[]>;
  abstract introducersForResource(resourceId: number, groupIds: readonly number[]): Promise<ResourceIntroducer[]>;
}
