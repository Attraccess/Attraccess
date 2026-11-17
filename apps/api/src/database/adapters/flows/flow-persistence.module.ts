import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BillingTransaction,
  BillingTransactionItem,
  Flow,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowVariable,
  ResourceMeter,
  ResourceUsage,
} from '@attraccess/database-entities';
import { FLOW_BILLING_ITEM_STORE } from '../../../resources/flows/flow-billing-item-store.port';
import { FLOW_GRAPH_STORE } from '../../../resources/flows/flow-graph.port';
import { FLOW_RESOURCE_DIRECTORY } from '../../../resources/flows/flow-resource-directory.port';
import { FLOW_TRIGGER_STORE } from '../../../resources/flows/flow-trigger-store.port';
import { FLOW_VARIABLE_STORE } from '../../../resources/flows/flow-variable-store.port';
import { ResourceTransactionsModule } from '../../resource-transactions.module';
import { TypeOrmFlowBillingItemStore } from './typeorm-flow-billing-item.store';
import { TypeOrmFlowGraphStore } from './typeorm-flow-graph.store';
import { TypeOrmFlowResourceDirectory } from './typeorm-flow-resource-directory';
import { TypeOrmFlowTriggerStore } from './typeorm-flow-trigger.store';
import { TypeOrmFlowVariableStore } from './typeorm-flow-variable.store';

/** Provides the flow ports with their TypeORM adapters. The audit recorder port is global. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Flow,
      ResourceFlowNode,
      ResourceFlowEdge,
      ResourceFlowVariable,
      Resource,
      ResourceMeter,
      ResourceUsage,
      BillingTransaction,
      BillingTransactionItem,
    ]),
    ResourceTransactionsModule,
  ],
  providers: [
    { provide: FLOW_GRAPH_STORE, useClass: TypeOrmFlowGraphStore },
    { provide: FLOW_TRIGGER_STORE, useClass: TypeOrmFlowTriggerStore },
    { provide: FLOW_VARIABLE_STORE, useClass: TypeOrmFlowVariableStore },
    { provide: FLOW_RESOURCE_DIRECTORY, useClass: TypeOrmFlowResourceDirectory },
    { provide: FLOW_BILLING_ITEM_STORE, useClass: TypeOrmFlowBillingItemStore },
  ],
  exports: [
    FLOW_GRAPH_STORE,
    FLOW_TRIGGER_STORE,
    FLOW_VARIABLE_STORE,
    FLOW_RESOURCE_DIRECTORY,
    FLOW_BILLING_ITEM_STORE,
    ResourceTransactionsModule,
  ],
})
export class FlowPersistenceModule {}
