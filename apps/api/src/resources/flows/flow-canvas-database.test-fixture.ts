import type { AuditActor } from '../../audit/recorder/audit-event';
import {
  entities,
  Flow,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceType,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ResourceFlowSaveDto } from './dto/index';
import { GlobalFlowsService } from './global-flows.service';
import { ResourceFlowsService } from './resource-flows.service';

/** A real SQLite schema (synchronized from the entities) with one machine and one enabled global flow. */
export async function openFlowCanvasDatabase() {
  const source = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: Object.values(entities),
    synchronize: true,
  }).initialize();
  const flows = source.getRepository(Flow);
  const nodes = source.getRepository(ResourceFlowNode);
  const edges = source.getRepository(ResourceFlowEdge);
  const resources = source.getRepository(Resource);
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const resourceFlows = new ResourceFlowsService(
    nodes,
    edges,
    resources,
    { subscribe: jest.fn().mockResolvedValue(undefined) } as never,
    new EventEmitter2(),
    flows,
    audit as never,
  );
  const globalFlows = new GlobalFlowsService(flows, nodes, edges, resourceFlows, audit as never);
  const resource = await resources.save(resources.create({ name: 'Laser', type: ResourceType.Machine }));
  const flow = await flows.save(flows.create({ name: 'Notify', enabled: true, scope: 'global' }));
  return { source, flows, nodes, edges, resource, flow, resourceFlows, globalFlows, audit };
}

/** The signed-in user of a canvas save. */
export const testActor: AuditActor = { id: 7, authenticationMethod: 'session' };

/** A start trigger wired to an HTTP request; ids are prefixed so two canvases can share or avoid ids. */
export function startToHttpCanvas(prefix: string): ResourceFlowSaveDto {
  const position = { x: 0, y: 0 };
  return {
    nodes: [
      { id: `${prefix}-start`, type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, position, data: {} },
      {
        id: `${prefix}-http`,
        type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST,
        position,
        data: { url: 'https://example.com', method: 'POST' },
      },
    ],
    edges: [
      {
        id: `${prefix}-edge`,
        source: `${prefix}-start`,
        sourceHandle: 'output',
        target: `${prefix}-http`,
        targetHandle: 'input',
      },
    ],
  };
}
