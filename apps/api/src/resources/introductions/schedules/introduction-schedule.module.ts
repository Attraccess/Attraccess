// Bundles schedule CRUD service, evaluator, and resource+group schedule controllers
// FEATURE: User retraining requirement (ATT-106)
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { EmailModule } from '../../../email/email.module';
import { IntroductionScheduleService } from './introduction-schedule.service';
import { IntroductionScheduleEvaluatorService } from './introduction-schedule-evaluator.service';
import { IntroductionScheduleController } from './introduction-schedule.controller';
import { GroupIntroductionScheduleController } from '../../groups/introductions/schedules/group-introduction-schedule.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceGroup,
      ResourceIntroduction,
      ResourceIntroductionHistoryItem,
      ResourceIntroductionSchedule,
      ResourceIntroductionScheduleInactivityConfig,
      ResourceIntroductionScheduleTimeSinceIntroductionConfig,
      ResourceUsage,
      User,
    ]),
    EmailModule,
  ],
  controllers: [IntroductionScheduleController, GroupIntroductionScheduleController],
  providers: [IntroductionScheduleService, IntroductionScheduleEvaluatorService],
  exports: [IntroductionScheduleService, IntroductionScheduleEvaluatorService],
})
export class IntroductionScheduleModule {}
