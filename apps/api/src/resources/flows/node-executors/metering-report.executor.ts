import type { ResourceMeteringService } from '../../metering/resource-metering.service';
import { MeteringOperationError } from '../../metering/metering-readings';
import { MeteringValueError } from '../../metering/quantity';
import { FlowNodeRecord, MeteringReportNodeDataSchema } from '@attraccess/application-models';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { requireRunResourceId } from './flow.utils';

export class MeteringReportExecutor implements NodeExecutor {
  constructor(private readonly metering: ResourceMeteringService) {}

  async execute(node: FlowNodeRecord, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
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
    const usageId = render(data.usageId);
    if (usageId !== undefined && !/^[1-9]\d{0,15}$/.test(usageId))
      throw new FlowExecutionError(`The usage ID "${usageId}" is not a session ID`);
    if (ctx.metering) {
      if (data.meterId !== ctx.metering.meterId)
        throw new FlowExecutionError('The selected meter does not match the metering request');
      await ctx.metering.complete(report);
    } else {
      try {
        await this.metering.report(
          requireRunResourceId(node, ctx),
          data.meterId,
          report,
          // Metering takes the engine's own transaction handle until it moves to scopes.
          ctx.transactionManager as Parameters<ResourceMeteringService['report']>[3],
          ctx.lifecycleAttemptId,
          ctx.flowRunId ? `flow:${ctx.flowRunId}:${node.id}` : undefined,
          usageId === undefined ? undefined : Number(usageId),
        );
      } catch (error) {
        // A reading the meter refuses (for example one that names no session) is a flow error the person sees.
        if (error instanceof MeteringOperationError || error instanceof MeteringValueError)
          throw new FlowExecutionError(error.message);
        throw error;
      }
    }
    return { payload: input };
  }
}
