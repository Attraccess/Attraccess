import { FlowNodeRecord } from '@attraccess/application-models';
import {
  ResourceOperatingIntervalService,
  ResourceOperatingState,
} from '../../operating-intervals/resource-operating-interval.service';
import { ExternalEffectFailureError } from '../errors/external-effect-failure.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { requireRunMachineId } from './flow.utils';

export class OperatingTransitionExecutor implements NodeExecutor {
  constructor(
    private readonly operatingIntervals: ResourceOperatingIntervalService,
    private readonly state: ResourceOperatingState,
  ) {}

  async execute(node: FlowNodeRecord, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const resourceId = await requireRunMachineId(node, ctx);
    try {
      await this.operatingIntervals.transition(resourceId, this.state, {
        flowNodeId: node.id,
        flowRunId: ctx.flowRunId,
      });
    } catch (error) {
      // A rejected physical-state observation invalidates the lifecycle that requested it.
      throw new ExternalEffectFailureError('Operating transition failed', error);
    }
    return { payload: input };
  }
}
