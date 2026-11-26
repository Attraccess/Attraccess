import { Flow, Resource, ResourceFlowEdge, ResourceFlowNode, ResourceUsage, User } from '@attraccess/database-entities';
import { ResourceFlowNodeType, ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmFlowTriggerStore } from './typeorm-flow-trigger.store';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';

// The trigger lookups run against a real PostgreSQL schema, so "disabled flows never run" is not only checked on fakes.
describe('TypeOrmFlowTriggerStore (PostgreSQL)', () => {
  const type = ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED;
  let source: DataSource;
  let store: TypeOrmFlowTriggerStore;
  let laserId: number;
  let drillId: number;
  let enabledFlowId: number;
  let disabledFlowId: number;

  const ids = (nodes: Array<{ id: string }>) => nodes.map((node) => node.id).sort();

  beforeAll(async () => {
    source = await createTestDataSource();
    store = new TypeOrmFlowTriggerStore(source);
    const nodes = source.getRepository(ResourceFlowNode);
    const resources = source.getRepository(Resource);
    const flows = source.getRepository(Flow);

    const [laser, drill] = await resources.save([
      resources.create({ name: 'Laser', type: ResourceType.Machine, metadata: { zone: 'A' } }),
      resources.create({ name: 'Drill', type: ResourceType.Machine }),
    ]);
    laserId = laser.id;
    drillId = drill.id;
    const [enabled, disabled, otherScope] = await flows.save([
      flows.create({ name: 'On', enabled: true, scope: 'global' }),
      flows.create({ name: 'Off', enabled: false, scope: 'global' }),
      // A future named resource flow shares the table; it must never count as global.
      flows.create({ name: 'Named', enabled: true, scope: 'resource' as never }),
    ]);
    enabledFlowId = enabled.id;
    disabledFlowId = disabled.id;

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
      node('laser-button', { resourceId: laser.id }, ResourceFlowNodeType.INPUT_BUTTON),
    ]);

    const edges = source.getRepository(ResourceFlowEdge);
    const edge = (
      id: string,
      source: string,
      target: string,
      owner: { resourceId?: number; flowId?: number },
      handle: string | null,
    ) =>
      edges.create({
        id,
        source,
        target,
        sourceHandle: handle,
        targetHandle: null,
        resourceId: owner.resourceId ?? null,
        flowId: owner.flowId ?? null,
      });
    await edges.save([
      edge('e-laser', 'laser-own', 'laser-target', { resourceId: laser.id }, 'output'),
      edge('e-drill', 'drill-own', 'drill-target', { resourceId: drill.id }, 'output'),
      edge('e-global', 'global-on', 'global-target', { flowId: enabled.id }, 'output'),
      edge('e-global-legacy', 'global-on', 'global-legacy', { flowId: enabled.id }, null),
      edge('e-global-failure', 'global-on', 'global-failure', { flowId: enabled.id }, 'failure'),
      edge('e-global-true', 'global-on', 'global-true', { flowId: enabled.id }, 'output-true'),
      // Same source id on another canvas: never followed from the enabled flow's node.
      edge('e-foreign-output', 'global-on', 'foreign', { flowId: disabled.id }, 'output'),
      edge('e-foreign-legacy', 'global-on', 'foreign', { flowId: disabled.id }, null),
      edge('e-foreign-failure', 'global-on', 'foreign', { flowId: disabled.id }, 'failure'),
    ]);
  });

  afterAll(async () => {
    await closeTestDataSource(source);
  });

  it('finds the nodes of every resource flow plus those of enabled global flows', async () => {
    expect(ids(await store.findTriggerNodes(type))).toEqual(['drill-own', 'global-on', 'laser-own']);
  });

  it("finds the resource's own nodes plus those of enabled global flows", async () => {
    expect(ids(await store.findTriggerNodesForResource(laserId, type))).toEqual(['global-on', 'laser-own']);
  });

  it('reads through the caller transaction', async () => {
    await source
      .transaction(async (manager) => {
        await manager.getRepository(ResourceFlowNode).save({
          id: 'uncommitted',
          type,
          position: { x: 0, y: 0 },
          data: {},
          resourceId: drillId,
          flowId: null,
        });
        expect(ids(await store.findTriggerNodes(type, legacyEngineTransactionScope(manager)))).toContain('uncommitted');
        expect(ids(await store.findTriggerNodes(type))).not.toContain('uncommitted');
        throw new Error('roll back');
      })
      .catch(() => undefined);
  });

  it('pages plugin trigger nodes with the same semantics in one query', async () => {
    const page = async (after: string | undefined, size: number) =>
      (await store.findPluginTriggerPage(type, after, size)).map((node) => node.id);

    expect(await page(undefined, 100)).toEqual(['drill-own', 'global-on', 'laser-own']);
    expect(await page(undefined, 2)).toEqual(['drill-own', 'global-on']);
    expect(await page('global-on', 2)).toEqual(['laser-own']);
  });

  it('finds variable trigger nodes of one resource, or of all resources, plus enabled global ones', async () => {
    const nodes = source.getRepository(ResourceFlowNode);
    const variable = ResourceFlowNodeType.INPUT_VARIABLE_CHANGED;
    await nodes.save([
      nodes.create({ id: 'var-laser', type: variable, position: { x: 0, y: 0 }, data: {}, resourceId: laserId }),
      nodes.create({ id: 'var-drill', type: variable, position: { x: 0, y: 0 }, data: {}, resourceId: drillId }),
      nodes.create({ id: 'var-global', type: variable, position: { x: 0, y: 0 }, data: {}, flowId: enabledFlowId }),
    ]);

    expect(ids(await store.findVariableTriggerNodes(laserId))).toEqual(['var-global', 'var-laser']);
    expect(ids(await store.findVariableTriggerNodes(null))).toEqual(['var-drill', 'var-global', 'var-laser']);
  });

  it('follows edges only inside the canvas of the node', async () => {
    const [laserNode] = await store
      .findTriggerNodesForResource(laserId, type)
      .then((nodes) => nodes.filter((node) => node.id === 'laser-own'));
    const [globalNode] = await store
      .findTriggerNodes(type)
      .then((nodes) => nodes.filter((node) => node.id === 'global-on'));

    expect(ids(await store.findOutgoingEdges(laserNode, 'output'))).toEqual(['e-laser']);
    expect(ids(await store.findOutgoingEdges(globalNode, 'output'))).toEqual(['e-global', 'e-global-legacy']);
    expect(ids(await store.findOutgoingEdges(globalNode, 'failure'))).toEqual(['e-global-failure']);
    expect(ids(await store.findOutgoingEdges(globalNode, 'output-true'))).toEqual(['e-global-true']);
    expect(await store.findOutgoingEdges(globalNode, 'output-false')).toEqual([]);
  });

  it('follows the edges of another canvas only from that canvas', async () => {
    const nodes = source.getRepository(ResourceFlowNode);
    const globalOn = await nodes.findOneByOrFail({ id: 'global-on' });
    const onDisabledCanvas = { ...globalOn, position: { ...globalOn.position }, flowId: disabledFlowId };

    expect(ids(await store.findOutgoingEdges(onDisabledCanvas, 'output'))).toEqual([
      'e-foreign-legacy',
      'e-foreign-output',
    ]);
    expect(ids(await store.findOutgoingEdges(onDisabledCanvas, 'failure'))).toEqual(['e-foreign-failure']);
  });

  it('finds a node on the canvas of another node and nothing on a foreign canvas', async () => {
    const nodes = source.getRepository(ResourceFlowNode);
    const laserNode = await nodes.findOneByOrFail({ id: 'laser-own' });
    const record = { ...laserNode, position: { ...laserNode.position } };

    expect((await store.findNodeOnCanvasOf(record, 'laser-button'))?.id).toBe('laser-button');
    expect(await store.findNodeOnCanvasOf(record, 'drill-own')).toBeNull();
    expect(await store.findNodeOnCanvasOf(record, 'global-on')).toBeNull();
  });

  it('finds a button only in the resource own flow', async () => {
    expect((await store.findButton(laserId, 'laser-button'))?.id).toBe('laser-button');
    expect(await store.findButton(drillId, 'laser-button')).toBeNull();
  });

  it('pairs no-activity nodes with machines that have an active session', async () => {
    const noActivity = ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY;
    const nodes = source.getRepository(ResourceFlowNode);
    await nodes.save([
      nodes.create({ id: 'idle-laser', type: noActivity, position: { x: 0, y: 0 }, data: {}, resourceId: laserId }),
      nodes.create({ id: 'idle-drill', type: noActivity, position: { x: 0, y: 0 }, data: {}, resourceId: drillId }),
      nodes.create({ id: 'idle-global', type: noActivity, position: { x: 0, y: 0 }, data: {}, flowId: enabledFlowId }),
    ]);
    expect(await store.findInactivityTargets()).toEqual([]);

    const users = source.getRepository(User);
    const user = await users.save(users.create({ username: 'u', email: 'u@example.com' } as User));
    const usages = source.getRepository(ResourceUsage);
    await usages.save(
      usages.create({
        resourceId: laserId,
        userId: user.id,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        isFinalized: true,
        lifecyclePending: false,
      } as never),
    );

    const pairs = (await store.findInactivityTargets()).map((pair) => `${pair.node.id}:${pair.resourceId}`).sort();
    expect(pairs).toEqual([`idle-global:${laserId}`, `idle-laser:${laserId}`]);
  });

  it('reads the resource a run acts on', async () => {
    expect(await store.findResource(laserId)).toEqual({
      id: laserId,
      name: 'Laser',
      type: ResourceType.Machine,
      metadata: { zone: 'A' },
      accessOnly: false,
    });
    expect((await store.findResource(drillId))?.metadata).toBeNull();
    expect(await store.findResource(999_999)).toBeNull();
  });

  it('reads only the columns a run uses, not the documentation', async () => {
    const findOne = jest.spyOn(source.manager.getRepository(Resource), 'findOne');
    await store.findResource(laserId);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true, type: true, metadata: true, accessOnly: true } }),
    );
  });
});
