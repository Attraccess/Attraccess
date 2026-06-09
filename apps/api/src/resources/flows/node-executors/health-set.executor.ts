import {
  ResourceFlowNode,
  ResourceHealthSetNodeDataSchema,
  ResourceHealthSource,
  ResourceHealthStatus,
  HealthStateOptionEnum,
} from '@attraccess/database-entities';
import { get } from 'lodash-es';
import { ResourceHealthService } from '../../health/resource-health.service';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class HealthSetExecutor implements NodeExecutor {
  constructor(private readonly resourceHealthService: ResourceHealthService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const parsed = ResourceHealthSetNodeDataSchema.safeParse(node.data ?? {});
    if (!parsed.success) {
      throw new FlowExecutionError(`Invalid health-set node data: ${parsed.error.message}`);
    }

    const identifierFromPayload = get(input, 'health.identifier') as unknown;
    const identifierOverride =
      typeof identifierFromPayload === 'string' && identifierFromPayload.length > 0 ? identifierFromPayload : null;
    const identifier = identifierOverride ?? ctx.compileTemplate(parsed.data.identifier ?? '', input);

    const statusFromPayload = get(input, 'health.status') as unknown;
    const statusOverride =
      typeof statusFromPayload === 'string' && statusFromPayload.length > 0 ? statusFromPayload : null;
    const statusCandidate = statusOverride ?? parsed.data.status;
    const statusEnum = HealthStateOptionEnum.safeParse(statusCandidate);
    if (!statusEnum.success) {
      throw new FlowExecutionError(
        `Invalid health-set status "${String(statusCandidate)}"; expected "healthy" or "unhealthy"`,
      );
    }
    const status = statusEnum.data === 'healthy' ? ResourceHealthStatus.HEALTHY : ResourceHealthStatus.UNHEALTHY;

    const reasonFromPayload = get(input, 'health.reason') as unknown;
    const reasonOverride =
      typeof reasonFromPayload === 'string' && reasonFromPayload.length > 0 ? reasonFromPayload : null;
    const reasonCandidate = reasonOverride ?? ctx.compileTemplate(parsed.data.reason ?? '', input);

    await this.resourceHealthService.reportHealth({
      resourceId: node.resourceId,
      identifier,
      status,
      reason: status === ResourceHealthStatus.UNHEALTHY ? reasonCandidate : null,
      source: statusOverride !== null ? ResourceHealthSource.PAYLOAD : ResourceHealthSource.MANUAL,
    });

    return { payload: input };
  }
}
