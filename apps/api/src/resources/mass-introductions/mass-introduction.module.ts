import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attractap, Resource, ResourceGroup } from '@attraccess/database-entities';
import { ResourceIntroductionsModule } from '../introductions/resourceIntroductions.module';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { ResourceGroupsModule } from '../groups/resourceGroups.module';
import { LiveTopicsModule } from '../../live-updates/live-topics.module';
import { MassIntroductionController } from './mass-introduction.controller';
import { MassIntroductionService } from './mass-introduction.service';
import { MassIntroductionLiveService } from './mass-introduction-live.service';
import { MassIntroductionLiveTopicsProvider } from './mass-introduction-live-topics.provider';

/**
 * Mass introductions (ATT-1151): an introducer opens a 15-minute QR code (and optionally a reader
 * scan screen); everyone who joins is introduced to the resource or group on their behalf.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Resource, ResourceGroup, Attractap]),
    ResourceIntroductionsModule,
    ResourceIntroducersModule,
    ResourceGroupsModule,
    LiveTopicsModule,
  ],
  controllers: [MassIntroductionController],
  providers: [MassIntroductionService, MassIntroductionLiveService, MassIntroductionLiveTopicsProvider],
  exports: [MassIntroductionService],
})
export class MassIntroductionModule {}
