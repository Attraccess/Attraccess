import { DataSource } from 'typeorm';
import { FlowExecutionPersistence, FLOW_EXECUTION_READS } from './persistence/port';
import { TypeormFlowExecutionPersistence } from './persistence/typeorm-adapter';
import { FlowEventPersistence } from './persistence/port';
import { TypeormFlowEventPersistence } from './persistence/typeorm-adapter';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { FLOW_WRITES, ResourceFlowPersistence } from './persistence/port';
import { TypeormFlowWriteOperations, TypeormResourceFlowPersistence } from './persistence/typeorm-adapter';
import { FlowTriggerPersistence, FlowVariablePersistence } from './persistence/port';
import { TypeormFlowTriggerPersistence, TypeormFlowVariablePersistence } from './persistence/typeorm-adapter';
import { ResourceMeteringModule } from '../metering/resource-metering.module';
import { Module, forwardRef } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  BillingTransactionItem,
  ResourceFlowVariable,
} from '@attraccess/database-entities';
import { ResourceFlowsController } from './resource-flows.controller';
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
    ]),
    MqttModule,
    forwardRef(() => ResourceUsageModule),
    forwardRef(() => ResourceMeteringModule),
    ResourceHealthModule,
    CompanionModule,
    ResourceOperatingIntervalModule,
  ],
  controllers: [ResourceFlowsController, ResourceFlowVariablesController],
  providers: [
    {
      provide: FlowExecutionPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(FLOW_EXECUTION_READS, (manager) => new TypeormFlowExecutionPersistence(manager));
        return new TypeormFlowExecutionPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    FlowLogRecorderService,
    ResourceFlowsService,
    {
      provide: ResourceFlowPersistence,
      useFactory: (
        driver: SqliteTransactionDriver,
        nodes: Repository<ResourceFlowNode>,
        edges: Repository<ResourceFlowEdge>,
        resources: Repository<Resource>,
      ) => {
        driver.register(FLOW_WRITES, (manager) => new TypeormFlowWriteOperations(manager));
        return new TypeormResourceFlowPersistence(nodes, edges, resources);
      },
      inject: [
        SqliteTransactionDriver,
        getRepositoryToken(ResourceFlowNode),
        getRepositoryToken(ResourceFlowEdge),
        getRepositoryToken(Resource),
      ],
    },
    ResourceFlowsExecutorService,
    { provide: FlowEventPersistence, useClass: TypeormFlowEventPersistence },
    ResourceFlowVariablesService,
    { provide: FlowVariablePersistence, useClass: TypeormFlowVariablePersistence },
    ResourceFlowVariableTriggerService,
    { provide: FlowTriggerPersistence, useClass: TypeormFlowTriggerPersistence },
  ],
  exports: [ResourceFlowsService, ResourceFlowsExecutorService, ResourceFlowVariablesService, FlowLogRecorderService],
})
export class ResourceFlowsModule {}
