import { ApiProperty } from '@nestjs/swagger';
import type { ResourceGroupRecord } from '@attraccess/application-models';

/*
 * Response shape of the resource group endpoints. The class name is the OpenAPI schema name the generated client
 * and the frontend already use, so it stays what the former entity response was called.
 */
export class ResourceGroup {
  @ApiProperty({ description: 'The unique identifier of the resource group', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The name of the resource', example: '3D Printer' })
  name!: string;

  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  description!: string | null;

  @ApiProperty({
    description:
      'Days after a user was trained on this group before retraining is required. Null disables the age-based trigger.',
    example: 365,
    required: false,
    nullable: true,
  })
  retrainingMaxAgeDays!: number | null;

  @ApiProperty({
    description:
      'Days a user may go without using a resource in this group before retraining is required. Null disables the inactivity trigger.',
    example: 180,
    required: false,
    nullable: true,
  })
  retrainingMaxInactivityDays!: number | null;

  @ApiProperty({
    description: 'Whether to block access to grouped resources once retraining is due until the user is retrained',
    example: false,
    default: false,
  })
  retrainingBlocksAccess!: boolean;

  @ApiProperty({
    description:
      'Whether to hide this group from users who are not part of it (introducer, maintainer or introduced). Users with the canManageResources permission always see hidden groups.',
    example: false,
    default: false,
  })
  isHidden!: boolean;

  @ApiProperty({ description: 'When the resource was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the resource was last updated' })
  updatedAt!: Date;
}

export function toResourceGroupDto(record: ResourceGroupRecord): ResourceGroup {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    retrainingMaxAgeDays: record.retrainingMaxAgeDays,
    retrainingMaxInactivityDays: record.retrainingMaxInactivityDays,
    retrainingBlocksAccess: record.retrainingBlocksAccess,
    isHidden: record.isHidden,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
