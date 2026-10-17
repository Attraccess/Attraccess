import { FlowExecutionPersistence } from './port';
import { activeUsageSql } from '../../../database/sqlite/usage-integrity';
import { FlowEventPersistence } from './port';
import { FlowEdgeDraft, FlowNodeDraft, FlowWriteOperations, ResourceFlowPersistence } from './port';
import {
  Resource,
  ResourceFlowEdge,
  ResourceMeter,
  ResourceUsage,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariable,
  ResourceFlowVariableScope,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, MoreThan, Repository } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { FlowTriggerPersistence, FlowVariablePersistence, StoredFlowVariable } from './port';

@Injectable()
export class TypeormFlowVariablePersistence extends FlowVariablePersistence {
  constructor(@InjectRepository(ResourceFlowVariable) private readonly values: Repository<ResourceFlowVariable>) {
    super();
  }
  async findValue(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    key: string,
  ): Promise<ResourceFlowVariable | null> {
    return toApplicationRecord(
      await this.values.findOne({ where: { scope, resourceId: resourceId ?? IsNull(), key } }),
    );
  }
  async findValues(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    keys: readonly string[],
  ): Promise<ResourceFlowVariable[]> {
    if (!keys.length) return [];
    return toApplicationRecord(
      await this.values.find({ where: { scope, resourceId: resourceId ?? IsNull(), key: In([...keys]) } }),
    );
  }
  async visibleValues(resourceId: number | null, ordered: boolean): Promise<ResourceFlowVariable[]> {
    return toApplicationRecord(
      await this.values.find({
        where: [
          { scope: ResourceFlowVariableScope.GLOBAL, resourceId: IsNull() },
          ...(resourceId == null ? [] : [{ scope: ResourceFlowVariableScope.RESOURCE, resourceId }]),
        ],
        ...(ordered ? { order: { scope: 'ASC', key: 'ASC' } } : {}),
      }),
    );
  }
  async storeValue(row: StoredFlowVariable): Promise<ResourceFlowVariable> {
    return toApplicationRecord(await this.values.save(row));
  }
  async removeValue(scope: ResourceFlowVariableScope, resourceId: number | null, key: string): Promise<void> {
    await this.values.delete({ scope, resourceId: resourceId ?? IsNull(), key });
  }
}

@Injectable()
export class TypeormFlowTriggerPersistence extends FlowTriggerPersistence {
  constructor(@InjectRepository(ResourceFlowNode) private readonly nodes: Repository<ResourceFlowNode>) {
    super();
  }
  async variableTriggers(resourceId?: number): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(
      await this.nodes.find({
        where: {
          type: ResourceFlowNodeType.INPUT_VARIABLE_CHANGED,
          ...(resourceId !== undefined ? { resourceId } : {}),
        },
      }),
    );
  }
}

@Injectable()
export class TypeormResourceFlowPersistence extends ResourceFlowPersistence {
  constructor(
    @InjectRepository(ResourceFlowNode) private readonly nodes: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) private readonly edges: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {
    super();
  }
  async findResource(id: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id } }));
  }
  async graphNodes(resourceId: number): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(await this.nodes.find({ where: { resource: { id: resourceId } } }));
  }
  async graphEdges(resourceId: number): Promise<ResourceFlowEdge[]> {
    return toApplicationRecord(await this.edges.find({ where: { resource: { id: resourceId } } }));
  }
  async nodesByType(resourceIds: readonly number[], type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    if (!resourceIds.length) return [];
    return toApplicationRecord(
      await this.nodes.find({
        where: { resourceId: resourceIds.length === 1 ? resourceIds[0] : In([...resourceIds]), type },
      }),
    );
  }
  async meterIds(resourceId: number): Promise<number[]> {
    return (await this.resources.manager.find(ResourceMeter, { where: { resourceId }, select: { id: true } })).map(
      (meter) => meter.id,
    );
  }
}
export class TypeormFlowWriteOperations implements FlowWriteOperations {
  constructor(private readonly manager: EntityManager) {}
  async nodesByType(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(
      await this.manager.find(ResourceFlowNode, { where: { resource: { id: resourceId }, type } }),
    );
  }
  async replaceGraph(
    resource: Resource,
    nodes: readonly FlowNodeDraft[],
    edges: readonly FlowEdgeDraft[],
  ): Promise<{ nodes: ResourceFlowNode[]; edges: ResourceFlowEdge[] }> {
    await this.manager.delete(ResourceFlowNode, { resource: { id: resource.id } });
    await this.manager.delete(ResourceFlowEdge, { resource: { id: resource.id } });
    const [savedNodes, savedEdges] = await Promise.all([
      this.manager.save(
        ResourceFlowNode,
        nodes.map((node) => Object.assign(new ResourceFlowNode(), node, { resource })),
      ),
      this.manager.save(
        ResourceFlowEdge,
        edges.map((edge) => Object.assign(new ResourceFlowEdge(), edge, { resource })),
      ),
    ]);
    return toApplicationRecord({ nodes: savedNodes, edges: savedEdges });
  }
}

@Injectable()
export class TypeormFlowEventPersistence extends FlowEventPersistence {
  constructor(@InjectRepository(ResourceFlowNode) private readonly nodes: Repository<ResourceFlowNode>) {
    super();
  }
  async nodesByType(type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(await this.nodes.find({ where: { type } }));
  }
  async pageNodesByType(
    type: ResourceFlowNodeType,
    afterId: string | undefined,
    limit: number,
  ): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(
      await this.nodes.find({
        where: { type, ...(afterId ? { id: MoreThan(afterId) } : {}) },
        order: { id: 'ASC' },
        take: limit,
      }),
    );
  }
  async activeInactivityNodes(): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(
      await this.nodes
        .createQueryBuilder('node')
        .innerJoin(ResourceUsage, 'usage', `usage.resourceId = node.resourceId AND ${activeUsageSql('usage')}`)
        .where('node.type = :type', { type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY })
        .distinct(true)
        .getMany(),
    );
  }
}

export class TypeormFlowExecutionPersistence extends FlowExecutionPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async resource(id: number): Promise<Resource | null> {
    return toApplicationRecord(await this.manager.getRepository(Resource).findOne({ where: { id } }));
  }
  async button(resourceId: number, buttonId: string): Promise<ResourceFlowNode | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceFlowNode)
        .findOne({ where: { resourceId, type: ResourceFlowNodeType.INPUT_BUTTON, id: buttonId } }),
    );
  }
  async triggers(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(
      await this.manager.getRepository(ResourceFlowNode).find({ where: { resourceId, type } }),
    );
  }
  async outgoingEdges(nodeId: string, handle: string | undefined): Promise<ResourceFlowEdge[]> {
    return toApplicationRecord(
      await this.manager.getRepository(ResourceFlowEdge).find({ where: { source: nodeId, sourceHandle: handle } }),
    );
  }
  async node(id: string): Promise<ResourceFlowNode | null> {
    return toApplicationRecord(await this.manager.getRepository(ResourceFlowNode).findOne({ where: { id } }));
  }
}
