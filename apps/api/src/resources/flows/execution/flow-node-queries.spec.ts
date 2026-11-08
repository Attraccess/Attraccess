import { Logger } from '@nestjs/common';
import {
  entities,
  Flow,
  Resource,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceType,
} from '@attraccess/database-entities';
import { DataSource, Repository } from 'typeorm';
import {
  enabledGlobalNodesWhere,
  resourceAndGlobalNodesWhere,
  resourceOwnAndGlobalNodesWhere,
} from './flow-node-queries';
import { FlowTriggerDispatcher } from './trigger-dispatcher';

// The where helpers run against a real SQLite schema, so "disabled flows never run" is not only checked on mocks.
describe('flow node queries (SQLite)', () => {
  const type = ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED;
  let source: DataSource;
  let nodes: Repository<ResourceFlowNode>;

  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    nodes = source.getRepository(ResourceFlowNode);
    const resources = source.getRepository(Resource);
    const flows = source.getRepository(Flow);

    const [laser, drill] = await resources.save([
      resources.create({ name: 'Laser', type: ResourceType.Machine }),
      resources.create({ name: 'Drill', type: ResourceType.Machine }),
    ]);
    const [enabled, disabled, otherScope] = await flows.save([
      flows.create({ name: 'On', enabled: true, scope: 'global' }),
      flows.create({ name: 'Off', enabled: false, scope: 'global' }),
      // A future named resource flow shares the table; it must never count as global.
      flows.create({ name: 'Named', enabled: true, scope: 'resource' as never }),
    ]);

    const node = (id: string, owner: { resourceId?: number; flowId?: number }, nodeType = type) =>
      nodes.create({
        id,
        type: nodeType,
        position: { x: 0, y: 0 },
        data: {},
        resourceId: owner.resourceId ?? null,
        flowId: owner.flowId ?? null,
      });
    await nodes.save([
      node('laser-own', { resourceId: laser.id }),
      node('drill-own', { resourceId: drill.id }),
      node('global-on', { flowId: enabled.id }),
      node('global-off', { flowId: disabled.id }),
      node('named-resource-flow', { flowId: otherScope.id }),
      node('global-on-other-type', { flowId: enabled.id }, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED),
    ]);
  });

  afterAll(async () => {
    await source.destroy();
  });

  const ids = async (where: Parameters<Repository<ResourceFlowNode>['find']>[0]['where']) =>
    (await nodes.find({ where, order: { id: 'ASC' } })).map((n) => n.id);

  it('enabledGlobalNodesWhere matches only nodes of enabled global flows', async () => {
    expect(await ids(enabledGlobalNodesWhere(type))).toEqual(['global-on']);
  });

  it('resourceAndGlobalNodesWhere matches every resource flow plus enabled global flows', async () => {
    expect(await ids(resourceAndGlobalNodesWhere(type))).toEqual(['drill-own', 'global-on', 'laser-own']);
  });

  it("resourceOwnAndGlobalNodesWhere matches the resource's own flow plus enabled global flows", async () => {
    const laser = await source.getRepository(Resource).findOneByOrFail({ name: 'Laser' });
    expect(await ids(resourceOwnAndGlobalNodesWhere(laser.id, type))).toEqual(['global-on', 'laser-own']);
  });

  it('the plugin trigger page query has the same semantics in one query', async () => {
    const dispatcher = new FlowTriggerDispatcher(nodes, {} as never, jest.fn(), new Logger('test'));
    const page = (lastId: string | undefined, size: number) =>
      (
        dispatcher as unknown as {
          pluginTriggerPage(t: string, l: string | undefined, s: number): Promise<ResourceFlowNode[]>;
        }
      ).pluginTriggerPage(type, lastId, size);

    expect((await page(undefined, 100)).map((n) => n.id)).toEqual(['drill-own', 'global-on', 'laser-own']);
    expect((await page(undefined, 2)).map((n) => n.id)).toEqual(['drill-own', 'global-on']);
    expect((await page('global-on', 2)).map((n) => n.id)).toEqual(['laser-own']);
  });
});
