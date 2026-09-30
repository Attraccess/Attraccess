import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class ResolveResourceFlowNodeSchemaDto {
  @ApiProperty({
    description: 'The configuration selected in the flow editor so far.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  config: Record<string, unknown>;
}
