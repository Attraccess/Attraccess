import { FlowNodeRecord, ResourceFlowNodeType } from '@attraccess/application-models';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { FakeFlowGraphStore, FakeFlowResourceDirectory } from './fixtures/fake-flow-graph-store.test-fixture';
import { ResourceFlowsService } from './resource-flows.service';

const testActor = { id: 7, authenticationMethod: 'session' as const };

describe('resource flow meter validation', () => {
  const resourceId = 7;
  const meterId = 13;
  const types = [
    ResourceFlowNodeType.INPUT_METERING_START,
    ResourceFlowNodeType.INPUT_METERING_COLLECT,
    ResourceFlowNodeType.OUTPUT_METERING_READY,
    ResourceFlowNodeType.OUTPUT_METERING_REPORT,
  ];

  function fixture(meterBelongsToResource: boolean) {
    const graph = new FakeFlowGraphStore();
    const directory = new FakeFlowResourceDirectory();
    directory.addResource(resourceId);
    const nodes: FlowNodeRecord[] = types.map((type, index) =>
      graph.addNode({
        id: `meter-${index}`,
        type,
        data: { meterId, value: '42' },
        position: { x: index, y: 0 },
        resourceId,
      }),
    );
    // Shared by reference: specs change the meters and nodes of the "database" in place.
    graph.nodes = nodes;
    const meters = meterBelongsToResource ? [meterId] : [];
    directory.meters.set(resourceId, meters);
    const service = new ResourceFlowsService(
      graph,
      directory,
      { subscribe: jest.fn().mockResolvedValue(undefined) } as unknown as MqttClientService,
      new EventEmitter2(),
      { record: jest.fn().mockResolvedValue({}) } as never,
    );
    return { service, nodes, directory, meters };
  }

  function expectOneMeterQuery(directory: FakeFlowResourceDirectory) {
    expect(directory.meterLookups).toBe(1);
  }

  it.each(['load', 'save'])('reports meters outside the resource during %s', async (operation) => {
    const { service, nodes, directory } = fixture(false);
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);

    expect(result.validationErrors).toEqual(
      nodes.map((node) => ({
        nodeId: node.id,
        nodeType: node.type,
        field: 'meterId',
        code: 'invalid',
        message: 'Choose a meter belonging to this resource',
      })),
    );
    expectOneMeterQuery(directory);
    // Invalid flows remain editable drafts, with the warnings returned to the editor.
    expect(result.nodes).toHaveLength(types.length);
  });

  it.each(['load', 'save'])('accepts meters belonging to the resource during %s', async (operation) => {
    const { service, nodes, directory } = fixture(true);
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);

    expect(result.validationErrors).toBeUndefined();
    expectOneMeterQuery(directory);
  });

  it.each(['load', 'save'])('checks distinct and repeated meters with one query during %s', async (operation) => {
    const { service, nodes, directory, meters } = fixture(true);
    meters.push(meterId + 1);
    nodes[1].data = { meterId: meterId + 1 };
    nodes[2].data = { meterId: meterId + 2 };
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);

    expect(result.validationErrors).toEqual([
      {
        nodeId: nodes[2].id,
        nodeType: nodes[2].type,
        field: 'meterId',
        code: 'invalid',
        message: 'Choose a meter belonging to this resource',
      },
    ]);
    expectOneMeterQuery(directory);
  });

  it.each(['load', 'save'])('refreshes meter ownership on each %s request', async (operation) => {
    const { service, nodes, directory, meters } = fixture(true);
    const run = () =>
      operation === 'load'
        ? service.getResourceFlow(resourceId)
        : service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);
    expect((await run()).validationErrors).toBeUndefined();
    meters.length = 0;

    expect((await run()).validationErrors).toHaveLength(types.length);
    expect(directory.meterLookups).toBe(2);
  });

  it.each(['load', 'save'])('skips meter queries for an empty flow during %s', async (operation) => {
    const { service, nodes, directory } = fixture(true);
    nodes.length = 0;
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);

    expect(result.validationErrors).toBeUndefined();
    expect(directory.meterLookups).toBe(0);
  });

  it.each(['load', 'save'])('skips meter queries for non-metering nodes during %s', async (operation) => {
    const { service, nodes, directory } = fixture(true);
    nodes.forEach((node) => {
      node.type = ResourceFlowNodeType.INPUT_BUTTON;
      node.data = { label: 'Start' };
    });
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);

    expect(result.validationErrors).toBeUndefined();
    expect(directory.meterLookups).toBe(0);
  });

  it.each(['load', 'save'])('skips meter queries for malformed metering data during %s', async (operation) => {
    const { service, nodes, directory } = fixture(true);
    nodes.forEach((node) => (node.data = { meterId: 0, value: '42' }));
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);

    expect(result.validationErrors).toHaveLength(types.length);
    expect(directory.meterLookups).toBe(0);
  });

  it.each(['load', 'save'])(
    'reports a failed lookup generically, without retrying per node, during %s',
    async (operation) => {
      const { service, nodes, directory } = fixture(true);
      directory.meterError = new Error('Meter lookup failed');
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const result =
        operation === 'load'
          ? await service.getResourceFlow(resourceId)
          : await service.saveResourceFlow(resourceId, { nodes, edges: [] }, testActor);

      expect(result.validationErrors).toEqual(
        nodes.map((node) => ({
          nodeId: node.id,
          nodeType: node.type,
          field: 'data',
          code: 'invalid',
          message: 'Invalid node configuration',
        })),
      );
      expectOneMeterQuery(directory);
      expect(logError).toHaveBeenCalledTimes(nodes.length);
      logError.mockRestore();
    },
  );
});
