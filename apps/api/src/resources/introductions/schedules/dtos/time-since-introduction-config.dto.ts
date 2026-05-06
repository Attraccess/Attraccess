// DTO for TIME_SINCE_INTRODUCTION trigger config
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { RetrainingIntervalUnit } from '@attraccess/database-entities';

export class TimeSinceIntroductionConfigDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  @IsEnum(RetrainingIntervalUnit)
  unit!: RetrainingIntervalUnit;
}
