import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResourceFlowNode, ResourceFlowNodeType, ResourceFlowLog } from '@attraccess/database-entities';

// Minimal edge shape for our mocks
type Edge = { source: string; target: string; sourceHandle?: string | null };

// Helper to create a node
function createNode(partial: Partial<ResourceFlowNode>): ResourceFlowNode {
  return {
    id: 'node-' + Math.random().toString(36).slice(2, 8),
    type: ResourceFlowNodeType.INPUT_BUTTON,
    position: { x: 0, y: 0 },
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceId: 1,
    resource: undefined as any,
    ...partial,
  } as unknown as ResourceFlowNode;
}

describe('ResourceFlowsExecutorService.runFlow', () => {
  let service: ResourceFlowsExecutorService;

  // Repositories and dependencies
  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  let flowEdgeRepository: Partial<Repository<Edge>>;
  let flowLogRepository: Partial<Repository<ResourceFlowLog>>;
  let configService: Partial<ConfigService>;
  let mqttClientService: any;
  let resourceUsageService: any;

  // Dynamic stores per test
  let nodesById: Record<string, ResourceFlowNode>;
  let initialNodes: ResourceFlowNode[];
  let edgesBySourceAndHandle: Record<string, Edge[]>; // key: `${source}|${handle ?? ''}`

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined as any);

    nodesById = {};
    initialNodes = [];
    edgesBySourceAndHandle = {};

    flowNodeRepository = {
      find: jest.fn(async ({ where }: any) => {
        const { resourceId, type } = where || {};
        return initialNodes.filter((n) => n.resourceId === resourceId && n.type === type);
      }),
      findOne: jest.fn(async ({ where }: any) => {
        return nodesById[where.id] ?? null;
      }),
    };

    flowEdgeRepository = {
      find: jest.fn(async ({ where }: any) => {
        const key = `${where.source}|${where.sourceHandle ?? ''}`;
        return edgesBySourceAndHandle[key] ?? [];
      }),
    } as any;

    flowLogRepository = {
      create: jest.fn((data: any) => ({ id: Math.random().toString(36), ...data })),
      save: jest.fn(async (data: any) => data),
    } as any;

    configService = {
      get: jest.fn(() => ({ FLOW_LOG_TTL_DAYS: 7 }) as any),
    } as any;

    mqttClientService = { publish: jest.fn(async () => undefined) };
    resourceUsageService = {};

    service = new ResourceFlowsExecutorService(
      flowNodeRepository as Repository<ResourceFlowNode>,
      flowEdgeRepository as unknown as Repository<any>,
      flowLogRepository as Repository<ResourceFlowLog>,
      configService as ConfigService,
      mqttClientService,
      resourceUsageService,
    );
  });

  it('returns empty array when no trigger nodes are found', async () => {
    const result = await service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED, {
      any: 'data',
    });
    expect(result).toEqual([]);
    expect(flowNodeRepository.find as jest.Mock).toHaveBeenCalled();
  });

  it('returns initial data when a single input node has no outgoing edges (terminal)', async () => {
    const inputNode = createNode({
      id: 'in-1',
      type: ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED,
      resourceId: 1,
    });
    nodesById[inputNode.id] = inputNode;
    initialNodes = [inputNode];

    edgesBySourceAndHandle[`${inputNode.id}|`] = [];

    const initialData = { a: 1 };
    const result = await service.runFlow(
      1,
      ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED,
      initialData,
    );
    expect(result).toEqual([initialData]);
  });

  it('handles a simple linear path and returns the last node payload', async () => {
    const inputNode = createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED });
    const billingNode = createNode({
      id: 'out-billing-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
    });
    nodesById[inputNode.id] = inputNode;
    nodesById[billingNode.id] = billingNode;
    initialNodes = [inputNode];

    // Edge: input -> billing (no sourceHandle filter)
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: billingNode.id }];
    // Billing is terminal
    edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    const initialData = {
      billingItems: [{ name: 'kWh', value: 2.5, description: 'Energy', externalReference: 'power' }],
    };

    const result = await service.runFlow(
      1,
      ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED,
      initialData,
    );
    expect(result).toEqual([initialData.billingItems]);
  });

  it('fan-outs when a node has multiple outgoing edges with the same handle and returns all leaf results', async () => {
    const inputNode = createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED });
    const ifNode = createNode({
      id: 'if-1',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: {
        path: 'flag',
        comparisonOperator: '=',
        comparisonValue: 'yes',
        comparisonValueIsPath: false,
      },
    } as any);
    const billingNodeA = createNode({
      id: 'out-a',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
    });
    const billingNodeB = createNode({
      id: 'out-b',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
    });

    [inputNode, ifNode, billingNodeA, billingNodeB].forEach((n) => (nodesById[n.id] = n));
    initialNodes = [inputNode];

    // input -> if (no handle filter on input)
    edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: ifNode.id }];
    // if -> two billing nodes on the same handle 'output-true'
    edgesBySourceAndHandle[`${ifNode.id}|output-true`] = [
      { source: ifNode.id, target: billingNodeA.id, sourceHandle: 'output-true' },
      { source: ifNode.id, target: billingNodeB.id, sourceHandle: 'output-true' },
    ];
    // Both billing nodes are terminals
    edgesBySourceAndHandle[`${billingNodeA.id}|`] = [];
    edgesBySourceAndHandle[`${billingNodeB.id}|`] = [];

    const initialData = {
      flag: 'yes',
      billingItems: [{ name: 'session-fee', value: 1, description: 'Flat', externalReference: 'flat' }],
    };

    const result = await service.runFlow(
      1,
      ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED,
      initialData,
    );
    // Both leaves return the same billingItems payload in this setup
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(initialData.billingItems);
    expect(result[1]).toEqual(initialData.billingItems);
  });
});
