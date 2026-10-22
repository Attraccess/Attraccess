import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroduction } from './resourceIntroduction.dto';
import { ResourceIntroducer } from './resourceIntroducer.dto';
import { Resource } from './resource.dto';
import type { ResponseFields } from '../response-mapper';

export class ResourceGroup {
  @ApiProperty({
    description: 'The unique identifier of the resource group',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The name of the resource',
    example: '3D Printer',
  })
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

  @ApiProperty({
    description: 'When the resource was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the resource was last updated',
  })
  updatedAt!: Date;

  introductions!: ResourceIntroduction[];

  introducers!: ResourceIntroducer[];

  resources!: Resource[];
  static readonly responseFields: ResponseFields = {
    id: null,
    name: null,
    description: null,
    retrainingMaxAgeDays: null,
    retrainingMaxInactivityDays: null,
    retrainingBlocksAccess: null,
    isHidden: null,
    createdAt: null,
    updatedAt: null,
    introductions: () => ResourceIntroduction,
    introducers: () => ResourceIntroducer,
    resources: () => Resource,
  };
}
