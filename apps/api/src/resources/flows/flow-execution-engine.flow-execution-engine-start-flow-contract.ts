import { ResourceFlowNode } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';

export abstract class FlowExecutionEngineStartFlowContract {
  abstract startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]>;
  protected abstract dispatchNode(
    flowRunId: string,
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult>;
  protected abstract processNode(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]>;
  protected abstract errorReason(error: unknown): string;
  protected abstract executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]>;
}
