import { MeteringReadyNodeDataSchema, ResourceFlowNode } from '@attraccess/database-entities';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class MeteringReadyExecutor implements NodeExecutor {
  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    if (ctx.metering?.kind !== 'start') {
      throw new FlowExecutionError('"Metering ready" can only run in a branch started by "Metering start"');
    }
    const data = MeteringReadyNodeDataSchema.parse(node.data ?? {});
    const render = (template?: string) =>
      template ? ctx.compileTemplate(template, input).trim() || undefined : undefined;
    const baselineValue = render(data.baselineValue);
    await ctx.metering.complete({
      kind: 'ready',
      baseline: baselineValue ? { value: baselineValue, unit: render(data.baselineUnit) ?? '' } : undefined,
      source: render(data.source),
    });
    return { payload: input };
  }
}
