import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGlobalFlowDto {
  @ApiProperty({ description: 'The name of the flow', example: 'Notify on starts' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'What the flow does', nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ description: 'Disabled flows never run. Defaults to true.', example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateGlobalFlowDto extends PartialType(CreateGlobalFlowDto) {}

export class GlobalFlowDto extends PickType(CreateGlobalFlowDto, ['name'] as const) {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({ enum: ['global'], example: 'global' })
  scope: 'global';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class GlobalFlowSummaryDto extends GlobalFlowDto {
  @ApiProperty({ description: 'How many nodes the flow has', example: 4 })
  nodeCount: number;
}
