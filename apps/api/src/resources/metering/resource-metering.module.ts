import { Module } from '@nestjs/common';
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
import { ResourceMeteringService } from './resource-metering.service';
import { ResourceMeteringFlowsBridge } from './resource-metering-flows.bridge';

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
    ResourceFlowsModule,
    BillingModule,
  ],
  providers: [ResourceMeteringService, ResourceMeteringFlowsBridge],
  exports: [ResourceMeteringService],
})
export class ResourceMeteringModule {}
