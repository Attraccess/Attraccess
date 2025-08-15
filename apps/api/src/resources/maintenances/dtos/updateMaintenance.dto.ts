import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateMaintenanceDto {
  @ApiProperty({
    description: 'When the maintenance starts (must be in the future)',
    type: String,
    format: 'date-time',
    example: '2025-01-01T10:00:00.000Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiProperty({
    description: 'When the maintenance ends (optional)',
    type: String,
    format: 'date-time',
    example: '2025-01-01T18:00:00.000Z',
    required: false,
    nullable: true,
  })
  @IsDateString()
  @IsOptional()
  endTime?: string | null;

  @ApiProperty({
    description: 'The reason for the maintenance',
    example: 'Scheduled maintenance for software updates',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
