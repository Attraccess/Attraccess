import { Module } from '@nestjs/common';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroductionsController } from './resourceIntroductions.controller';
import {
  Resource,
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceUsage,
} from '@attraccess/database-entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { IntroductionScheduleEvaluatorService } from './schedules/introduction-schedule-evaluator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceIntroduction,
      ResourceIntroducer,
      ResourceIntroductionHistoryItem,
      ResourceIntroductionSchedule,
      ResourceIntroductionScheduleInactivityConfig,
      ResourceIntroductionScheduleTimeSinceIntroductionConfig,
      ResourceUsage,
    ]),
    ResourceIntroducersModule,
  ],
  controllers: [ResourceIntroductionsController],
  providers: [ResourceIntroductionsService, IntroductionScheduleEvaluatorService],
  exports: [ResourceIntroductionsService, IntroductionScheduleEvaluatorService],
})
export class ResourceIntroductionsModule {}
