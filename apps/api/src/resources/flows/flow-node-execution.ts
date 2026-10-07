import { getExternalEffectFailureBehavior, ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { ResourceFlowLogType } from './dto/flow-log.dto';
import { ExternalEffectFailureError } from './errors/external-effect-failure.error';
import { FlowExecutionStartImplementation } from './flow-execution-start';
import { NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext } from './resource-flows-executor.service.feature-definitions';
export abstract class FlowNodeExecutionImplementation extends FlowExecutionStartImplementation {
  protected async processNode(
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
      const input = (await this.withResourceContext(
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

      responseOfNode.payload = (await this.withResourceContext(
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

  protected async executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(`Looking for outgoing edges from node ID: ${node.id} (Type: ${node.type})`);

    const edgesRepository = this.getRepository(ResourceFlowEdge, this.flowEdgeRepository, transactionManager);

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

    const flowNodeRepository = this.getRepository(ResourceFlowNode, this.flowNodeRepository, transactionManager);

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

    return this.settleFlowBranches(edgePromises);
  }
}
