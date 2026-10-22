import { TypeormIntroductionPersistence } from '../introductions/persistence/typeorm-adapter';
import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import {
  GroupIntroducerPersistence,
  GroupPersistence,
  GroupIntroductionPersistence,
  GROUP_INTRODUCTION_OPERATIONS,
  GROUP_OPERATIONS,
} from './persistence/port';
import { TypeormGroupIntroducerPersistence, TypeormGroupPersistence } from './persistence/typeorm-adapter';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { ResourceGroupsController } from './resourceGroups.controller';
import { ResourceGroupsService } from './resourceGroups.service';
import { ResourceGroupsIntroductionsController } from './introductions/resourceGroups.introductions.controller';
import { ResourceGroupsIntroducersController } from './introducers/resourceGroups.introducers.controller';
import { ResourceGroupsIntroductionsService } from './introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from './introducers/resourceGroups.introducers.service';
import { IsResourceGroupIntroducerGuard } from './introductions/isIntroducerGuard';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ResourceRetrainingModule } from '../retraining/resourceRetraining.module';

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
    forwardRef(() => ResourceRetrainingModule),
  ],
  controllers: [ResourceGroupsController, ResourceGroupsIntroductionsController, ResourceGroupsIntroducersController],
  providers: [
    {
      provide: GroupIntroductionPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(GROUP_INTRODUCTION_OPERATIONS, (manager) => new TypeormIntroductionPersistence(manager));
        return new TypeormIntroductionPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    {
      provide: GroupPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(GROUP_OPERATIONS, (manager) => new TypeormGroupPersistence(manager));
        return new TypeormGroupPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceGroupsService,
    ResourceGroupsIntroductionsService,
    ResourceGroupsIntroducersService,
    {
      provide: GroupIntroducerPersistence,
      useClass: TypeormGroupIntroducerPersistence,
    },
    IsResourceGroupIntroducerGuard,
  ],
  exports: [
    ResourceGroupsService,
    ResourceGroupsIntroductionsService,
    ResourceGroupsIntroducersService,
    IsResourceGroupIntroducerGuard,
  ],
})
export class ResourceGroupsModule {}
