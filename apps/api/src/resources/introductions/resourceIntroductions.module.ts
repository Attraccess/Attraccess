import { Module } from '@nestjs/common';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroductionsController } from './resourceIntroductions.controller';
import { ResourceIntroduction, ResourceIntroductionHistoryItem } from '@attraccess/database-entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { IntroductionScheduleModule } from './schedules/introduction-schedule.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceIntroduction, ResourceIntroductionHistoryItem]),
    ResourceIntroducersModule,
    IntroductionScheduleModule,
  ],
  controllers: [ResourceIntroductionsController],
  providers: [ResourceIntroductionsService],
  exports: [ResourceIntroductionsService, IntroductionScheduleModule],
})
export class ResourceIntroductionsModule {}
