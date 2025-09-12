import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class UpdateResourceBillingConfigurationDto {
  @ApiProperty({
    description: 'The credit cost per usage',
    example: 100,
    required: false,
    type: Number,
  })
  @IsNumber()
  @IsOptional()
  @IsPositive()
  @Min(0)
  creditsPerUsage?: number;

  @ApiProperty({
    description: 'The credit cost per minute',
    example: 100,
    required: false,
    type: Number,
  })
  @IsNumber()
  @IsOptional()
  @IsPositive()
  @Min(0)
  creditsPerMinute?: number;
}
