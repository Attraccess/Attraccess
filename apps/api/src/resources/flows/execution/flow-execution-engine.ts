import { Logger } from '@nestjs/common';

import {
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  getExternalEffectFailureBehavior,
} from '@attraccess/database-entities';

import { Repository, EntityManager, FindOperator, IsNull } from 'typeorm';

import { FlowLogRecorderService } from '../logs/flow-log-recorder.service';

import { FlowTimer } from '../../../metrics/instrumentation/flow/flow.helper';

import { NodeExecutor, NodeProcessingResult } from '../node-executors/index';

import { FlowExecutionContext, getFlowRepository } from './flow-execution-context';

import type { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { ResourceFlowLogType } from '../dto/flow-log.dto';

import { ExternalEffectFailureError } from '../errors/external-effect-failure.error';
import { FlowExecutionError } from '../errors/flow-execution.error';

import { getPluginFlowNode } from '../../../plugin-system/flows/node-registry';

import { randomBytes } from 'crypto';

/** Lifecycle-fatal errors outrank ordinary ones, so a branch failing first cannot mask them. */
function flowErrorRank(error: unknown): number {
  if (error instanceof ExternalEffectFailureError) return 2;
  if (error instanceof FlowExecutionError) return 1;
  return 0;
}

export async function settleFlowBranches(branches: Promise<NodeProcessingResult[]>[]): Promise<NodeProcessingResult[]> {
  // A failed branch cannot release a lifecycle reservation while sibling effects are still running.
  // Wait for work already started, then keep the highest-ranked failure (first seen within a rank).
  let failure: { error: unknown } | undefined;
  const results = await Promise.allSettled(
    branches.map((branch) =>
      branch.catch((error) => {
        if (!failure || flowErrorRank(error) > flowErrorRank(failure.error)) {
          failure = { error };
        }
        throw error;
      }),
    ),
  );
  if (failure) throw failure.error;
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

/** Edges and nodes of the canvas a node belongs to: its global flow, or its resource's own flow. */
function sameOwnerWhere(
  node: ResourceFlowNode,
): { flowId: number } | { resourceId: number; flowId: FindOperator<null> } {
  return node.flowId != null ? { flowId: node.flowId } : { resourceId: node.resourceId as number, flowId: IsNull() };
}

const CORE_NODE_TYPES: ReadonlySet<string> = new Set(Object.values(ResourceFlowNodeType));

export class FlowExecutionEngine {
  public constructor(
    protected readonly flowNodeRepository: Repository<ResourceFlowNode>,
    protected readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    protected readonly flowLogs: FlowLogRecorderService,
    protected readonly flowTimer: FlowTimer,
    protected readonly nodeExecutors: Partial<Record<ResourceFlowNodeType, NodeExecutor>>,
    protected readonly context: FlowExecutionContext,
    protected readonly logger: Logger,
  ) {}

  protected async executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(`Looking for outgoing edges from node ID: ${node.id} (Type: ${node.type})`);

    const edgesRepository = getFlowRepository(ResourceFlowEdge, this.flowEdgeRepository, transactionManager);

    // Edges and targets must belong to the same canvas; another owner's nodes (e.g. a disabled flow) never run.
    const owner = sameOwnerWhere(node);
    const edgesFromThisNode = await edgesRepository.find({
      where: {
        source: node.id,
        sourceHandle: resultOfPreviousNode.outputHandle,
        ...owner,
      },
    });

    if (edgesFromThisNode.length === 0) {
      this.logger.debug(
        `No outgoing edges found from node ID: ${node.id} (Type: ${node.type}) - flow execution stops here`,
      );
      return [resultOfPreviousNode];
    }

    this.logger.debug(
      `Found ${edgesFromThisNode.length} outgoing edge(s) from node ID: ${node.id} (Type: ${node.type})`,
    );

    const flowNodeRepository = getFlowRepository(ResourceFlowNode, this.flowNodeRepository, transactionManager);

    // Execute each edge individually instead of deduplicating target nodes
    const edgePromises = edgesFromThisNode.map(async (edge) => {
      const targetNode = await flowNodeRepository.findOne({
        where: { id: edge.target, ...owner },
      });

      if (!targetNode) {
        this.logger.warn(`Target node ${edge.target} not found for edge from node ${node.id}`);
        return [] as NodeProcessingResult[];
      }

      return this.processNode(
        flowRunId,
        targetNode,
        resultOfPreviousNode,
        transactionManager,
        resourceContextCache,
        options,
      );
    });

    return settleFlowBranches(edgePromises);
  }

  protected errorReason(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }

    if (typeof error === 'string') {
      return error || 'Unknown error';
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message || 'Unknown error';
    }

    try {
      const serialized = JSON.stringify(error);
      return serialized && serialized !== '{}' ? serialized : 'Unknown error';
    } catch {
      return String(error);
    }
  }

  protected async processNode(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(
      `Processing flow node - ID: ${node.id}, Type: ${node.type}, Resource ID: ${node.resourceId}, Flow ID: ${node.flowId}`,
    );

    const startTime = Date.now();
    const runResourceId = this.context.resolveRunResourceId(node, options);

    let responseOfNode: NodeProcessingResult = { payload: {} };
    let dispatchStarted = false;

    try {
      // Log the start of node processing
      const input = (await this.context.withResourceContext(
        runResourceId,
        resultOfPreviousNode.payload,
        transactionManager,
        resourceContextCache,
      )) as object;

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        flowId: node.flowId,
        type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
        payload: () => ({ input }),
      });

      dispatchStarted = true;
      responseOfNode = await this.flowTimer.timeNode(node.type, () =>
        this.dispatchNode(flowRunId, node, input, transactionManager, options, runResourceId),
      );

      const processingTime = Date.now() - startTime;
      this.logger.debug(`Successfully processed flow node ID: ${node.id} (Type: ${node.type}) in ${processingTime}ms`);

      responseOfNode.payload = (await this.context.withResourceContext(
        runResourceId,
        responseOfNode.payload,
        transactionManager,
        resourceContextCache,
      )) as object;

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        flowId: node.flowId,
        type: ResourceFlowLogType.NODE_PROCESSING_COMPLETED,
        payload: () => ({ output: responseOfNode.payload }),
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const failureBehavior = dispatchStarted ? getExternalEffectFailureBehavior(node.type, node.data) : undefined;
      const failureKind = dispatchStarted
        ? (this.nodeExecutors[node.type]?.getFailureKind?.(error) ?? 'node-failure')
        : 'node-failure';
      const errorMessage = this.errorReason(error);
      this.logger.error(
        `Failed to process flow node ID: ${node.id} (Type: ${node.type}) after ${processingTime}ms`,
        error instanceof Error ? error.stack : undefined,
      );

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        flowId: node.flowId,
        type: ResourceFlowLogType.NODE_PROCESSING_FAILED,
        payload: () => ({ error: errorMessage, failureKind, failureBehavior: failureBehavior ?? 'fail-flow' }),
      });

      if (!failureBehavior || failureBehavior === 'fail-flow') {
        throw failureBehavior === 'fail-flow'
          ? new ExternalEffectFailureError(errorMessage, error, failureKind)
          : error;
      }

      const payload =
        failureBehavior === 'failure-output'
          ? { ...resultOfPreviousNode.payload, flowError: { kind: failureKind, message: errorMessage } }
          : resultOfPreviousNode.payload;
      responseOfNode = {
        payload,
        outputHandle: failureBehavior === 'failure-output' ? 'failure' : 'output',
      };
    }

    return await this.executeNextNodes(
      flowRunId,
      node,
      responseOfNode,
      transactionManager,
      resourceContextCache,
      options,
    );
  }

  protected async dispatchNode(
    flowRunId: string,
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
    options: FlowExecutionOptions = {},
    runResourceId: number | null = this.context.resolveRunResourceId(node, options),
  ): Promise<NodeProcessingResult> {
    // Core node types are looked up in the executor record.
    const executor = this.nodeExecutors[node.type as ResourceFlowNodeType];
    if (executor) {
      return executor.execute(
        node,
        input,
        this.context.buildExecutionContext(flowRunId, transactionManager, options, runResourceId),
      );
    }

    // A core node without an executor means usage or metering was never attached; never hand it to a plugin.
    if (CORE_NODE_TYPES.has(node.type)) {
      throw new Error(`No executor attached for core flow node type: ${node.type}`);
    }

    // Plugin-contributed node types fall through to the plugin registry.
    const pluginNode = getPluginFlowNode(node.type);
    if (pluginNode) {
      if (pluginNode.isInput) {
        return { payload: input, outputHandle: 'output' };
      }
      return pluginNode.execute(
        { id: node.id, type: node.type, data: node.data as Record<string, unknown> },
        input,
        this.context.buildExecutionContext(flowRunId, transactionManager, options, runResourceId),
      );
    }

    throw new Error(`No executor found for flow node type: ${node.type}`);
  }

  /**
   * Runs the given trigger nodes. Nodes of different flows (several resources, global flows) run side by side,
   * each flow with its own run id and log, and are settled together like parallel branches of one flow.
   */
  public async startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache: Map<number, FlowResourceContext> = new Map(),
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    const nodes = Array.isArray(node) ? node : [node];
    const flows = new Map<string, ResourceFlowNode[]>();
    for (const trigger of nodes) {
      const owner = trigger.flowId != null ? `flow:${trigger.flowId}` : `resource:${trigger.resourceId}`;
      flows.set(owner, [...(flows.get(owner) ?? []), trigger]);
    }

    return settleFlowBranches(
      [...flows.values()].map((flowNodes) =>
        this.runFlowNodes(flowNodes, data, transactionManager, resourceContextCache, options),
      ),
    );
  }

  protected async runFlowNodes(
    nodes: ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager: EntityManager | undefined,
    resourceContextCache: Map<number, FlowResourceContext>,
    options: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]> {
    return this.flowTimer.timeFlow(nodes[0].type, async () => {
      this.logger.debug(`Processing nodes: ${nodes.map((n) => `ID:${n.id} Type:${n.type}`).join(', ')}`);

      const flowRunId = `${randomBytes(3).toString('base64url').slice(0, 3)}-${randomBytes(3)
        .toString('base64url')
        .slice(0, 3)}-${randomBytes(3).toString('base64url').slice(0, 3)}`;
      const owner = { resourceId: nodes[0].resourceId, flowId: nodes[0].flowId };

      this.flowLogs.record({ flowRunId, nodeId: null, ...owner, type: ResourceFlowLogType.FLOW_START });

      let leafResults: NodeProcessingResult[] = [];
      try {
        leafResults = await settleFlowBranches(
          nodes.map((node) => {
            return this.processNode(flowRunId, node, data, transactionManager, resourceContextCache, options);
          }),
        );
        this.logger.log(`Successfully processed all ${nodes.length} flow nodes`);
      } catch (error) {
        this.logger.error(`Failed to process flow nodes`, error.stack);
        throw error;
      } finally {
        this.flowLogs.record({ flowRunId, nodeId: null, ...owner, type: ResourceFlowLogType.FLOW_COMPLETED });
      }
      return leafResults;
    });
  }
}
