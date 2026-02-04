import { ApiProperty } from '@nestjs/swagger';

export class SubFlowListResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the sub-flow',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The name of the sub-flow',
    example: 'Notify usage updates',
  })
  name: string;

  @ApiProperty({
    description: 'Optional description of the sub-flow',
    required: false,
    example: 'Reusable flow for sending MQTT updates.',
  })
  description?: string | null;

  @ApiProperty({
    description: 'Input handles available for this sub-flow',
    type: 'string',
    isArray: true,
    example: ['input'],
  })
  inputs: string[];

  @ApiProperty({
    description: 'Output handles available for this sub-flow',
    type: 'string',
    isArray: true,
    example: ['output'],
  })
  outputs: string[];

  @ApiProperty({
    description: 'When the sub-flow was created',
    type: String,
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the sub-flow was last updated',
    type: String,
    format: 'date-time',
  })
  updatedAt: Date;
}
