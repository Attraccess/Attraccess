import { operationToken } from '../../../database/transaction-scope';
import type {
  Resource,
  ResourceIntroducer,
  User,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  LifecycleBillingItem,
  ResourceMeter,
} from '@attraccess/application-models';

export abstract class UsageNoteRecipients {
  abstract resourceWithGroups(resourceId: number): Promise<Resource | null>;
  abstract users(ids: readonly number[]): Promise<User[]>;
  abstract introducers(resourceId: number, groupIds: readonly number[]): Promise<ResourceIntroducer[]>;
}

/** Stored facts only; threshold, scope and idempotent introduction policy belong to the listener. */
export abstract class SupervisedUsageHistory {
  abstract resource(resourceId: number): Promise<Resource | null>;
  abstract completedCount(resourceIds: readonly number[], userId: number): Promise<number>;
  abstract groupResourceIds(groupId: number): Promise<number[]>;
}

export type NewLifecycleAttempt = Pick<
  ResourceUsageLifecycleAttempt,
  | 'id'
  | 'resourceId'
  | 'kind'
  | 'candidateUsageId'
  | 'previousUsageId'
  | 'transitionTime'
  | 'formSubmissions'
  | 'billingItems'
>;
/** Database operations used by the usage state machine; no policy or physical effects. */
export abstract class UsagePersistence {
  abstract resource(id: number): Promise<Resource | null>;
  abstract user(id: number): Promise<User | null>;
  abstract activeSession(resourceId: number): Promise<ResourceUsage | null>;
  abstract activeSessions(resourceIds: readonly number[]): Promise<ResourceUsage[]>;
  abstract sessionDetails(resourceId: number, usageId: number): Promise<ResourceUsage | null>;
  abstract history(
    resourceId: number,
    userId: number | undefined,
    skip: number,
    take: number,
  ): Promise<[ResourceUsage[], number]>;
  abstract usageWithResourceAndUser(usageId: number): Promise<ResourceUsage | null>;
  abstract usageWithProject(usageId: number): Promise<ResourceUsage | null>;
  abstract usageForProjectUpdate(resourceId: number, usageId: number): Promise<ResourceUsage | null>;
  abstract saveUsage(usage: Partial<ResourceUsage>): Promise<ResourceUsage>;
  abstract pendingCandidate(resourceId: number, userId: number): Promise<ResourceUsage | null>;
  abstract candidate(id: number): Promise<ResourceUsage | null>;
  abstract insertCandidate(data: Partial<ResourceUsage>): Promise<void>;
  abstract deletePendingCandidate(id: number): Promise<number>;
  abstract endActiveUsage(id: number, endTime: Date, endNotes: string | null | undefined): Promise<number>;
  abstract finalizeUsage(id: number): Promise<void>;
  abstract setBillingFactor(id: number, billingFactor: number): Promise<void>;
  abstract setAttributedDuration(id: number, minutes: number): Promise<void>;
  abstract attempt(id: string, resourceId: number): Promise<ResourceUsageLifecycleAttempt | null>;
  abstract attemptForResource(resourceId: number): Promise<ResourceUsageLifecycleAttempt | null>;
  abstract attempts(): Promise<ResourceUsageLifecycleAttempt[]>;
  abstract saveAttempt(data: NewLifecycleAttempt): Promise<ResourceUsageLifecycleAttempt>;
  abstract deleteAttempt(id: string, resourceId?: number): Promise<void>;
  abstract clearAttemptCandidate(id: string, resourceId: number): Promise<void>;
  abstract setAttemptBillingItems(id: string, items: LifecycleBillingItem[]): Promise<void>;
  abstract pendingUsageExists(resourceId: number): Promise<boolean>;
  abstract recoveryResourceIds(): Promise<number[]>;
  abstract recoverOrphans(): Promise<number>;
  abstract meters(resourceId: number): Promise<ResourceMeter[]>;
}
export const USAGE_OPERATIONS = operationToken<UsagePersistence>('usage lifecycle', [
  'resource',
  'user',
  'activeSession',
  'activeSessions',
  'sessionDetails',
  'history',
  'usageWithResourceAndUser',
  'usageWithProject',
  'usageForProjectUpdate',
  'saveUsage',
  'pendingCandidate',
  'candidate',
  'insertCandidate',
  'deletePendingCandidate',
  'endActiveUsage',
  'finalizeUsage',
  'setBillingFactor',
  'setAttributedDuration',
  'attempt',
  'attemptForResource',
  'attempts',
  'saveAttempt',
  'deleteAttempt',
  'clearAttemptCandidate',
  'setAttemptBillingItems',
  'pendingUsageExists',
  'recoveryResourceIds',
  'recoverOrphans',
  'meters',
]);
