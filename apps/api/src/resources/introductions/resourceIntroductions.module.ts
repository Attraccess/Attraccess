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

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceIntroduction, ResourceIntroducer, ResourceIntroductionHistoryItem]),
    ResourceIntroducersModule,
  ],
  controllers: [ResourceIntroductionsController],
  providers: [ResourceIntroductionsService],
  exports: [ResourceIntroductionsService],
})
export class ResourceIntroductionsModule {}
