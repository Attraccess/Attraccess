import {
  entities,
  Flow,
  Resource,
  ResourceFlowNode,
  ResourceType,
  type PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { DataSource } from 'typeorm';
import { WagoCommandHandler } from './commands/handler';
import { configurationFlowImpacts } from './configuration/flow-references';
import type { WagoConfigurationSnapshot } from './configuration/model';
import { WagoConfigurationRevision } from './configuration/revision.entity';
import { WagoController } from './controllers/entity';
import type { WagoService } from './controllers/service';
import { WagoDiagnosticsService } from './diagnostics/service';
import { WagoDiagnosticsStore } from './diagnostics/store';
import plugin from './plugin';

// The same channel lookups as the unit specs, but against real SQL: NULL owner columns and the joined flow name.
describe('global-flow references in a real database', () => {
  let dataSource: DataSource;
  let resourceId: number;
  let flowId: number;
  let otherFlowId: number;

  class ReferenceProbe extends WagoCommandHandler {
    list(resource: number | null, flow: number | null) {
      return this.references(1, 'lock', resource, flow);
    }
  }
  const probe = () =>
    new ReferenceProbe({ context: { dataSource } as unknown as PluginContext } as ConstructorParameters<
      typeof WagoCommandHandler
    >[0]);

  const command = (id: string, owner: { resourceId: number } | { flowId: number }) =>
    Object.assign(new ResourceFlowNode(), {
      id,
      type: 'plugin.wago.command',
      position: { x: 0, y: 0 },
      data: { controllerId: 1, channelId: 'lock' },
      resourceId: null,
      flowId: null,
      ...owner,
    });

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [...Object.values(entities).filter((value) => typeof value === 'function'), ...plugin.entities],
      synchronize: true,
    });
    await dataSource.initialize();
    resourceId = (
      await dataSource.getRepository(Resource).save({ name: 'Lathe', type: ResourceType.Machine } as Resource)
    ).id;
    flowId = (await dataSource.getRepository(Flow).save({ name: 'Power off all' } as Flow)).id;
    otherFlowId = (await dataSource.getRepository(Flow).save({ name: 'Night mode' } as Flow)).id;
    await dataSource
      .getRepository(ResourceFlowNode)
      .save([
        command('resource-node', { resourceId }),
        command('global-node', { flowId }),
        command('night-node', { flowId: otherFlowId }),
      ]);
  });

  afterAll(() => dataSource.destroy());

  it('names the global flows that share a channel in the resource diagnostics', async () => {
    const now = new Date().toISOString();
    const controller = await dataSource.getRepository(WagoController).save({
      hardwareId: 'db-fixture',
      trustState: 'claimed',
      name: 'Workshop',
      mqttServerId: 1,
      pairingCodeHash: 'fixture',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '[]',
      lastSequence: 0,
      lastHeartbeatAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(controller.id).toBe(1);
    await dataSource.getRepository(WagoConfigurationRevision).save({
      controllerId: controller.id,
      revision: 1,
      contentHash: 'a'.repeat(64),
      snapshot: JSON.stringify({ version: 1, physicalPoints: [], logicalChannels: [] }),
      state: 'applied',
      publishedAt: now,
    });
    const context = {
      dataSource,
      getRepository: (entity: Parameters<DataSource['getRepository']>[0]) => dataSource.getRepository(entity),
    } as unknown as PluginContext;
    const service = new WagoDiagnosticsService(context, {
      diagnostics: new WagoDiagnosticsStore(),
    } as unknown as WagoService);
    const diagnostics = await service.getResource(resourceId);

    const [reference] = diagnostics.controllers[0].references;
    expect(reference).toMatchObject({ nodeId: 'resource-node', flowId: null, conflict: true });
    expect([...reference.conflictFlows].sort((a, b) => a.id - b.id)).toEqual([
      { id: flowId, name: 'Power off all' },
      { id: otherFlowId, name: 'Night mode' },
    ]);

    // The plugin-wide list of the controller shows every reference, global ones by name.
    const references = (await service.get(controller.id)).references;
    expect(references.find((item) => item.nodeId === 'global-node')).toMatchObject({
      flowId,
      flowName: 'Power off all',
      href: '/devices/flows/' + flowId + '?node=global-node',
    });
  });

  it('shows a resource flow the global flows on its channel, by name', async () => {
    expect((await probe().list(resourceId, null)).sort()).toEqual([
      'global flow "Night mode" / node night-node',
      'global flow "Power off all" / node global-node',
    ]);
  });

  it('shows a global flow the resource flows and other global flows, but not itself', async () => {
    expect((await probe().list(null, flowId)).sort()).toEqual([
      'global flow "Night mode" / node night-node',
      `resource ${resourceId} / node resource-node`,
    ]);
  });

  it('lists global-flow nodes with their name in the publication impacts', async () => {
    const snapshot = { version: 1, physicalPoints: [], logicalChannels: [] } as unknown as WagoConfigurationSnapshot;
    const [impact] = await configurationFlowImpacts({ dataSource } as unknown as PluginContext, 1, snapshot, snapshot);
    expect(impact.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'resource-node', resourceId, flowId: null, flowName: null }),
        expect.objectContaining({ nodeId: 'global-node', resourceId: null, flowId, flowName: 'Power off all' }),
      ]),
    );
  });
});
