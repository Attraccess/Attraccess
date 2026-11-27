// The related resource is documented with its public schema; it is not billing data.
import { Resource } from '../../resources/dtos/resource.dto';
import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { ProjectSwitchCharging } from '@attraccess/application-models';

class ResourceBillingConfigurationItemDto {
  @ApiProperty({
    description: 'the name of the item',
    required: true,
    type: String,
  })
  name: string;

  @ApiProperty({
    description: 'the unit price of the item',
    required: true,
    type: Number,
  })
  unitPrice: number;

  @ApiProperty({
    description: 'the quantity of the item',
    required: true,
    type: Number,
  })
  quantity: number;
}

/** Schema name stays `ResourceBillingConfiguration` so the published API description does not change. */
@ApiSchema({ name: 'ResourceBillingConfiguration' })
export class ResourceBillingConfigurationValuesDto {
  @ApiProperty({ description: 'The unique identifier of the resource billing configuration', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The ID of the resource' })
  resourceId!: number;

  @ApiProperty({ description: 'The resource', required: false, type: () => Resource })
  resource?: unknown;

  @ApiProperty({ description: 'The credit cost per usage' })
  creditsPerUsage!: number;

  @ApiProperty({ description: 'The credit cost per minute' })
  creditsPerMinute!: number;

  @ApiProperty({ description: 'The credit cost per attributable operating minute' })
  creditsPerOperatingMinute!: number;

  @ApiProperty({
    description: 'How a running session is charged when its owner switches its project',
    enum: ProjectSwitchCharging,
    enumName: 'ProjectSwitchCharging',
  })
  projectSwitchCharging!: ProjectSwitchCharging;
}

export class ResourceBillingConfigurationDto {
  @ApiProperty({
    description: 'the configuration',
    required: true,
    type: ResourceBillingConfigurationValuesDto,
  })
  configuration: ResourceBillingConfigurationValuesDto;

  @ApiProperty({
    description: 'the additional items',
    required: true,
    type: [ResourceBillingConfigurationItemDto],
  })
  additionalItems: ResourceBillingConfigurationItemDto[];

  @ApiProperty({
    description: 'whether billing is enabled',
    required: true,
    type: Boolean,
  })
  isBillingEnabled: boolean;
}
