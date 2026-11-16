import { ResourceFormAction } from './form';
import { ResourceType } from './resource-type';
import { ResourceUsageAction } from './resourceUsage-type';

/**
 * Related records of a usage session are carried as they were read (their fields are owned by the user, resource,
 * project, form and billing features). The lifecycle only relies on the fields named in the narrow views below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a deliberately open shape owned by another feature
export type UsageRelatedRecord = any;

/** What the session lifecycle needs of a user. */
export interface UsageSessionUser {
  id: number;
  username?: string;
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
  allowTakeOver?: boolean;
}

/** The rate snapshot of one meter, taken when a session starts. */
export interface UsageMeterRate {
  meterId: number;
  name: string;
  creditsPerUnit: number;
  allocation?: 'shared' | 'per-session';
}

/** A usage session (or a stored door action) with the relations a read asked for. */
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
  resource: UsageRelatedRecord;
  user: UsageRelatedRecord;
  project: UsageRelatedRecord;
  supervisorUser: UsageRelatedRecord;
  formSubmissions: UsageRelatedRecord;
  billingTransaction: UsageRelatedRecord;
}

export type UsageLifecycleKind = 'start' | 'end' | 'takeover';

export interface UsageFormAnswer {
  value: string;
  fieldDefinition: { id: number; name: string } & UsageRelatedRecord;
}

/** An answered form that is stored with the session change it belongs to. */
export interface UsageFormSubmissionDraft {
  formId: number;
  resourceUsageId: number;
  userId: number | null;
  action: ResourceFormAction;
  data: Record<string, UsageFormAnswer>;
  form?: UsageRelatedRecord;
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
