import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  BillingTransactionItem,
  ResourceFlowVariable,
} from '@attraccess/database-entities';
import { ResourceFlowsController } from './resource-flows.controller';
import { ResourceFlowsService } from './resource-flows.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { ResourceFlowVariablesController } from './resource-flow-variables.controller';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowVariableTriggerService } from './resource-flow-variable-trigger.service';
import { MqttModule } from '../../mqtt/mqtt.module';
import { ResourceUsageModule } from '../usage/resourceUsage.module';
import { ResourceHealthModule } from '../health/resource-health.module';
import { CompanionModule } from '../../companion/companion.module';
import { ResourceOperatingIntervalModule } from '../operating-intervals/resource-operating-interval.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceFlowNode,
      ResourceFlowEdge,
      Resource,
      BillingTransactionItem,
      ResourceFlowVariable,
    ]),
    MqttModule,
    forwardRef(() => ResourceUsageModule),
    ResourceHealthModule,
    CompanionModule,
    ResourceOperatingIntervalModule,
  ],
  controllers: [ResourceFlowsController, ResourceFlowVariablesController],
  providers: [
    FlowLogRecorderService,
    ResourceFlowsService,
    ResourceFlowsExecutorService,
    ResourceFlowVariablesService,
    ResourceFlowVariableTriggerService,
  ],
  exports: [ResourceFlowsService, ResourceFlowsExecutorService, ResourceFlowVariablesService, FlowLogRecorderService],
})
export class ResourceFlowsModule {}
