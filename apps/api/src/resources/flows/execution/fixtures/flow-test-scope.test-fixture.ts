import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { MqttClientService } from '../../../../mqtt/mqtt-client.service';
import type { TransactionScope } from '../../../../database/unit-of-work';
import type { ResourceHealthService } from '../../../health/resource-health.service';
import type { ResourceUsageService } from '../../../usage/sessions/resource-usage.service';
import type { FlowBillingItemStore } from '../../flow-billing-item-store.port';
import type { FlowLogRecorderService } from '../../logs/flow-log-recorder.service';
import type { ResourceFlowVariablesService } from '../../variables/resource-flow-variables.service';
import type { ResourceFlowsExecutorService } from '../resource-flows-executor.service';
import type { createNode } from './node.test-fixture';
import type { FakeFlowEdge, FakeFlowNode, FakeFlowTriggerStore } from './fake-flow-trigger-store.test-fixture';

/** What `resetTestFixture` fills in: the service under test, its fakes, and the world the fake store serves. */
export type FlowExecutionTestScope = {
  initialNodes: FakeFlowNode[];
  nodesById: Record<string, FakeFlowNode>;
  edgesBySourceAndHandle: Record<string, FakeFlowEdge[]>;
  createNode: typeof createNode;
  errorShapeIndex: number;
  service: ResourceFlowsExecutorService;
  flowStore: FakeFlowTriggerStore;
  flowLogs: FlowLogRecorderService;
  mqttClientService: MqttClientService;
  resourceUsageService: ResourceUsageService;
  billingItems: { addToPendingBill: jest.Mock<Promise<boolean>> } & FlowBillingItemStore;
  unitOfWork: {
    run: jest.Mock<Promise<unknown>, [(scope: TransactionScope) => Promise<unknown>]>;
    current: jest.Mock;
  };
  operatingIntervals: { transition: jest.Mock };
  eventEmitter: EventEmitter2;
  resourceHealthService: ResourceHealthService;
  variablesService: ResourceFlowVariablesService;
};
