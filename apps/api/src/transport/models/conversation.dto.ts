import { ApiProperty } from '@nestjs/swagger';
import type { ResponseFields } from '../response-mapper';

export class Conversation {
  @ApiProperty({ description: 'The unique identifier of the conversation', example: 1 })
  id!: number;

  @ApiProperty({
    description: 'When this conversation was created',
    example: '2025-01-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When this conversation was last updated',
    example: '2025-01-18T12:30:00.000Z',
  })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = { id: null, createdAt: null, updatedAt: null };
}
