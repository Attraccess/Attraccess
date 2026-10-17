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
  providers: [ResourceMeteringService],
  exports: [ResourceMeteringService],
})
export class ResourceMeteringModule {}
