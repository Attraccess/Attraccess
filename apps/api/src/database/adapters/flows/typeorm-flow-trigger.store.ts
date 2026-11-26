import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, IsNull } from 'typeorm';
import { Resource, ResourceFlowEdge, ResourceFlowNode, ResourceUsage } from '@attraccess/database-entities';
import {
  ResourceFlowNodeType,
  type FlowEdgeRecord,
  type FlowNodeRecord,
  type FlowResourceRecord,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../transaction-context';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import {
  DEFAULT_OUTPUT_HANDLE,
  type FlowTriggerStore,
  type InactivityTarget,
} from '../../../resources/flows/flow-trigger-store.port';
import { managerFor } from '../resources/persistence-context';
import { activeUsageSql } from '../usage/active-usage-queries';
import {
  enabledGlobalNodesWhere,
  resourceAndGlobalNodesWhere,
  resourceOwnAndGlobalNodesWhere,
} from './flow-node-queries';
import { toEdgeRecord, toFlowResourceRecord, toNodeRecord } from './flow-mappers';

/** Edges and nodes of the canvas a node belongs to: its global flow, or its resource's own flow. */
function sameOwnerWhere(
  node: FlowNodeRecord,
): { flowId: number } | { resourceId: number; flowId: ReturnType<typeof IsNull> } {
  return node.flowId != null ? { flowId: node.flowId } : { resourceId: node.resourceId as number, flowId: IsNull() };
}

@Injectable()
export class TypeOrmFlowTriggerStore implements FlowTriggerStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private manager(context?: TransactionContext): EntityManager {
    return managerFor(context, this.dataSource.manager, this.unitOfWork);
  }

  private get nodes() {
    return this.dataSource.getRepository(ResourceFlowNode);
  }

  async findOutgoingEdges(
    node: FlowNodeRecord,
    outputHandle: string,
    context?: TransactionContext,
  ): Promise<FlowEdgeRecord[]> {
    const onHandle = (sourceHandle: string | ReturnType<typeof IsNull>): FindOptionsWhere<ResourceFlowEdge> => ({
      source: node.id,
      sourceHandle,
      ...sameOwnerWhere(node),
    });
    // Edges saved without a handle are the default output.
    const where =
      outputHandle === DEFAULT_OUTPUT_HANDLE ? [onHandle(outputHandle), onHandle(IsNull())] : onHandle(outputHandle);
    const edges = await this.manager(context).getRepository(ResourceFlowEdge).find({ where });
    return edges.map(toEdgeRecord);
  }

  async findNodeOnCanvasOf(
    node: FlowNodeRecord,
    nodeId: string,
    context?: TransactionContext,
  ): Promise<FlowNodeRecord | null> {
    const target = await this.manager(context)
      .getRepository(ResourceFlowNode)
      .findOne({ where: { id: nodeId, ...sameOwnerWhere(node) } });
    return target ? toNodeRecord(target) : null;
  }

  async findTriggerNodes(type: string, context?: TransactionContext): Promise<FlowNodeRecord[]> {
    const nodes = await this.manager(context)
      .getRepository(ResourceFlowNode)
      .find({ where: resourceAndGlobalNodesWhere(type) });
    return nodes.map(toNodeRecord);
  }

  async findTriggerNodesForResource(
    resourceId: number,
    type: string,
    context?: TransactionContext,
  ): Promise<FlowNodeRecord[]> {
    const nodes = await this.manager(context)
      .getRepository(ResourceFlowNode)
      .find({ where: resourceOwnAndGlobalNodesWhere(resourceId, type) });
    return nodes.map(toNodeRecord);
  }

  async findVariableTriggerNodes(resourceId: number | null): Promise<FlowNodeRecord[]> {
    const type = ResourceFlowNodeType.INPUT_VARIABLE_CHANGED;
    const own: FindOptionsWhere<ResourceFlowNode> = {
      type,
      flowId: IsNull(),
      ...(resourceId !== null ? { resourceId } : {}),
    };
    const nodes = await this.nodes.find({ where: [own, enabledGlobalNodesWhere(type)] });
    return nodes.map(toNodeRecord);
  }

  async findButton(resourceId: number, buttonId: string): Promise<FlowNodeRecord | null> {
    const button = await this.nodes.findOne({
      where: { resourceId, type: ResourceFlowNodeType.INPUT_BUTTON, id: buttonId },
    });
    return button ? toNodeRecord(button) : null;
  }

  /**
   * One page of plugin trigger nodes: resource flows and enabled global flows. A single query with a plain
   * LIMIT, since a relation filter plus `take` makes TypeORM paginate in two queries.
   */
  async findPluginTriggerPage(type: string, afterNodeId: string | undefined, limit: number): Promise<FlowNodeRecord[]> {
    const query = this.nodes
      .createQueryBuilder('node')
      .leftJoin('node.flow', 'flow')
      .where('node.type = :type', { type })
      .andWhere('(node.flowId IS NULL OR (flow.enabled = :enabled AND flow.scope = :scope))', {
        enabled: true,
        scope: 'global',
      });
    if (afterNodeId) {
      query.andWhere('node.id > :lastId', { lastId: afterNodeId });
    }
    const nodes = await query.orderBy('node.id', 'ASC').limit(limit).getMany();
    return nodes.map(toNodeRecord);
  }

  async findInactivityTargets(): Promise<InactivityTarget[]> {
    const type = ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY;
    const resourceNodes = await this.nodes
      .createQueryBuilder('node')
      .innerJoin(ResourceUsage, 'usage', `usage.resourceId = node.resourceId AND ${activeUsageSql('usage')}`)
      .where('node.type = :type', { type })
      .distinct(true)
      .getMany();
    const pairs = resourceNodes.map((node) => ({ node: toNodeRecord(node), resourceId: node.resourceId as number }));

    const globalNodes = await this.nodes.find({ where: enabledGlobalNodesWhere(type) });
    if (globalNodes.length > 0) {
      const active: Array<{ resourceId: number }> = await this.dataSource.manager
        .createQueryBuilder(ResourceUsage, 'usage')
        .select('usage.resourceId', 'resourceId')
        .where(activeUsageSql('usage'))
        .distinct(true)
        .getRawMany();
      for (const node of globalNodes) {
        for (const { resourceId } of active) {
          pairs.push({ node: toNodeRecord(node), resourceId: Number(resourceId) });
        }
      }
    }
    return pairs;
  }

  async findResource(resourceId: number, context?: TransactionContext): Promise<FlowResourceRecord | null> {
    const resource = await this.manager(context)
      .getRepository(Resource)
      // Only the columns a flow reads: a trigger runs often and must not load the documentation markdown.
      .findOne({
        select: { id: true, name: true, type: true, accessOnly: true, metadata: true },
        where: { id: resourceId },
      });
    return resource ? toFlowResourceRecord(resource) : null;
  }
}
