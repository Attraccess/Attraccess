import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateResourceBillingConfigurationDto {
  @ApiProperty({
    description: 'The credit cost per usage',
    example: 5,
    required: false,
    type: Number,
    nullable: true,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  creditsPerUsage?: number | null;

  @ApiProperty({
    description: 'The credit cost per minute',
    example: 0.2,
    required: false,
    type: Number,
    nullable: true,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  creditsPerMinute?: number | null;

  @ApiProperty({
    description: 'The credit cost per attributable operating minute',
    example: 0.2,
    required: false,
    type: Number,
    nullable: true,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  creditsPerOperatingMinute?: number | null;
}
