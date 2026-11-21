import type {
  BillingSerializedRecord,
  BillingTransactionDetail,
  BillingTransactionItemRecord,
  BillingTransactionRecord,
  BillingUserSummary,
  ResourceBillingConfigurationRecord,
  UsageReceiptSource,
} from '@attraccess/application-models';
import type {
  BillingTransaction,
  BillingTransactionItem,
  ResourceBillingConfiguration,
  User,
} from '@attraccess/database-entities';
import { instanceToPlain } from 'class-transformer';

/** Copies a stored row field by field; a field the row does not carry stays absent (JSON drops it). */
export function toItemRecord(item: BillingTransactionItem): BillingTransactionItemRecord {
  return {
    id: item.id,
    billingTransactionId: item.billingTransactionId,
    name: item.name,
    description: item.description,
    externalReference: item.externalReference,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    durationMs: item.durationMs,
    meterQuantity: item.meterQuantity,
    meterCreditsPerUnit: item.meterCreditsPerUnit,
    allocation: item.allocation,
  };
}

export function toTransactionRecord(row: BillingTransaction): BillingTransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    amount: row.amount,
    initiatorId: row.initiatorId,
    resourceUsageId: row.resourceUsageId,
    refundOfId: row.refundOfId,
    correctionOfId: row.correctionOfId,
    externalReference: row.externalReference,
    status: row.status,
    items: row.items?.map(toItemRecord),
  };
}

/** The user fields a transaction view shows; excluded fields (mail, tokens, lock state) are never copied. */
export function toUserSummary(user: User): BillingUserSummary {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    locale: user.locale,
    dateTimeLocale: user.dateTimeLocale,
    isEmailVerified: user.isEmailVerified,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    externalIdentifier: user.externalIdentifier,
    creditBalance: user.creditBalance,
    billingFactor: user.billingFactor,
  };
}

/**
 * Usages and resources belong to the resources area and are shown as stored. They are serialized with the entity
 * rules (excluded fields dropped), which is what the HTTP layer did for them before.
 */
function toSerialized<T extends object>(entity: T | null | undefined): BillingSerializedRecord | null | undefined {
  if (!entity) return entity as null | undefined;
  return instanceToPlain(entity) as BillingSerializedRecord;
}

export function toTransactionDetail(row: BillingTransaction): BillingTransactionDetail {
  return {
    ...toTransactionRecord(row),
    initiator: row.initiator ? toUserSummary(row.initiator) : row.initiator,
    // The usage is serialized with its loaded resource.
    resourceUsage: toSerialized(row.resourceUsage) as BillingTransactionDetail['resourceUsage'],
    refundOf: row.refundOf ? toTransactionRecord(row.refundOf) : row.refundOf,
  };
}

export function toConfigurationRecord(row: ResourceBillingConfiguration): ResourceBillingConfigurationRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resourceId: row.resourceId,
    creditsPerUsage: row.creditsPerUsage,
    creditsPerMinute: row.creditsPerMinute,
    creditsPerOperatingMinute: row.creditsPerOperatingMinute,
  };
}

export function toUsageReceipt(row: BillingTransaction): UsageReceiptSource {
  const usage = row.resourceUsage;
  return {
    transaction: toTransactionRecord(row),
    recipient: row.user
      ? {
          id: row.user.id,
          username: row.user.username,
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          email: row.user.email,
          locale: row.user.locale,
          creditBalance: row.user.creditBalance,
        }
      : null,
    usage: usage
      ? {
          startTime: usage.startTime,
          endTime: usage.endTime,
          billingFactor: usage.billingFactor,
          resource: { id: usage.resource.id, name: usage.resource.name },
        }
      : null,
  };
}
