import type {
  BillingTransactionDetail,
  BillingTransactionItemRecord,
  BillingTransactionPage,
  BillingTransactionRecord,
  ResourceBillingConfigurationRecord,
} from '@attraccess/application-models';
import { BillingTransactionDto, BillingTransactionItemDto } from './billing-transaction.dto';
import { ResourceBillingConfigurationValuesDto } from './resource-billing-configuration.dto';
import { TransactionsDto } from './transactions.dto';

/**
 * Explicit record-to-DTO mapping. Every field is named here, so nothing a record might gain later reaches the HTTP
 * response unnoticed. A field a record does not carry stays absent from the JSON.
 */
export function toBillingTransactionItemDto(item: BillingTransactionItemRecord): BillingTransactionItemDto {
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

export function toBillingTransactionDto(
  transaction: BillingTransactionRecord | BillingTransactionDetail,
): BillingTransactionDto {
  const detail = transaction as BillingTransactionDetail;
  return {
    id: transaction.id,
    userId: transaction.userId,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    amount: transaction.amount,
    initiatorId: transaction.initiatorId,
    resourceUsageId: transaction.resourceUsageId,
    refundOfId: transaction.refundOfId,
    correctionOfId: transaction.correctionOfId,
    externalReference: transaction.externalReference,
    status: transaction.status,
    items: transaction.items?.map(toBillingTransactionItemDto),
    initiator: detail.initiator,
    resourceUsage: detail.resourceUsage,
    refundOf: detail.refundOf ? toBillingTransactionDto(detail.refundOf) : detail.refundOf,
  };
}

export function toTransactionsDto(page: BillingTransactionPage): TransactionsDto {
  return {
    data: page.data.map(toBillingTransactionDto),
    total: page.total,
    page: page.page,
    limit: page.limit,
  };
}

export function toResourceBillingConfigurationValuesDto(
  configuration: ResourceBillingConfigurationRecord,
): ResourceBillingConfigurationValuesDto {
  return {
    id: configuration.id,
    createdAt: configuration.createdAt,
    updatedAt: configuration.updatedAt,
    resourceId: configuration.resourceId,
    creditsPerUsage: configuration.creditsPerUsage,
    creditsPerMinute: configuration.creditsPerMinute,
    creditsPerOperatingMinute: configuration.creditsPerOperatingMinute,
    projectSwitchCharging: configuration.projectSwitchCharging,
  };
}
