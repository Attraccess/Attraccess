import { EntityManager } from 'typeorm';
import { ResourceFlowNode } from '@attraccess/database-entities';

export interface NodeProcessingResult {
  payload: object;
  outputHandle?: string;
}

export type FlowFailureKind =
  'transport-dispatch' | 'acknowledgement-timeout' | 'controller-rejection' | 'node-failure';

export interface TemplateVariables {
  resource: Record<string, unknown>;
  global: Record<string, unknown>;
}

/**
 * Per-execution context handed to every node executor. Carries the active
 * transaction (if any) plus template helpers owned by the executor service so
 * executors stay free of the Handlebars/variable plumbing.
 */
export interface NodeExecutionContext {
  transactionManager?: EntityManager;
  compileTemplate(template: string, data: object): string;
  getTemplateVariables(data: object): TemplateVariables | undefined;
  setTemplateVariables(data: object, variables: TemplateVariables): void;
}

/**
 * Strategy interface implemented by one class per flow node type. The executor
 * service dispatches to these via a registry, keeping itself a thin orchestrator.
 */
export interface NodeExecutor {
  execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult>;
  getFailureKind?(error: unknown): FlowFailureKind;
}
