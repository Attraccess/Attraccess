import { Module } from '@nestjs/common';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroductionsController } from './resourceIntroductions.controller';
import {
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceIntroduction, ResourceIntroducer, ResourceIntroductionHistoryItem]),
    ResourceIntroducersModule,
    NotificationsModule,
  ],
  controllers: [ResourceIntroductionsController],
  providers: [ResourceIntroductionsService],
  exports: [ResourceIntroductionsService],
})
export class ResourceIntroductionsModule {}
