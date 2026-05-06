// DTO for INACTIVITY trigger config
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import {
  RetrainingIntervalUnit,
  ResourceIntroductionScheduleInactivityScope,
} from '@attraccess/database-entities';

export class InactivityConfigDto {
  @ApiProperty({ example: 6 })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  @IsEnum(RetrainingIntervalUnit)
  unit!: RetrainingIntervalUnit;

  @ApiProperty({
    enum: ResourceIntroductionScheduleInactivityScope,
    enumName: 'ResourceIntroductionScheduleInactivityScope',
  })
  @IsEnum(ResourceIntroductionScheduleInactivityScope)
  scope!: ResourceIntroductionScheduleInactivityScope;
}
