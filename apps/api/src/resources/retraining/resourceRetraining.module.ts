import { Module } from '@nestjs/common';
import { ResourceGroupsCoreModule } from '../groups/resourceGroupsCore.module';
import { EmailModule } from '../../email/email.module';
import { IntroductionsPersistenceModule } from '../../database/adapters/resources/introductions-persistence.module';
import { ResourceRetrainingService } from './resourceRetraining.service';
import { ResourceRetrainingController } from './resourceRetraining.controller';
import { ResourceListVisibilityModule } from '../visibility/resource-list-visibility.module';

@Module({
  imports: [ResourceListVisibilityModule, IntroductionsPersistenceModule, ResourceGroupsCoreModule, EmailModule],
  controllers: [ResourceRetrainingController],
  providers: [ResourceRetrainingService],
  exports: [ResourceRetrainingService],
})
export class ResourceRetrainingModule {}
