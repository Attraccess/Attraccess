import { ResourceFlowNode, SetPayloadNodeDataSchema } from '@attraccess/database-entities';
import { set as lodashSet } from 'lodash-es';
import z from 'zod';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class SetPayloadExecutor implements NodeExecutor {
  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const { entries } = node.data as z.infer<typeof SetPayloadNodeDataSchema>;

    const newPayload: Record<string, unknown> = JSON.parse(JSON.stringify(input ?? {}));

    for (const entry of entries ?? []) {
      const compiledValue = ctx.compileTemplate(entry.value ?? '', input);
      lodashSet(newPayload, entry.key, compiledValue);
    }

    return { payload: newPayload };
  }
}
