import { ApiProperty } from '@nestjs/swagger';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';

/*
 * `User.email` is @Exclude()d globally so it never leaks through the regular endpoints. The CSV export is the
 * one place that legitimately needs it, so the analytics responses carry explicit, flat email fields instead of
 * relaxing the global exclusion. The nested `user` objects still serialize without `email`.
 *
 * The billing endpoint is guarded by `resources.update`, which on its own does not grant access to emails, so its
 * email fields are only filled for callers that also hold one of BILLING_EXPORT_EMAIL_PERMISSIONS.
 */

export const BILLING_EXPORT_EMAIL_PERMISSIONS = ['billing.manage', 'resources.reports.export'] as const;

export class ResourceUsageExportRowDto extends ResourceUsage {
  @ApiProperty({ description: 'Email address of the user (analytics export only)', nullable: true, type: String })
  userEmail: string | null;

  @ApiProperty({
    description: 'Email address of the supervising user (analytics export only)',
    nullable: true,
    type: String,
  })
  supervisorEmail: string | null;
}

export class BillingTransactionExportRowDto extends BillingTransaction {
  @ApiProperty({
    description:
      'Email address of the user (analytics export only). Null unless the caller holds billing.manage or resources.reports.export.',
    nullable: true,
    type: String,
  })
  userEmail: string | null;

  @ApiProperty({
    description:
      'Email address of the initiating user (analytics export only). Null unless the caller holds billing.manage or resources.reports.export.',
    nullable: true,
    type: String,
  })
  initiatorEmail: string | null;
}

export function toResourceUsageExportRow(usage: ResourceUsage): ResourceUsageExportRowDto {
  return Object.assign(new ResourceUsageExportRowDto(), usage, {
    userEmail: usage.user?.email ?? null,
    supervisorEmail: usage.supervisorUser?.email ?? null,
  });
}

export function toBillingTransactionExportRow(
  transaction: BillingTransaction,
  includeEmail: boolean,
): BillingTransactionExportRowDto {
  return Object.assign(new BillingTransactionExportRowDto(), transaction, {
    userEmail: includeEmail ? (transaction.user?.email ?? null) : null,
    initiatorEmail: includeEmail ? (transaction.initiator?.email ?? null) : null,
  });
}
