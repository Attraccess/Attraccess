import { MeteringReportNodeDataSchema, ResourceFlowNode } from '@attraccess/database-entities';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class MeteringReportExecutor implements NodeExecutor {
  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    if (!ctx.metering || ctx.metering.kind === 'start') {
      throw new FlowExecutionError('"Report energy" can only run in a branch started by "Metering collection"');
    }
    const data = MeteringReportNodeDataSchema.parse(node.data ?? {});
    const render = (template?: string) =>
      template ? ctx.compileTemplate(template, input).trim() || undefined : undefined;
    await ctx.metering.complete({
      kind: 'reading',
      value: render(data.value) ?? '',
      unit: render(data.unit) ?? '',
      observedAt: render(data.observedAt),
      source: render(data.source),
    });
    return { payload: input };
  }
}
