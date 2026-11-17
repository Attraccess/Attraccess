import type { BillingTransaction, ResourceUsage, User } from '@attraccess/database-entities';
import type {
  BillingTransactionExportRowDto,
  ResourceUsageExportRowDto,
} from '../../../analytics/dtos/analyticsExportRows.dto';
import { toUserDto } from '../../../users-and-auth/users/dtos/user.dto';

/*
 * Field by field mapping of the stored rows to the export response classes. Users are mapped to the public user
 * shape (no email, tokens or lockout state); the export's own email fields are filled explicitly. The resource,
 * usage and item relations keep their stored form, serialized by their own response rules as before.
 */

const publicUser = (user: User | null | undefined) => (user ? toUserDto(user) : user);

export function toResourceUsageExportRow(usage: ResourceUsage): ResourceUsageExportRowDto {
  return {
    sessionDurationCreditsPerMinute: usage.sessionDurationCreditsPerMinute,
    operatingDurationCreditsPerMinute: usage.operatingDurationCreditsPerMinute,
    creditsPerUsage: usage.creditsPerUsage,
    billingFactor: usage.billingFactor,
    meterRates: usage.meterRates,
    attributedOperatingDurationInMinutes: usage.attributedOperatingDurationInMinutes,
    id: usage.id,
    usageAction: usage.usageAction,
    resourceId: usage.resourceId,
    userId: usage.userId,
    startTime: usage.startTime,
    startNotes: usage.startNotes,
    endTime: usage.endTime,
    endNotes: usage.endNotes,
    resource: usage.resource,
    user: publicUser(usage.user),
    usageInMinutes: usage.usageInMinutes,
    projectId: usage.projectId,
    isFinalized: usage.isFinalized,
    lifecyclePending: usage.lifecyclePending,
    supervisorUserId: usage.supervisorUserId,
    supervisorUser: publicUser(usage.supervisorUser),
    userEmail: usage.user?.email ?? null,
    supervisorEmail: usage.supervisorUser?.email ?? null,
  };
}

export function toBillingTransactionExportRow(
  transaction: BillingTransaction,
  includeEmail: boolean,
): BillingTransactionExportRowDto {
  return {
    id: transaction.id,
    userId: transaction.userId,
    user: publicUser(transaction.user),
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    amount: transaction.amount,
    initiatorId: transaction.initiatorId,
    initiator: publicUser(transaction.initiator),
    resourceUsageId: transaction.resourceUsageId,
    resourceUsage: transaction.resourceUsage,
    refundOfId: transaction.refundOfId,
    correctionOfId: transaction.correctionOfId,
    externalReference: transaction.externalReference,
    status: transaction.status,
    items: transaction.items,
    userEmail: includeEmail ? (transaction.user?.email ?? null) : null,
    initiatorEmail: includeEmail ? (transaction.initiator?.email ?? null) : null,
  };
}
