import { Module } from '@nestjs/common';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroductionsController } from './resourceIntroductions.controller';
import {
  Resource,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { IntroductionScheduleEvaluatorService } from './schedules/introduction-schedule-evaluator.service';
import { EmailModule } from '../../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceGroup,
      ResourceIntroduction,
      ResourceIntroducer,
      ResourceIntroductionHistoryItem,
      ResourceIntroductionSchedule,
      ResourceIntroductionScheduleInactivityConfig,
      ResourceIntroductionScheduleTimeSinceIntroductionConfig,
      ResourceUsage,
      User,
    ]),
    ResourceIntroducersModule,
    EmailModule,
  ],
  controllers: [ResourceIntroductionsController],
  providers: [ResourceIntroductionsService, IntroductionScheduleEvaluatorService],
  exports: [ResourceIntroductionsService, IntroductionScheduleEvaluatorService],
})
export class ResourceIntroductionsModule {}
