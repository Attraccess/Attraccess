import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  ResourceFlowLog,
  BillingTransactionItem,
  ResourceFlowVariable,
} from '@attraccess/database-entities';
import { ResourceFlowsController } from './resource-flows.controller';
import { ResourceFlowsService } from './resource-flows.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceFlowVariablesController } from './resource-flow-variables.controller';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowVariableTriggerService } from './resource-flow-variable-trigger.service';
import { ConfigModule } from '@nestjs/config';
import flowConfig from './flow.config';
import { MqttModule } from '../../mqtt/mqtt.module';
import { ResourceUsageModule } from '../usage/resourceUsage.module';
import { ResourceHealthModule } from '../health/resource-health.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceFlowNode,
      ResourceFlowEdge,
      Resource,
      ResourceFlowLog,
      BillingTransactionItem,
      ResourceFlowVariable,
    ]),
    ConfigModule.forFeature(flowConfig),
    MqttModule,
    forwardRef(() => ResourceUsageModule),
    ResourceHealthModule,
  ],
  controllers: [ResourceFlowsController, ResourceFlowVariablesController],
  providers: [
    ResourceFlowsService,
    ResourceFlowsExecutorService,
    ResourceFlowVariablesService,
    ResourceFlowVariableTriggerService,
  ],
  exports: [ResourceFlowsService, ResourceFlowsExecutorService, ResourceFlowVariablesService],
})
export class ResourceFlowsModule {}
