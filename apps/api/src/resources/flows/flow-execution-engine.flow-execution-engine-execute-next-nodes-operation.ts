import { ResourceFlowNode, ResourceFlowEdge } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { getFlowRepository } from './flow-execution-context';
import { FlowExecutionEngineErrorReasonOperation } from './flow-execution-engine.flow-execution-engine-error-reason-operation';
import { settleFlowBranches } from './settle-flow-branches';

export abstract class FlowExecutionEngineExecuteNextNodesOperation extends FlowExecutionEngineErrorReasonOperation {
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
