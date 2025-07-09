import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ResourceFlowEdgeDto {
  @ApiProperty({
    description: 'The unique identifier of the resource flow edge',
    example: 'edge-abc123',
    type: 'string',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'The source node id',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
    type: 'string',
  })
  @IsString()
  source: string;

  @ApiProperty({
    description: 'The target node id',
    example: 'TGVgqDzCKXKVr-XGUD5V4',
    type: 'string',
  })
  @IsString()
  target: string;
}
