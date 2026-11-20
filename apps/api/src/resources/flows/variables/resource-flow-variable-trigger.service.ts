import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceFlowVariableScope, VariableChangedNodeDataSchema } from '@attraccess/application-models';
import { FLOW_TRIGGER_STORE, FlowTriggerStore } from '../flow-trigger-store.port';
import { ResourceFlowVariableChangedEvent } from '../events/flow-variable-changed.event';
import { ResourceFlowsExecutorService } from '../execution/resource-flows-executor.service';
import { isGlobalFlowNode } from '../execution/flow-node-queries';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

@Injectable()
export class ResourceFlowVariableTriggerService {
  private readonly logger = new Logger(ResourceFlowVariableTriggerService.name);

  constructor(
    @Inject(FLOW_TRIGGER_STORE) private readonly triggers: FlowTriggerStore,
    private readonly executor: ResourceFlowsExecutorService,
    private readonly variables: ResourceFlowVariablesService,
  ) {}

  @OnEvent(ResourceFlowVariableChangedEvent.EVENT_NAME)
  async handle(event: ResourceFlowVariableChangedEvent): Promise<void> {
    // A resource variable only concerns that resource's own flow; global flows react to every resource.
    const candidates = await this.triggers.findVariableTriggerNodes(
      event.scope === ResourceFlowVariableScope.RESOURCE ? event.resourceId : null,
    );

    for (const node of candidates) {
      const parsed = VariableChangedNodeDataSchema.safeParse(node.data);
      if (!parsed.success) {
        this.logger.warn(`Variable trigger node ${node.id} has invalid data`);
        continue;
      }
      const { watches, source } = parsed.data;

      const matchesWatch = watches.some((w) => w.scope === event.scope && w.key === event.key);
      if (!matchesWatch) continue;

      const isGlobal = isGlobalFlowNode(node);
      // The resource a run acts on: the node's own, or the resource whose variable changed in a global flow.
      const triggeringResourceId = isGlobal
        ? event.scope === ResourceFlowVariableScope.RESOURCE
          ? event.resourceId
          : null
        : node.resourceId;

      if (!isGlobal && event.scope === ResourceFlowVariableScope.RESOURCE && event.resourceId !== node.resourceId) {
        continue;
      }

      if (source === 'exclude-self') {
        const changedBySelf = isGlobal
          ? event.sourceFlowId === node.flowId
          : event.sourceResourceId === node.resourceId && event.sourceFlowId == null;
        if (changedBySelf) continue;
      }

      const variableSnapshot: { resource: Record<string, unknown>; global: Record<string, unknown> } = {
        resource: {},
        global: {},
      };
      const resourceKeys = watches.filter((w) => w.scope === 'resource').map((w) => w.key);
      const globalKeys = watches.filter((w) => w.scope === 'global').map((w) => w.key);
      if (resourceKeys.length > 0 && triggeringResourceId !== null) {
        variableSnapshot.resource = await this.variables.getMany(
          ResourceFlowVariableScope.RESOURCE,
          triggeringResourceId,
          resourceKeys,
        );
      }
      if (globalKeys.length > 0) {
        variableSnapshot.global = await this.variables.getMany(ResourceFlowVariableScope.GLOBAL, null, globalKeys);
      }

      await this.executor.startFlow(
        node,
        {
          payload: {
            change: {
              scope: event.scope,
              key: event.key,
              previousValue: event.previousValue,
              newValue: event.newValue,
              changedAt: event.changedAt.toISOString(),
              sourceResourceId: event.sourceResourceId,
            },
            variables: variableSnapshot,
          },
        },
        undefined,
        new Map(),
        { triggeringResourceId },
      );
    }
  }
}
