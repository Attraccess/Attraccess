import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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
    description: 'The source handle id',
    example: 'output',
    type: 'string',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceHandle: string | null;

  @ApiProperty({
    description: 'The target node id',
    example: 'TGVgqDzCKXKVr-XGUD5V4',
    type: 'string',
  })
  @IsString()
  target: string;

  @ApiProperty({
    description: 'The target handle id',
    example: 'input',
    type: 'string',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  targetHandle: string | null;
}
