import type { AuditActor } from '../../../audit/recorder/audit-event';
import { Flow, Resource, ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import { ResourceFlowNodeType, ResourceType } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceFlowSaveDto } from '../../../resources/flows/dto/index';
import { GlobalFlowsService } from '../../../resources/flows/global-flows.service';
import { ResourceFlowsService } from '../../../resources/flows/resource-flows.service';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TypeOrmFlowGraphStore } from './typeorm-flow-graph.store';
import { TypeOrmFlowResourceDirectory } from './typeorm-flow-resource-directory';

/**
 * A real PostgreSQL database (a private copy of the migrated template) with one machine and one enabled global flow.
 * `source.destroy()` also drops the database.
 */
export async function openFlowCanvasDatabase() {
  const source = await createTestDataSource();
  const destroy = source.destroy.bind(source);
  source.destroy = async () => {
    source.destroy = destroy;
    await closeTestDataSource(source);
  };
  const flows = source.getRepository(Flow);
  const nodes = source.getRepository(ResourceFlowNode);
  const edges = source.getRepository(ResourceFlowEdge);
  const resources = source.getRepository(Resource);
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const graph = new TypeOrmFlowGraphStore(source, unitOfWorkFor(source), audit as never);
  const resourceFlows = new ResourceFlowsService(
    graph,
    new TypeOrmFlowResourceDirectory(source),
    { subscribe: jest.fn().mockResolvedValue(undefined) } as never,
    new EventEmitter2(),
    audit as never,
  );
  const globalFlows = new GlobalFlowsService(graph, resourceFlows, audit as never);
  const resource = await resources.save(resources.create({ name: 'Laser', type: ResourceType.Machine }));
  const flow = await flows.save(flows.create({ name: 'Notify', enabled: true, scope: 'global' }));
  return { source, graph, flows, nodes, edges, resource, flow, resourceFlows, globalFlows, audit };
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
