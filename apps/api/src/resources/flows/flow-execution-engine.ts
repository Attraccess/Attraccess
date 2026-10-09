import { Logger } from '@nestjs/common';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  getExternalEffectFailureBehavior,
} from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { ResourceFlowLogType } from './dto/flow-log.dto';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { getPluginFlowNode } from '../../plugin-system/plugin-flow-node-registry';
import { NodeExecutor, NodeProcessingResult } from './node-executors';
import { ExternalEffectFailureError } from './errors/external-effect-failure.error';
import { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { FlowExecutionContext, getFlowRepository } from './flow-execution-context';

export async function settleFlowBranches(branches: Promise<NodeProcessingResult[]>[]): Promise<NodeProcessingResult[]> {
  // A failed branch cannot release a lifecycle reservation while sibling effects are still running.
  // Wait for work already started, then preserve lifecycle-fatal failures over ordinary node errors.
  let failure: { error: unknown } | undefined;
  const results = await Promise.allSettled(
    branches.map((branch) =>
      branch.catch((error) => {
        if (
          !failure ||
          (error instanceof ExternalEffectFailureError && !(failure.error instanceof ExternalEffectFailureError))
        ) {
          failure = { error };
        }
        throw error;
      }),
    ),
  );
  if (failure) throw failure.error;
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

/** Runs graph branches, records node outcomes, and applies external-effect failure policies. */
export class FlowExecutionEngine {
  constructor(
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    private readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    private readonly flowLogs: FlowLogRecorderService,
    private readonly flowTimer: FlowTimer,
    private readonly nodeExecutors: Record<ResourceFlowNodeType, NodeExecutor>,
    private readonly context: FlowExecutionContext,
    private readonly logger: Logger,
  ) {}

  public async startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache: Map<number, FlowResourceContext> = new Map(),
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    const nodes = Array.isArray(node) ? node : [node];

    return this.flowTimer.timeFlow(nodes[0].type, async () => {
      this.logger.debug(`Processing nodes: ${nodes.map((n) => `ID:${n.id} Type:${n.type}`).join(', ')}`);

      const flowRunId = `${randomBytes(3).toString('base64url').slice(0, 3)}-${randomBytes(3)
        .toString('base64url')
        .slice(0, 3)}-${randomBytes(3).toString('base64url').slice(0, 3)}`;

      this.flowLogs.record({
        flowRunId,
        nodeId: null,
        resourceId: nodes[0].resourceId,
        type: ResourceFlowLogType.FLOW_START,
      });

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
        this.flowLogs.record({
          flowRunId,
          nodeId: null,
          resourceId: nodes[0].resourceId,
          type: ResourceFlowLogType.FLOW_COMPLETED,
        });
      }
      return leafResults;
    });
  }

  private async dispatchNode(
    flowRunId: string,
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult> {
    // Core node types are looked up in the exhaustive record.
    const executor = this.nodeExecutors[node.type as ResourceFlowNodeType];
    if (executor) {
      return executor.execute(node, input, this.context.buildExecutionContext(flowRunId, transactionManager, options));
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
        this.context.buildExecutionContext(flowRunId, transactionManager, options),
      );
    }

    throw new Error(`No executor found for flow node type: ${node.type}`);
  }

  private async processNode(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(`Processing flow node - ID: ${node.id}, Type: ${node.type}, Resource ID: ${node.resourceId}`);

    const startTime = Date.now();

    let responseOfNode: NodeProcessingResult = { payload: {} };
    let dispatchStarted = false;

    try {
      // Log the start of node processing
      const input = (await this.context.withResourceContext(
        node.resourceId,
        resultOfPreviousNode.payload,
        transactionManager,
        resourceContextCache,
      )) as object;

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
        payload: () => ({ input }),
      });

      dispatchStarted = true;
      responseOfNode = await this.flowTimer.timeNode(node.type, () =>
        this.dispatchNode(flowRunId, node, input, transactionManager, options),
      );

      const processingTime = Date.now() - startTime;
      this.logger.debug(`Successfully processed flow node ID: ${node.id} (Type: ${node.type}) in ${processingTime}ms`);

      responseOfNode.payload = (await this.context.withResourceContext(
        node.resourceId,
        responseOfNode.payload,
        transactionManager,
        resourceContextCache,
      )) as object;

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
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

  private errorReason(error: unknown): string {
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

  private async executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(`Looking for outgoing edges from node ID: ${node.id} (Type: ${node.type})`);

    const edgesRepository = getFlowRepository(ResourceFlowEdge, this.flowEdgeRepository, transactionManager);

    const edgesFromThisNode = await edgesRepository.find({
      where: {
        source: node.id,
        sourceHandle: resultOfPreviousNode.outputHandle,
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
        where: { id: edge.target },
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
}
