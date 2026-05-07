import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariableScope,
  VariableChangedNodeDataSchema,
} from '@attraccess/database-entities';
import { FlowVariableChangedEvent } from './events/flow-variable-changed.event';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

@Injectable()
export class ResourceFlowVariableTriggerService {
  private readonly logger = new Logger(ResourceFlowVariableTriggerService.name);

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly nodeRepository: Repository<ResourceFlowNode>,
    private readonly executor: ResourceFlowsExecutorService,
    private readonly variables: ResourceFlowVariablesService,
  ) {}

  @OnEvent(FlowVariableChangedEvent.EVENT_NAME)
  async handle(event: FlowVariableChangedEvent): Promise<void> {
    const candidates = await this.nodeRepository.find({
      where: { type: ResourceFlowNodeType.INPUT_VARIABLE_CHANGED },
    });

    for (const node of candidates) {
      const parsed = VariableChangedNodeDataSchema.safeParse(node.data);
      if (!parsed.success) {
        this.logger.warn(`Variable trigger node ${node.id} has invalid data`);
        continue;
      }
      const { watches, source } = parsed.data;

      const matchesWatch = watches.some((w) => w.scope === event.scope && w.key === event.key);
      if (!matchesWatch) continue;

      if (source === 'exclude-self' && event.sourceResourceId === node.resourceId) {
        continue;
      }

      const variableSnapshot: { resource: Record<string, unknown>; global: Record<string, unknown> } = {
        resource: {},
        global: {},
      };
      const resourceKeys = watches.filter((w) => w.scope === 'resource').map((w) => w.key);
      const globalKeys = watches.filter((w) => w.scope === 'global').map((w) => w.key);
      if (resourceKeys.length > 0) {
        variableSnapshot.resource = await this.variables.getMany(
          ResourceFlowVariableScope.RESOURCE,
          node.resourceId,
          resourceKeys,
        );
      }
      if (globalKeys.length > 0) {
        variableSnapshot.global = await this.variables.getMany(ResourceFlowVariableScope.GLOBAL, null, globalKeys);
      }

      await this.executor.startFlow(node, {
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
      });
    }
  }
}
