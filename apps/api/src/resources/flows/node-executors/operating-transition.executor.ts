import { ResourceFlowNode } from '@attraccess/database-entities';
import {
  ResourceOperatingIntervalService,
  ResourceOperatingState,
} from '../../operating-intervals/resource-operating-interval.service';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class OperatingTransitionExecutor implements NodeExecutor {
  constructor(
    private readonly operatingIntervals: ResourceOperatingIntervalService,
    private readonly state: ResourceOperatingState,
  ) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    await this.operatingIntervals.transition(node.resourceId, this.state, ctx.transactionManager);
    return { payload: input };
  }
}
