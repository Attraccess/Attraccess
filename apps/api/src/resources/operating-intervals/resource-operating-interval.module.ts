import { DatabaseTransactions } from '../../database/transaction-scope';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { OPERATING_INTERVAL_WRITES } from './persistence/port';
import { operatingIntervalTransactionOperations } from './persistence/typeorm-adapter';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OperatingDiagnosticsPersistence } from './persistence/port';
import { TypeormOperatingDiagnosticsPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceFlowNode, ResourceOperatingInterval, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { ResourceOperatingAttributionModule } from './resource-operating-attribution.module';
import { ResourceOperatingDiagnosticsController } from './resource-operating-diagnostics.controller';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { ResourceTransactionsModule } from '../../database/resource-transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceOperatingInterval, ResourceUsage, ResourceFlowNode]),
    ResourceOperatingAttributionModule,
    ResourceMaintenanceModule,
    ResourceTransactionsModule,
  ],
  controllers: [ResourceOperatingAttributionController, ResourceOperatingDiagnosticsController],
  providers: [
    { provide: OperatingDiagnosticsPersistence, useClass: TypeormOperatingDiagnosticsPersistence },
    {
      provide: ResourceOperatingIntervalService,
      useFactory: (
        driver: SqliteTransactionDriver,
        transactions: DatabaseTransactions,
        metrics: OperatingMetricsRecorder,
        events: EventEmitter2,
      ) => {
        driver.register(OPERATING_INTERVAL_WRITES, operatingIntervalTransactionOperations);
        return new ResourceOperatingIntervalService(transactions, metrics, events);
      },
      inject: [SqliteTransactionDriver, DatabaseTransactions, OperatingMetricsRecorder, EventEmitter2],
    },
    ResourceOperatingDiagnosticsService,
  ],
  exports: [ResourceOperatingIntervalService, ResourceOperatingAttributionModule, ResourceOperatingDiagnosticsService],
})
export class ResourceOperatingIntervalModule {}
