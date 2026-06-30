import { ResourceFlowNode, CompanionLockNodeDataSchema } from '@attraccess/database-entities';
import { CompanionGatewayService } from '../../../companion/companion-gateway.service';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class CompanionLockPcExecutor implements NodeExecutor {
  constructor(private readonly companionGateway: CompanionGatewayService) {}

  async execute(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const parsed = CompanionLockNodeDataSchema.safeParse(node.data ?? {});
    if (!parsed.success) {
      throw new FlowExecutionError(`Invalid companion-lock-pc node data: ${parsed.error.message}`);
    }

    const delivered = await this.companionGateway.sendLockCommand(parsed.data.deviceId);
    return { payload: { ...(input as object), companion: { delivered } } };
  }
}
