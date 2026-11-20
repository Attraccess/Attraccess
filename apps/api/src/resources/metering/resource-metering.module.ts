import { Module } from '@nestjs/common';
import { BillingModule } from '../../billing/billing.module';
import { MeteringPersistenceModule } from '../../database/adapters/metering/metering-persistence.module';
import { ResourceFlowsModule } from '../flows/resource-flows.module';
import { ResourceTransactionsModule } from '../../database/resource-transactions.module';
import { ResourceMeteringService } from './resource-metering.service';
import { ResourceMeteringFlowsBridge } from './resource-metering-flows.bridge';

@Module({
  imports: [ResourceTransactionsModule, MeteringPersistenceModule, ResourceFlowsModule, BillingModule],
  providers: [ResourceMeteringService, ResourceMeteringFlowsBridge],
  exports: [ResourceMeteringService],
})
export class ResourceMeteringModule {}
