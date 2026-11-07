import { ApiProperty } from '@nestjs/swagger';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';

/*
 * `User.email` is @Exclude()d globally so it never leaks through the regular endpoints. The CSV export is the
 * one place that legitimately needs it, so the analytics responses carry explicit, flat email fields instead of
 * relaxing the global exclusion. The nested `user` objects still serialize without `email`.
 */

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
  @ApiProperty({ description: 'Email address of the user (analytics export only)', nullable: true, type: String })
  userEmail: string | null;

  @ApiProperty({
    description: 'Email address of the initiating user (analytics export only)',
    nullable: true,
    type: String,
  })
  initiatorEmail: string | null;
}

export function toResourceUsageExportRow(usage: ResourceUsage): ResourceUsageExportRowDto {
  return {
    ...usage,
    userEmail: usage.user?.email ?? null,
    supervisorEmail: usage.supervisorUser?.email ?? null,
  } as ResourceUsageExportRowDto;
}

export function toBillingTransactionExportRow(transaction: BillingTransaction): BillingTransactionExportRowDto {
  return {
    ...transaction,
    userEmail: transaction.user?.email ?? null,
    initiatorEmail: transaction.initiator?.email ?? null,
  } as BillingTransactionExportRowDto;
}
