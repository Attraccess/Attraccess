import { Logger } from '@nestjs/common';
import {
  FlowNodeRecord,
  ResourceHealthHeartbeatNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceFlowNodeType,
  ResourceHealthSource,
  ResourceHealthStatus,
} from '@attraccess/application-models';
import { ResourceHealthService } from '../../health/resource-health.service';
import { CronTimer } from '../../../metrics/instrumentation/cron/cron.helper';
import {
  NodeProcessingResult,
  globalHeartbeatKey,
  globalHeartbeatKeyPrefix,
  heartbeatKey,
  parseGlobalHeartbeatKey,
} from '../node-executors';
import type { FlowExecutionOptions } from './flow-execution.types';
import type { FlowTriggerStore, InactivityTarget } from '../flow-trigger-store.port';
import { isGlobalFlowNode } from './flow-node-queries';

const NO_ACTIVITY_CONCURRENCY = 10;

/** Minute-based activity triggers and heartbeat expiry share the executor's live state. */
export class FlowResourceMonitor {
  constructor(
    private readonly store: Pick<FlowTriggerStore, 'findTriggerNodes' | 'findInactivityTargets'>,
    private readonly resourceActivity: Map<number, Date>,
    private readonly heartbeatLastSeen: Map<string, Date>,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly cronTimer: CronTimer,
    private readonly startFlow: (
      node: FlowNodeRecord,
      data: NodeProcessingResult,
      options?: FlowExecutionOptions,
    ) => Promise<NodeProcessingResult[]>,
    private readonly logger: Logger,
  ) {}

  /** When a no-activity node last fired for a resource; every (node, resource) pair keeps its own schedule. */
  private readonly noActivityFiredAt = new Map<string, Date>();

  private async heartbeatNodes() {
    return this.store.findTriggerNodes(ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT);
  }

  public async checkHealthHeartbeats() {
    const heartbeatNodes = await this.heartbeatNodes();

    // Resource-flow nodes own `resourceId::identifier` keys; global nodes own keys prefixed with their node id.
    const validKeys = new Set<string>();
    const globalIdentifiers = new Map<string, string>();
    for (const node of heartbeatNodes) {
      const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
      if (!parsed.success) {
        continue;
      }
      const identifier = (parsed.data.identifier ?? '').trim();
      if (isGlobalFlowNode(node)) {
        globalIdentifiers.set(encodeURIComponent(node.id), identifier);
      } else if (node.resourceId !== null) {
        validKeys.add(heartbeatKey(node.resourceId, identifier));
      }
    }

    for (const key of this.heartbeatLastSeen.keys()) {
      const global = parseGlobalHeartbeatKey(key);
      const valid = global ? globalIdentifiers.get(global.encodedNodeId) === global.identifier : validKeys.has(key);
      if (!valid) {
        this.heartbeatLastSeen.delete(key);
      }
    }

    if (heartbeatNodes.length === 0) {
      return;
    }

    const now = new Date();

    await Promise.all(
      heartbeatNodes.map(async (node) => {
        const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
        if (!parsed.success) {
          this.logger.warn(`Skipping heartbeat node ${node.id} with invalid data: ${parsed.error.message}`);
          return;
        }

        const identifier = (parsed.data.identifier ?? '').trim();
        const timeoutMs = parsed.data.timeoutSeconds * 1000;
        const reasonTemplate = (parsed.data.unhealthyReason ?? '').trim();
        const reason = reasonTemplate.length > 0 ? reasonTemplate : 'Heartbeat timed out';

        // A global node only watches the resources that already beat through it.
        const resourceIds = isGlobalFlowNode(node)
          ? [...this.heartbeatLastSeen.keys()]
              .filter((key) => key.startsWith(globalHeartbeatKeyPrefix(node.id)))
              .map((key) => parseGlobalHeartbeatKey(key)?.resourceId)
              .filter((resourceId): resourceId is number => resourceId !== undefined)
          : node.resourceId !== null
            ? [node.resourceId]
            : [];

        for (const resourceId of resourceIds) {
          const key = isGlobalFlowNode(node)
            ? globalHeartbeatKey(node.id, resourceId, identifier)
            : heartbeatKey(resourceId, identifier);
          const lastSeen = this.heartbeatLastSeen.get(key);

          if (!lastSeen) {
            this.heartbeatLastSeen.set(key, now);
            continue;
          }

          const elapsed = now.getTime() - lastSeen.getTime();
          if (elapsed < timeoutMs) {
            continue;
          }

          await this.resourceHealthService.reportHealth({
            resourceId,
            identifier,
            status: ResourceHealthStatus.UNHEALTHY,
            reason,
            source: ResourceHealthSource.HEARTBEAT,
            reportedAt: now,
          });
        }
      }),
    );
  }

  public async checkResourceActivity() {
    await this.cronTimer.time('flow_minute_tick', async () => {
      const now = new Date();

      const pairs: InactivityTarget[] = await this.store.findInactivityTargets();

      const currentKeys = new Set(pairs.map(({ node, resourceId }) => noActivityKey(node.id, resourceId)));
      for (const key of this.noActivityFiredAt.keys()) {
        if (!currentKeys.has(key)) this.noActivityFiredAt.delete(key);
      }

      // Bounded so global nodes times many machines do not start hundreds of runs at once.
      // A failing run does not keep later pairs from firing.
      for (let offset = 0; offset < pairs.length; offset += NO_ACTIVITY_CONCURRENCY) {
        const chunk = pairs.slice(offset, offset + NO_ACTIVITY_CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async ({ node, resourceId }) => {
            const parsedData = InputResourceActivityNoActivityNodeDataSchema.safeParse(node.data);
            if (!parsedData.success) {
              this.logger.warn(
                `Skipping resource inactivity node ${node.id} (resource ${resourceId}, flow ${node.flowId}) because of invalid data: ${parsedData.error.message}`,
              );
              return;
            }

            const { minInactivityMinutes } = parsedData.data;

            const lastActivity = this.resourceActivity.get(resourceId);
            if (!lastActivity) {
              this.resourceActivity.set(resourceId, now);
              return;
            }

            // Activity restarts the countdown; so does this node firing, but only for this pair.
            const key = noActivityKey(node.id, resourceId);
            const lastFired = this.noActivityFiredAt.get(key);
            const reference = lastFired && lastFired > lastActivity ? lastFired : lastActivity;

            const millisSinceReference = now.getTime() - reference.getTime();
            const minutesSinceReference = millisSinceReference / 1000 / 60;

            if (minutesSinceReference < minInactivityMinutes) {
              return;
            }

            this.logger.debug(
              `Resource ${resourceId} has been inactive for ${minutesSinceReference} minutes, triggering inactivity node`,
            );
            this.noActivityFiredAt.set(key, now);
            await this.startFlow(node, { payload: {} }, { triggeringResourceId: resourceId });
          }),
        );
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const { node, resourceId } = chunk[index];
            this.logger.error(
              `No-activity node ${node.id} failed for resource ${resourceId}`,
              result.reason instanceof Error ? result.reason.stack : undefined,
            );
          }
        });
      }
    });
  }
}

function noActivityKey(nodeId: string, resourceId: number): string {
  return `${nodeId}::${resourceId}`;
}
