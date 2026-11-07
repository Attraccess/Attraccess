import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Skips validation only when the field is left out; an explicit null is still validated (and rejected). */
const unlessOmitted = ValidateIf((_object: object, value: unknown) => value !== undefined);

export class CreateGlobalFlowDto {
  @ApiProperty({ description: 'The name of the flow', example: 'Notify on starts' })
  @Transform(trim)
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

export class UpdateGlobalFlowDto {
  @ApiPropertyOptional({ description: 'The name of the flow', example: 'Notify on starts' })
  @Transform(trim)
  @unlessOmitted
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'What the flow does; null clears it', nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ description: 'Disabled flows never run', example: true })
  @unlessOmitted
  @IsBoolean()
  enabled?: boolean;
}

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
