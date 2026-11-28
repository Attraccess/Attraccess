import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { ProjectSwitchCharging } from '@attraccess/application-models';

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

  @ApiProperty({
    description:
      'How a running session is charged when its owner splits it between projects (moving a whole session to another project charges nothing). `continue`: no new fee per use and minutes rounded on cumulative boundaries, so the parts together never bill more than one unsplit session. `continue-per-part-rounding`: no new fee per use, every part rounds its own minutes up. `new-session`: every part is billed like a session of its own, including the balance check.',
    enum: ProjectSwitchCharging,
    enumName: 'ProjectSwitchCharging',
    required: false,
  })
  @IsEnum(ProjectSwitchCharging)
  @IsOptional()
  projectSwitchCharging?: ProjectSwitchCharging;
}
