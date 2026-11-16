import type { NotificationRecipient } from '@attraccess/application-models';

/**
 * What the email service reads of its collaborators' records. They are structural: billing, project and resource
 * records satisfy them without conversion, and the email code never depends on how they are stored.
 */

export interface ReceiptAllocationSegment {
  startedAt: string;
  endedAt: string;
  participants: number;
  totalQuantity: string;
  totalCredits: number;
  shareQuantity: string;
  shareCredits: number;
}

export interface ReceiptAllocation {
  kind: 'meter' | 'operating-time';
  segments: ReceiptAllocationSegment[];
  pending?: boolean;
}

export interface ReceiptItem {
  name: string;
  description: string | null;
  unitPrice: number;
  quantity: number;
  durationMs: number | null;
  meterQuantity: string | null;
  meterCreditsPerUnit: number | null;
  allocation: ReceiptAllocation | null;
}

export interface ReceiptTransaction {
  amount: number;
  items?: ReceiptItem[];
}

export interface ReceiptUsage {
  resource: { id: number; name: string };
  startTime: Date;
  endTime: Date | null;
  billingFactor: number | null;
}

export interface ReceiptRecipient extends NotificationRecipient {
  creditBalance: number;
}

export interface InvitedProject {
  id: number;
  name: string;
  description?: string | null;
}

export interface ProjectInvitationDetails {
  id: number;
  inviter?: { username: string; email: string } | null;
  requestedRole: string;
}

/** A resource reference in an email. */
export interface EmailResourceRef {
  id: number;
  name: string;
}
