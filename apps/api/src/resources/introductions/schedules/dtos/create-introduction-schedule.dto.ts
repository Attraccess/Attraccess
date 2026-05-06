// Create DTO for an introduction schedule (validates config matches triggerType)
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceIntroductionScheduleTriggerType } from '@attraccess/database-entities';
import { TimeSinceIntroductionConfigDto } from './time-since-introduction-config.dto';
import { InactivityConfigDto } from './inactivity-config.dto';

export class CreateIntroductionScheduleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string | null;

  @ApiProperty({
    enum: ResourceIntroductionScheduleTriggerType,
    enumName: 'ResourceIntroductionScheduleTriggerType',
  })
  @IsEnum(ResourceIntroductionScheduleTriggerType)
  triggerType!: ResourceIntroductionScheduleTriggerType;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  blockAccess?: boolean;

  @ApiProperty({ default: 0, minimum: 0, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  warnDaysBefore?: number;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf(
    (o: CreateIntroductionScheduleDto) =>
      o.triggerType === ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => TimeSinceIntroductionConfigDto)
  @ApiProperty({ required: false, type: TimeSinceIntroductionConfigDto })
  timeSinceIntroductionConfig?: TimeSinceIntroductionConfigDto;

  @ValidateIf(
    (o: CreateIntroductionScheduleDto) =>
      o.triggerType === ResourceIntroductionScheduleTriggerType.INACTIVITY
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => InactivityConfigDto)
  @ApiProperty({ required: false, type: InactivityConfigDto })
  inactivityConfig?: InactivityConfigDto;
}
