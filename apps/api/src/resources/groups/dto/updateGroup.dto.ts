import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class UpdateResourceGroupDto {
  @ApiProperty({
    description: 'The name of the resource group',
    example: 'Resource Group 1',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'The description of the resource group',
    example: 'This is a resource group',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Days after a user was trained before retraining is required. Null disables the age-based trigger.',
    required: false,
    nullable: true,
    example: 365,
    type: Number,
  })
  @ValidateIf((o) => o.retrainingMaxAgeDays !== null && o.retrainingMaxAgeDays !== undefined)
  @IsInt()
  @Min(0)
  @IsOptional()
  retrainingMaxAgeDays?: number | null;

  @ApiProperty({
    description:
      'Days a user may go without using a grouped resource before retraining is required. Null disables the inactivity trigger.',
    required: false,
    nullable: true,
    example: 180,
    type: Number,
  })
  @ValidateIf((o) => o.retrainingMaxInactivityDays !== null && o.retrainingMaxInactivityDays !== undefined)
  @IsInt()
  @Min(0)
  @IsOptional()
  retrainingMaxInactivityDays?: number | null;

  @ApiProperty({
    description: 'Whether to block access to grouped resources once retraining is due until the user is retrained',
    required: false,
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  retrainingBlocksAccess?: boolean;
}
