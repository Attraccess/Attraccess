import { ResourceFlowNode, WaitNodeDataSchema } from '@attraccess/database-entities';
import z from 'zod';
import { NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class WaitExecutor implements NodeExecutor {
  async execute(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const { duration, unit } = node.data as z.infer<typeof WaitNodeDataSchema>;

    let waitDurationMs = duration * 1000;
    if (unit === 'minutes') {
      waitDurationMs *= 60;
    } else if (unit === 'hours') {
      waitDurationMs *= 60 * 60;
    }

    await new Promise((resolve) => setTimeout(resolve, waitDurationMs));

    return { payload: input };
  }
}
