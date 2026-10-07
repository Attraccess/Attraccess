import { ResourceFlowNode, getExternalEffectFailureBehavior } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { ResourceFlowLogType } from './dto/flow-log.dto';
import { NodeProcessingResult } from './node-executors';
import { ExternalEffectFailureError } from './errors/external-effect-failure.error';
import { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { FlowExecutionEngineDispatchNodeOperation } from './flow-execution-engine.flow-execution-engine-dispatch-node-operation';
export abstract class FlowExecutionEngineProcessNodeOperation extends FlowExecutionEngineDispatchNodeOperation {
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
}
