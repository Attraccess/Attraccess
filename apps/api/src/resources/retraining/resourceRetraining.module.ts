import { Module } from '@nestjs/common';
import { ResourceGroupsCoreModule } from '../groups/resourceGroupsCore.module';
import { EmailModule } from '../../email/email.module';
import { IntroductionsPersistenceModule } from '../../database/adapters/resources/introductions-persistence.module';
import { ResourceRetrainingService } from './resourceRetraining.service';
import { ResourceRetrainingController } from './resourceRetraining.controller';

@Module({
  imports: [IntroductionsPersistenceModule, ResourceGroupsCoreModule, EmailModule],
  controllers: [ResourceRetrainingController],
  providers: [ResourceRetrainingService],
  exports: [ResourceRetrainingService],
})
export class ResourceRetrainingModule {}
