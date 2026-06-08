import { ResourceFlowNode, ErrorNodeDataSchema } from '@attraccess/database-entities';
import z from 'zod';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class ErrorExecutor implements NodeExecutor {
  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const { message: messageTemplate } = node.data as z.infer<typeof ErrorNodeDataSchema>;

    const message = ctx.compileTemplate(messageTemplate, input);

    throw new FlowExecutionError(message);
  }
}
