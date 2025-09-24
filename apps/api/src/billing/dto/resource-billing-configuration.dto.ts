import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';

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

export class ResourceBillingConfigurationDto {
  @ApiProperty({
    description: 'the configuration',
    required: true,
    type: ResourceBillingConfiguration,
  })
  configuration: ResourceBillingConfiguration;

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
