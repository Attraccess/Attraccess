import { ApiProperty } from '@nestjs/swagger';
import type { ResponseFields } from '../response-mapper';

export class Setting {
  @ApiProperty({
    description: 'The unique identifier of the setting',
    example: 1,
  })
  id!: number;

  @ApiProperty({ description: 'The parent "object" this settings key belongs to' })
  parent!: string | null;

  @ApiProperty({ description: 'The key of the setting' })
  key!: string;

  @ApiProperty({ description: 'The value of the setting' })
  value!: string;

  @ApiProperty({ description: 'The date and time the setting was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the setting was last updated' })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = {
    id: null,
    parent: null,
    key: null,
    value: null,
    createdAt: null,
    updatedAt: null,
  };
}
