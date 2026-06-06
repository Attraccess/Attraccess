import { ResourceFlowNode } from '@attraccess/database-entities';
import { NodeExecutor, NodeProcessingResult } from './node-executor.interface';

/**
 * Executor for trigger/input node types and other no-op nodes that simply pass
 * their payload through unchanged.
 */
export class PassthroughExecutor implements NodeExecutor {
  async execute(_node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    return { payload: input };
  }
}
