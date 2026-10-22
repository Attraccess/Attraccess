import { ResourceFlowEdge, ResourceFlowNode } from '@attraccess/application-models';
import { FlowWriteOperations, FLOW_WRITES, ResourceFlowPersistence } from './port';
import { operationTransactionsFake } from '../../../database/testing/operation-transactions.test-fixture';

export function flowOperationsFake() {
  const persistence: jest.Mocked<ResourceFlowPersistence> = {
    findResource: jest.fn(),
    graphNodes: jest.fn().mockResolvedValue([]),
    graphEdges: jest.fn().mockResolvedValue([]),
    nodesByType: jest.fn().mockResolvedValue([]),
    meterIds: jest.fn().mockResolvedValue([]),
  };
  const writes: jest.Mocked<FlowWriteOperations> = {
    nodesByType: jest.fn().mockResolvedValue([]),
    replaceGraph: jest.fn(async (resource, nodes, edges) => ({
      nodes: nodes.map((node) => ({ ...node, resource }) as ResourceFlowNode),
      edges: edges.map((edge) => ({ ...edge, resource }) as ResourceFlowEdge),
    })),
  };
  const driver = operationTransactionsFake();
  driver.bind(FLOW_WRITES, writes);
  return { persistence, writes, driver };
}
