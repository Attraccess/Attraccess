import { ResourceMeteringModule } from '../metering/resource-metering.module';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  BillingTransactionItem,
  ResourceFlowVariable,
  Flow,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
} from '@attraccess/database-entities';
import { ResourceFlowsController } from './resource-flows.controller';
import { GlobalFlowsController } from './global-flows.controller';
import { GlobalFlowsService } from './global-flows.service';
import { FlowEventTriggersService } from './execution/flow-event-triggers.service';
import { ResourceFlowsService } from './resource-flows.service';
import { ResourceFlowsExecutorService } from './execution/resource-flows-executor.service';
import { FlowLogRecorderService } from './logs/flow-log-recorder.service';
import { ResourceFlowVariablesController } from './variables/resource-flow-variables.controller';
import { ResourceFlowVariablesService } from './variables/resource-flow-variables.service';
import { ResourceFlowVariableTriggerService } from './variables/resource-flow-variable-trigger.service';
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
      Flow,
      ResourceMaintenance,
      ResourceMaintenanceRequest,
    ]),
    MqttModule,
    forwardRef(() => ResourceUsageModule),
    forwardRef(() => ResourceMeteringModule),
    ResourceHealthModule,
    CompanionModule,
    ResourceOperatingIntervalModule,
  ],
  controllers: [ResourceFlowsController, GlobalFlowsController, ResourceFlowVariablesController],
  providers: [
    FlowLogRecorderService,
    ResourceFlowsService,
    GlobalFlowsService,
    FlowEventTriggersService,
    ResourceFlowsExecutorService,
    ResourceFlowVariablesService,
    ResourceFlowVariableTriggerService,
  ],
  exports: [ResourceFlowsService, ResourceFlowsExecutorService, ResourceFlowVariablesService, FlowLogRecorderService],
})
export class ResourceFlowsModule {}
