import type { ProjectSwitchCharging } from './project-switch-charging';
import { BillingTransactionStatus } from './billing-transaction';

/**
 * Neutral billing records. They carry exactly the fields the HTTP API, live notifications and receipts expose, so
 * adapters map storage rows to them and application code never sees an ORM entity. Nullable columns are optional
 * as well: a freshly inserted row only carries what was written.
 */

/** One person's share of a segment of a machine that several people used at once. */
export interface BillingAllocationSegmentRecord {
  startedAt: string;
  endedAt: string;
  participants: number;
  /** Total of the whole segment in meter units, or milliseconds for running time. */
  totalQuantity: string;
  totalCredits: number;
  /** This person's share of the quantity and the whole credits charged for it. */
  shareQuantity: string;
  shareCredits: number;
}

export interface BillingAllocationRecord {
  kind: 'meter' | 'operating-time';
  segments: BillingAllocationSegmentRecord[];
  /** The share is not known yet: a segment the person was in has no closing reading. */
  pending?: boolean;
}

export interface BillingTransactionItemRecord {
  id: number;
  billingTransactionId: number;
  name: string;
  description: string | null;
  externalReference: string | null;
  unitPrice: number;
  quantity: number;
  durationMs: number | null;
  meterQuantity: string | null;
  meterCreditsPerUnit: number | null;
  allocation: BillingAllocationRecord | null;
}

export interface BillingTransactionRecord {
  id: number;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
  amount: number;
  initiatorId?: number | null;
  resourceUsageId?: number | null;
  refundOfId?: number | null;
  correctionOfId?: number | null;
  externalReference?: string | null;
  status: BillingTransactionStatus;
  items?: BillingTransactionItemRecord[];
}

/** The public fields of a user as shown beside a transaction (never mail address, tokens or lock state). */
export interface BillingUserSummary {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  locale: string;
  dateTimeLocale: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  externalIdentifier: string | null;
  creditBalance: number;
  billingFactor: number;
}

/** The serialized fields of a resource usage or resource owned by the resources area, passed through as shown. */
export interface BillingSerializedRecord {
  id: number;
  [field: string]: unknown;
}

/** A transaction with the relations the history and detail views show. */
export interface BillingTransactionDetail extends BillingTransactionRecord {
  initiator?: BillingUserSummary | null;
  resourceUsage?: (BillingSerializedRecord & { resource?: BillingSerializedRecord | null }) | null;
  refundOf?: BillingTransactionRecord | null;
}

export interface BillingTransactionPage {
  data: BillingTransactionDetail[];
  total: number;
  page: number;
  limit: number;
}

export interface ResourceBillingConfigurationRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  creditsPerUsage: number;
  creditsPerMinute: number;
  creditsPerOperatingMinute: number;
  projectSwitchCharging: ProjectSwitchCharging;
}

/** What a usage receipt mail is built from. */
export interface UsageReceiptSource {
  transaction: BillingTransactionRecord;
  recipient: {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    locale: string;
    creditBalance: number;
  } | null;
  usage: {
    startTime: Date;
    endTime: Date | null;
    billingFactor: number | null;
    resource: { id: number; name: string };
  } | null;
}
