import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { MeteringPersistence, METERING_OPERATIONS } from './persistence/port';
import { TypeormMeteringPersistence } from './persistence/typeorm-adapter';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceMeter,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringOperation,
  ResourceMeteringSession,
} from '@attraccess/database-entities';
import { BillingModule } from '../../billing/billing.module';
import { ResourceFlowsModule } from '../flows/resource-flows.module';
import { ResourceTransactionsModule } from '../../database/resource-transactions.module';
import { ResourceMeteringController } from './resource-metering.controller';
import { ResourceMeteringService } from './resource-metering.service';

@Module({
  imports: [
    ResourceTransactionsModule,
    TypeOrmModule.forFeature([
      ResourceMeter,
      ResourceMeteringSession,
      ResourceMeteringOperation,
      ResourceFlowNode,
      ResourceFlowEdge,
    ]),
    forwardRef(() => ResourceFlowsModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [ResourceMeteringController],
  providers: [
    {
      provide: MeteringPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(METERING_OPERATIONS, (manager) => new TypeormMeteringPersistence(manager));
        return new TypeormMeteringPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceMeteringService,
  ],
  exports: [ResourceMeteringService],
})
export class ResourceMeteringModule {}
