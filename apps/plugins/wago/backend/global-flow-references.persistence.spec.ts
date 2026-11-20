import {
  type PluginContext,
  type PluginFlowNodeQuery,
  type PluginFlowNodeReference,
} from '@attraccess/plugins-backend-sdk';
import { flowNode, hostDataWithFlows } from './persistence.test-utils';
import { WagoCommandHandler } from './commands/handler';
import { configurationFlowImpacts } from './configuration/flow-references';
import type { WagoConfigurationSnapshot } from './configuration/model';
import type { WagoService } from './controllers/service';
import { WagoDiagnosticsService } from './diagnostics/service';
import { WagoDiagnosticsStore } from './diagnostics/store';
import { createWagoTestStorage, type WagoTestStorage } from './storage/testing';

/** The host lookup semantics (ownership with NULL owners, data matches), over seeded nodes. */
function matching(nodes: PluginFlowNodeReference[]) {
  return (query: PluginFlowNodeQuery) =>
    nodes.filter(
      (node) =>
        (query.type === undefined || node.type === query.type) &&
        (query.typePrefix === undefined || node.type.startsWith(query.typePrefix)) &&
        Object.entries(query.dataEquals ?? {}).every(([key, value]) => node.data[key] === value) &&
        (query.resourceId === undefined || node.resourceId === query.resourceId) &&
        (query.excludeResourceId === undefined || node.resourceId !== query.excludeResourceId) &&
        (query.excludeFlowId === undefined || node.flowId !== query.excludeFlowId),
    );
}

// The channel lookups against the plugin's tables (in-memory storage) and a host lookup with the real owner semantics:
// NULL owner columns and the joined flow name. The host lookup's SQL itself is covered by the host adapter's persistence spec.
describe('global-flow references over the plugin storage', () => {
  let test: WagoTestStorage;
  let resourceId: number;
  let flowId: number;
  let otherFlowId: number;

  class ReferenceProbe extends WagoCommandHandler {
    list(resource: number | null, flow: number | null) {
      return this.references(1, 'lock', resource, flow);
    }
  }
  let hostContext: PluginContext;
  const probe = () =>
    new ReferenceProbe({ context: hostContext } as ConstructorParameters<typeof WagoCommandHandler>[0]);

  const command = (
    id: string,
    owner: { resourceId: number; resourceName: string } | { flowId: number; flowName: string },
  ) => flowNode({ id, type: 'plugin.wago.command', data: { controllerId: 1, channelId: 'lock' }, ...owner });

  beforeAll(async () => {
    test = createWagoTestStorage();
    resourceId = 1;
    flowId = 8;
    otherFlowId = 9;
    const nodes = [
      command('resource-node', { resourceId, resourceName: 'Lathe' }),
      command('global-node', { flowId, flowName: 'Power off all' }),
      command('night-node', { flowId: otherFlowId, flowName: 'Night mode' }),
    ];
    hostContext = {
      hostData: hostDataWithFlows(matching(nodes)),
      storage: test.storage,
      persistence: test.persistence,
    } as unknown as PluginContext;
  });

  it('names the global flows that share a channel in the resource diagnostics', async () => {
    const now = new Date().toISOString();
    const controller = await test.tables.controllers.insert({
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
    await test.tables.configurationRevisions.insert({
      controllerId: controller.id,
      revision: 1,
      contentHash: 'a'.repeat(64),
      snapshot: JSON.stringify({ version: 1, physicalPoints: [], logicalChannels: [] }),
      state: 'applied',
      publishedAt: now,
    });
    const service = new WagoDiagnosticsService(hostContext, {
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
    const [impact] = await configurationFlowImpacts(hostContext, 1, snapshot, snapshot);
    expect(impact.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'resource-node', resourceId, flowId: null, flowName: null }),
        expect.objectContaining({ nodeId: 'global-node', resourceId: null, flowId, flowName: 'Power off all' }),
      ]),
    );
  });
});
