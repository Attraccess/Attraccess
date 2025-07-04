import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class ResourceFlowNodePositionDto {
  @ApiProperty({
    description: 'The x position of the node',
    example: 100,
    type: 'number',
  })
  @IsNumber()
  x: number;

  @ApiProperty({
    description: 'The y position of the node',
    example: 200,
    type: 'number',
  })
  @IsNumber()
  y: number;
}
