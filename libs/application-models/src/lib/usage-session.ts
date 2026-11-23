import type { BillingTransactionRecord } from './billing-ledger';
import { ResourceFormAction } from './form';
import type { ProjectRecord } from './project-record';
import type { FormFieldRecord, FormRecord } from './resource-form-records';
import type { ResourceRecord } from './resource-records';
import { ResourceType } from './resource-type';
import { AutoIntroductionTarget, SupervisionMode } from './resource-supervision';
import { ResourceUsageAction } from './resourceUsage-type';
import type { UserContact, UserProfile } from './user-record';

/** What the session lifecycle needs of a user. */
export interface UsageSessionUser {
  id: number;
  username?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  locale?: string | null;
  billingFactor?: number;
  creditBalance?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/** What the session lifecycle needs of a resource. */
export interface UsageSessionResource {
  id: number;
  name?: string;
  type: ResourceType;
  maxParallelSessions?: number | null;
  maxSessionDurationMinutes?: number | null;
  requireSessionDurationEstimate?: boolean;
  defaultSessionDurationEstimateMinutes?: number | null;
  allowTakeOver?: boolean;
  supervisionMode?: SupervisionMode;
  separateUnlockAndUnlatch?: boolean | null;
  accessOnly?: boolean;
  supervisedUsagesUntilIntroduction?: number | null;
  autoIntroductionTarget?: AutoIntroductionTarget | null;
  autoIntroductionGroupId?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** The rate snapshot of one meter, taken when a session starts. */
export interface UsageMeterRate {
  meterId: number;
  name: string;
  creditsPerUnit: number;
  allocation?: 'shared' | 'per-session';
}

/**
 * The user of a session: the public profile plus the mail address that flows and notifications need. It never leaves
 * the server as it is; responses map it to the public profile.
 */
export type UsageSessionUserRecord = UserContact;

/** The form a stored submission answers, without its fields. */
export type UsageSessionForm = Omit<FormRecord, 'fields'>;

/** A stored form submission of a session, with the relations a read asked for. */
export interface UsageSessionFormSubmission {
  id: number;
  formId: number;
  data: Record<string, UsageFormAnswer>;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
  resourceUsageId: number;
  action: ResourceFormAction;
  form?: UsageSessionForm;
  user?: UserProfile | null;
}

/**
 * A usage session (or a stored door action) with the relations a read asked for. A relation that was not read is
 * absent; a loaded relation whose row does not exist (a deleted user, no project) is null.
 */
export interface UsageSession {
  id: number;
  usageAction: ResourceUsageAction;
  resourceId: number;
  userId: number | null;
  startTime: Date;
  startNotes: string | null;
  endTime: Date | null;
  endNotes: string | null;
  /** Minutes between start and end, -1 while the session runs. Computed by the database. */
  usageInMinutes: number;
  projectId: number | null;
  /** A pending reservation is never visible: it is neither finalized nor counted in any duration. */
  isFinalized: boolean;
  lifecyclePending: boolean;
  supervisorUserId: number | null;
  sessionDurationCreditsPerMinute: number | null;
  operatingDurationCreditsPerMinute: number | null;
  creditsPerUsage: number | null;
  billingFactor: number | null;
  meterRates: UsageMeterRate[] | null;
  attributedOperatingDurationInMinutes: number | null;
  /** When the server ends the session automatically; null means never. Fixed at the start, only raised by extensions. */
  autoEndAt: Date | null;
  /** Start plus the machine's maximum at the start; the cap of extensions. Null when the machine had no maximum. */
  maxAutoEndAt: Date | null;
  /** The estimate the user gave at the start, in minutes. */
  estimatedDurationMinutes: number | null;
  /** The smallest "ending soon" offset already sent for the current deadline. */
  autoEndWarnedOffsetMinutes: number | null;
  resource?: ResourceRecord;
  user?: UsageSessionUserRecord | null;
  project?: ProjectRecord | null;
  supervisorUser?: UserProfile | null;
  formSubmissions?: UsageSessionFormSubmission[];
  billingTransaction?: BillingTransactionRecord | null;
}

/** A session read together with its resource and its user (null once the user was deleted). */
export type UsageSessionWithParties = UsageSession & {
  resource: ResourceRecord;
  user: UsageSessionUserRecord | null;
};

export type UsageLifecycleKind = 'start' | 'end' | 'takeover';

export interface UsageFormAnswer {
  value: string;
  fieldDefinition: FormFieldRecord;
}

/** An answered form that is stored with the session change it belongs to. */
export interface UsageFormSubmissionDraft {
  formId: number;
  resourceUsageId: number;
  userId: number | null;
  action: ResourceFormAction;
  data: Record<string, UsageFormAnswer>;
  form?: FormRecord;
}

/** A billing item a flow staged for the session change; stored on the bill when the change commits. */
export interface UsageBillingItemDraft {
  usageId: number;
  name: string;
  description: string | null;
  externalReference: string | null;
  unitPrice: number;
  quantity: number;
}

/**
 * A reservation of the machine for one start, stop or takeover, never a completed usage or bill. Interrupted
 * attempts are aborted, not replayed.
 */
export interface UsageLifecycleAttempt {
  id: string;
  resourceId: number;
  kind: UsageLifecycleKind;
  /** The tentative session a start or takeover prepared. */
  candidateUsageId: number | null;
  /** The published session a stop or takeover is about to end. */
  previousUsageId: number | null;
  transitionTime: Date;
  formSubmissions: UsageFormSubmissionDraft[];
  billingItems: UsageBillingItemDraft[];
  createdAt?: Date;
}
