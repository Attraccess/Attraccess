import { ResourceFlowNode } from '@attraccess/database-entities';
import {
  ResourceOperatingIntervalService,
  ResourceOperatingState,
} from '../../operating-intervals/resource-operating-interval.service';
import { NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class OperatingTransitionExecutor implements NodeExecutor {
  constructor(
    private readonly operatingIntervals: ResourceOperatingIntervalService,
    private readonly state: ResourceOperatingState,
  ) {}

  async execute(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    await this.operatingIntervals.transition(node.resourceId, this.state);
    return { payload: input };
  }
}
