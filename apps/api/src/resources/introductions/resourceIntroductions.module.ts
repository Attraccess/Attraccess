import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { IntroductionPersistence, INTRODUCTION_OPERATIONS } from './persistence/port';
import { TypeormIntroductionPersistence } from './persistence/typeorm-adapter';
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
import { ResourceRetrainingModule } from '../retraining/resourceRetraining.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceIntroduction, ResourceIntroducer, ResourceIntroductionHistoryItem]),
    ResourceIntroducersModule,
    NotificationsModule,
    ResourceRetrainingModule,
  ],
  controllers: [ResourceIntroductionsController],
  providers: [
    {
      provide: IntroductionPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(INTRODUCTION_OPERATIONS, (manager) => new TypeormIntroductionPersistence(manager));
        return new TypeormIntroductionPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceIntroductionsService,
  ],
  exports: [ResourceIntroductionsService],
})
export class ResourceIntroductionsModule {}
