import type {
  IntroductionHistoryAction,
  IntroductionHistoryRecord,
  IntroductionRecord,
} from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../resource-persistence-context';

export const RESOURCE_INTRODUCTION_STORE = Symbol.for('attraccess.resources.introduction-store');

/** Introductions of users to resources (and, for the group variant, to resource groups) with their history. */
export interface ResourceIntroductionStore {
  /** The introduction of the user to the resource, if any. */
  findOfUser(
    resourceId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionRecord | null>;

  /** The introduction of the user to the resource group, if any. */
  findOfGroupUser(
    groupId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionRecord | null>;

  /** Introductions to the group with receiver, tutor and history. */
  listForGroup(groupId: number): Promise<IntroductionRecord[]>;

  historyOfGroupUser(groupId: number, userId: number): Promise<IntroductionHistoryRecord[]>;

  createForGroup(groupId: number, userId: number, tutorUserId?: number): Promise<IntroductionRecord>;

  findById(introductionId: number): Promise<IntroductionRecord | null>;

  /** The newest history item of the introduction. */
  lastHistoryItem(
    introductionId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionHistoryRecord | null>;

  /** The newest GRANT history item of the introduction. */
  latestGrant(introductionId: number, context?: ResourcePersistenceContext): Promise<IntroductionHistoryRecord | null>;

  /**
   * Introductions of a resource with receiver, tutor and history; with `includeGroups` also those of the groups the
   * resource belongs to, with their group.
   */
  listForResource(resourceId: number, includeGroups: boolean): Promise<IntroductionRecord[]>;

  historyOfUser(resourceId: number, userId: number): Promise<IntroductionHistoryRecord[]>;

  create(resourceId: number, userId: number, tutorUserId?: number): Promise<IntroductionRecord>;

  setTutor(introductionId: number, tutorUserId: number): Promise<void>;

  addHistoryItem(
    introductionId: number,
    action: IntroductionHistoryAction,
    comment: string | undefined,
    performedByUserId: number,
  ): Promise<IntroductionHistoryRecord>;

  /** Introductions to a resource or group that has a retraining rule, with the receiver's address. */
  listWithRetrainingRule(): Promise<IntroductionRecord[]>;

  markRetrainingRequiredAudited(introductionId: number, at: Date): Promise<void>;

  markRetrainingNotified(introductionId: number, at: Date): Promise<void>;
}
