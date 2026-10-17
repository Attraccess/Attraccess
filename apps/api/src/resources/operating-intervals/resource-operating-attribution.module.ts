import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { OperatingAttributionPersistence, OPERATING_ATTRIBUTION_READS } from './persistence/port';
import { TypeormOperatingAttributionPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';

/** Authoritative duration reads shared by reporting, billing, and maintenance. */
@Module({
  imports: [TypeOrmModule.forFeature([ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt])],
  providers: [
    {
      provide: OperatingAttributionPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(OPERATING_ATTRIBUTION_READS, (manager) => new TypeormOperatingAttributionPersistence(manager));
        return new TypeormOperatingAttributionPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceOperatingAttributionService,
  ],
  exports: [ResourceOperatingAttributionService],
})
export class ResourceOperatingAttributionModule {}
