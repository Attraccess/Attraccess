import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  ResourceFlowLog,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { ResourceFlowsController } from './resource-flows.controller';
import { ResourceFlowsService } from './resource-flows.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ConfigModule } from '@nestjs/config';
import flowConfig from './flow.config';
import { MqttModule } from '../../mqtt/mqtt.module';
import { ResourceUsageModule } from '../usage/resourceUsage.module';
import { ResourceHealthModule } from '../health/resource-health.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceFlowNode, ResourceFlowEdge, Resource, ResourceFlowLog, BillingTransactionItem]),
    ConfigModule.forFeature(flowConfig),
    MqttModule,
    forwardRef(() => ResourceUsageModule),
    ResourceHealthModule,
  ],
  controllers: [ResourceFlowsController],
  providers: [ResourceFlowsService, ResourceFlowsExecutorService],
  exports: [ResourceFlowsService, ResourceFlowsExecutorService],
})
export class ResourceFlowsModule {}
