import { Module } from '@nestjs/common';
import { ResourceGroupsController } from './resourceGroups.controller';
import { ResourceGroupsIntroductionsController } from './introductions/resourceGroups.introductions.controller';
import { ResourceGroupsIntroducersController } from './introducers/resourceGroups.introducers.controller';
import { ResourceGroupsIntroductionsService } from './introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from './introducers/resourceGroups.introducers.service';
import { IsResourceGroupIntroducerGuard } from './introductions/isIntroducerGuard';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ResourceRetrainingModule } from '../retraining/resourceRetraining.module';
import { ResourceGroupsCoreModule } from './resourceGroupsCore.module';
import { GroupsPersistenceModule } from '../../database/adapters/resources/groups-persistence.module';
import { ResourceListVisibilityModule } from '../visibility/resource-list-visibility.module';

@Module({
  imports: [
    ResourceListVisibilityModule,
    GroupsPersistenceModule,
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
