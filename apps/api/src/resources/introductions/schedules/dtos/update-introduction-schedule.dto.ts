// Update DTO for an introduction schedule (all fields optional)
// FEATURE: User retraining requirement (ATT-106)
import { PartialType } from '@nestjs/swagger';
import { CreateIntroductionScheduleDto } from './create-introduction-schedule.dto';

export class UpdateIntroductionScheduleDto extends PartialType(CreateIntroductionScheduleDto) {}
