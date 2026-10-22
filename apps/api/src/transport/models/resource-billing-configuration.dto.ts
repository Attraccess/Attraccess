import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import type { ResponseFields } from '../response-mapper';

export class ResourceBillingConfiguration {
  @ApiProperty({
    description: 'The unique identifier of the resource billing configuration',
    example: 1,
  })
  id!: number;

  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The ID of the resource' })
  resourceId!: number;

  @ApiProperty({ description: 'The resource', required: false })
  resource!: Resource;

  @ApiProperty({ description: 'The credit cost per usage' })
  creditsPerUsage!: number;

  @ApiProperty({ description: 'The credit cost per minute' })
  creditsPerMinute!: number;

  @ApiProperty({ description: 'The credit cost per attributable operating minute' })
  creditsPerOperatingMinute!: number;
  static readonly responseFields: ResponseFields = {
    id: null,
    createdAt: null,
    updatedAt: null,
    resourceId: null,
    resource: () => Resource,
    creditsPerUsage: null,
    creditsPerMinute: null,
    creditsPerOperatingMinute: null,
  };
}
