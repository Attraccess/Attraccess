import type { ResourceActorUser, ResourceNotificationRecipient } from './resource-actor-user';
import type { IntroductionHistoryAction } from './resourceIntroductionHistoryItem';

/** A resource group: a set of resources that share introductions, introducers and retraining rules. */
export interface ResourceGroupRecord {
  id: number;
  name: string;
  description: string | null;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** One grant or revocation of an introduction. */
export interface IntroductionHistoryRecord {
  id: number;
  introductionId: number;
  action: IntroductionHistoryAction;
  performedByUserId: number;
  comment: string | null;
  createdAt: Date;
  performedByUser?: ResourceActorUser | null;
}

/** The introduction of one user to a resource or to a resource group. */
export interface IntroductionRecord {
  id: number;
  resourceId: number | null;
  resourceGroupId: number | null;
  receiverUserId: number;
  tutorUserId: number | null;
  completedAt: Date;
  retrainingNotifiedAt: Date | null;
  retrainingRequiredAuditedAt: Date | null;
  createdAt: Date;
  /** Present when the read asked for the people and the history. */
  receiverUser?: ResourceActorUser | null;
  tutorUser?: ResourceActorUser | null;
  history?: IntroductionHistoryRecord[];
  resourceGroup?: ResourceGroupRecord | null;
  /** The receiver as a notification recipient (with address), for retraining reminders. */
  receiver?: ResourceNotificationRecipient | null;
}
