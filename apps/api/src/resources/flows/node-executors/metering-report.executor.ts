import { ResourceMeteringService } from '../../metering/resource-metering.service';
import { MeteringReportNodeDataSchema, ResourceFlowNode } from '@attraccess/database-entities';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class MeteringReportExecutor implements NodeExecutor {
  constructor(private readonly metering: ResourceMeteringService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    if (ctx.metering?.kind === 'start') throw new FlowExecutionError('Report meter cannot acknowledge a start request');
    const data = MeteringReportNodeDataSchema.parse(node.data ?? {});
    const render = (template?: string) =>
      template ? ctx.compileTemplate(template, input).trim() || undefined : undefined;
    const observedAt = render(data.observedAt);
    if (data.observedAt?.trim() && observedAt === undefined) {
      throw new FlowExecutionError('The configured observed-at time rendered empty; refusing to report without it');
    }
    const report = {
      mode: data.mode,
      kind: 'reading' as const,
      value: render(data.value) ?? '',
      observedAt,
      source: render(data.source),
    };
    if (ctx.metering) {
      if (data.meterId !== ctx.metering.meterId)
        throw new FlowExecutionError('The selected meter does not match the metering request');
      await ctx.metering.complete(report);
    } else {
      await this.metering.report(
        node.resourceId,
        data.meterId,
        report,
        ctx.transactionManager,
        ctx.lifecycleAttemptId,
        ctx.flowRunId ? `flow:${ctx.flowRunId}:${node.id}` : undefined,
      );
    }
    return { payload: input };
  }
}
