import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { ResourceIntroducerPersistence, RESOURCE_INTRODUCER_OPERATIONS } from './persistence/port';
import { TypeormResourceIntroducerPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceIntroducersController } from './resourceIntroducers.controller';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceIntroducer, User]), NotificationsModule],
  controllers: [ResourceIntroducersController],
  providers: [
    {
      provide: ResourceIntroducerPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(RESOURCE_INTRODUCER_OPERATIONS, (manager) => new TypeormResourceIntroducerPersistence(manager));
        return new TypeormResourceIntroducerPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceIntroducersService,
  ],
  exports: [ResourceIntroducersService],
})
export class ResourceIntroducersModule {}
