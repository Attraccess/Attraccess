import { Module } from '@nestjs/common';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { ResourceIntroducersController } from './resourceIntroducers.controller';
import { NotificationsModule } from '../../notifications/notifications.module';
import { IntroducersPersistenceModule } from '../../database/adapters/resources/introducers-persistence.module';

@Module({
  imports: [IntroducersPersistenceModule, NotificationsModule],
  controllers: [ResourceIntroducersController],
  providers: [ResourceIntroducersService],
  exports: [ResourceIntroducersService],
})
export class ResourceIntroducersModule {}
