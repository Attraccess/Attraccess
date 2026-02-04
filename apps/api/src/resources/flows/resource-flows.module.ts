import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  ResourceFlowLog,
  BillingTransactionItem,
  ResourceSubFlow,
  ResourceSubFlowEdge,
  ResourceSubFlowNode,
} from '@attraccess/database-entities';
import { ResourceFlowsController } from './resource-flows.controller';
import { ResourceFlowsService } from './resource-flows.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceSubFlowsController } from './resource-sub-flows.controller';
import { ResourceSubFlowsService } from './resource-sub-flows.service';
import { ConfigModule } from '@nestjs/config';
import flowConfig from './flow.config';
import { MqttModule } from '../../mqtt/mqtt.module';
import { ResourceUsageModule } from '../usage/resourceUsage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceFlowNode,
      ResourceFlowEdge,
      Resource,
      ResourceFlowLog,
      BillingTransactionItem,
      ResourceSubFlow,
      ResourceSubFlowNode,
      ResourceSubFlowEdge,
    ]),
    ConfigModule.forFeature(flowConfig),
    MqttModule,
    forwardRef(() => ResourceUsageModule),
  ],
  controllers: [ResourceFlowsController, ResourceSubFlowsController],
  providers: [ResourceFlowsService, ResourceFlowsExecutorService, ResourceSubFlowsService],
  exports: [ResourceFlowsService, ResourceFlowsExecutorService, ResourceSubFlowsService],
})
export class ResourceFlowsModule {}
