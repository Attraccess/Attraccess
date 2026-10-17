import { ApiProperty } from '@nestjs/swagger';
import type { ResponseFields } from '../response-mapper';

export class Permission {
  @ApiProperty({
    description: 'Stable string key identifying this permission',
    example: 'resources.read',
  })
  key!: string;

  @ApiProperty({
    description: 'Human-readable label for this permission',
    example: 'Read Resources',
  })
  label!: string;

  @ApiProperty({
    description: 'Description of what this permission grants',
    example: 'Allows reading resource information',
  })
  description!: string;

  @ApiProperty({
    description: 'Category grouping for this permission',
    example: 'resources',
  })
  category!: string;

  createdAt!: Date;

  updatedAt!: Date;
  static readonly responseFields: ResponseFields = {
    key: null,
    label: null,
    description: null,
    category: null,
    createdAt: null,
    updatedAt: null,
  };
}
