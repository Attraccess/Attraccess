import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { ResourceGroupsController } from './resourceGroups.controller';
import { ResourceGroupsIntroductionsController } from './introductions/resourceGroups.introductions.controller';
import { ResourceGroupsIntroducersController } from './introducers/resourceGroups.introducers.controller';
import { ResourceGroupsIntroductionsService } from './introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from './introducers/resourceGroups.introducers.service';
import { IsResourceGroupIntroducerGuard } from './introductions/isIntroducerGuard';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ResourceRetrainingModule } from '../retraining/resourceRetraining.module';
import { ResourceGroupsCoreModule } from './resourceGroupsCore.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceGroup,
      ResourceIntroduction,
      ResourceIntroductionHistoryItem,
      ResourceIntroducer,
    ]),
    NotificationsModule,
    ResourceGroupsCoreModule,
    ResourceRetrainingModule,
  ],
  controllers: [ResourceGroupsController, ResourceGroupsIntroductionsController, ResourceGroupsIntroducersController],
  providers: [ResourceGroupsIntroductionsService, ResourceGroupsIntroducersService, IsResourceGroupIntroducerGuard],
  exports: [
    ResourceGroupsCoreModule,
    ResourceGroupsIntroductionsService,
    ResourceGroupsIntroducersService,
    IsResourceGroupIntroducerGuard,
  ],
})
export class ResourceGroupsModule {}
