import { ResourceFlowNode } from '@attraccess/database-entities';
import {
  ResourceOperatingIntervalService,
  ResourceOperatingState,
} from '../../operating-intervals/resource-operating-interval.service';
import { ExternalEffectFailureError } from '../errors/external-effect-failure.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class OperatingTransitionExecutor implements NodeExecutor {
  constructor(
    private readonly operatingIntervals: ResourceOperatingIntervalService,
    private readonly state: ResourceOperatingState,
  ) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    try {
      await this.operatingIntervals.transition(node.resourceId, this.state, {
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
