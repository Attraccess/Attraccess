import { Module } from '@nestjs/common';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceIntroducersController } from './resourceIntroducers.controller';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceIntroducer, User]), NotificationsModule],
  controllers: [ResourceIntroducersController],
  providers: [ResourceIntroducersService],
  exports: [ResourceIntroducersService],
})
export class ResourceIntroducersModule {}
