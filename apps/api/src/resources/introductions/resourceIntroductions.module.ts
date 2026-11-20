import { Module } from '@nestjs/common';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroductionsController } from './resourceIntroductions.controller';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ResourceRetrainingModule } from '../retraining/resourceRetraining.module';
import { IntroductionsPersistenceModule } from '../../database/adapters/resources/introductions-persistence.module';

@Module({
  imports: [IntroductionsPersistenceModule, ResourceIntroducersModule, NotificationsModule, ResourceRetrainingModule],
  controllers: [ResourceIntroductionsController],
  providers: [ResourceIntroductionsService],
  exports: [ResourceIntroductionsService],
})
export class ResourceIntroductionsModule {}
