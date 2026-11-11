import { randomUUID } from 'node:crypto';
import { MatterConnectionService } from '../connection/connection.service';
import { MatterSettingsService } from '../connection/settings.service';
import { FakeSidecar, TOKEN } from '../testing/fake-sidecar';
import { createHarness, endpoint, node, type Harness } from '../testing/devices-harness.test-utils';
import { DeviceAuditService } from './audit.service';
import { MatterEndpoint, MatterEndpointState } from './entities';
import { MatterIngestionService } from './ingestion.service';
import { MatterReconciliationService } from './reconciliation.service';
import { MatterStateService } from './state.service';

async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Matter device ingestion over a real sidecar connection', () => {
  let h: Harness;
  let fake: FakeSidecar;
  let connection: MatterConnectionService;
  let ingestion: MatterIngestionService;
  let reconciliation: MatterReconciliationService;
  let state: MatterStateService;

  const start = async (inventory: FakeSidecar['inventory']) => {
    h = await createHarness();
    fake = await FakeSidecar.start();
    fake.inventory = inventory;
    const settings = new MatterSettingsService(h.context);
    await settings.save({ url: fake.url, credential: TOKEN }, 1);
    connection = new MatterConnectionService(h.context, settings);
    state = new MatterStateService(h.context);
    reconciliation = new MatterReconciliationService(h.context, connection, new DeviceAuditService(h.context));
    ingestion = new MatterIngestionService(h.context, connection, reconciliation, state);
    ingestion.onModuleInit();
    await connection.onModuleInit();
  };
  afterEach(async () => {
    ingestion?.onModuleDestroy();
    connection?.onModuleDestroy();
    await fake?.stop();
    await h?.close();
  });

  it('reports skipped_unavailable against a sidecar without inventory, and changes nothing', async () => {
    await start(null);
    await until(async () => (await reconciliation.status()).lastResult !== null);
    expect(await reconciliation.status()).toMatchObject({
      lastResult: 'skipped_unavailable',
      lastSummary: { changeCount: 0 },
    });
    expect(fake.requests.map((r) => r.path)).not.toContain('/v1/nodes');
    expect(await h.rows('plugin_matter_nodes')).toEqual([]);
  });

  it('reconciles when connected and applies device.state and command.outcome events', async () => {
    await start({ authoritative: true, fabricId: '1', nodes: [node('5', { endpoints: [endpoint(1, [0x0006])] })] });
    await until(async () => (await reconciliation.status()).lastResult === 'applied');
    const endpointRow = await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ endpointId: 1 });
    await until(() => fake.sockets.size > 0);

    const requestId = randomUUID();
    await state.recordRequest({
      endpointRef: endpointRow.id,
      stateKey: 'onOff.onOff',
      clusterId: 6,
      commandId: 1,
      value: true,
      requestedBy: 7,
      requestId,
    });
    fake.broadcast(
      fake.commandOutcome({
        requestId,
        outcome: 'accepted',
        acceptedAt: new Date().toISOString(),
        reportedAt: null,
        nodeId: '5',
        endpointId: 1,
      }),
    );
    fake.broadcast(
      fake.deviceState({
        nodeId: '5',
        endpointId: 1,
        clusterId: 6,
        attributeId: 0,
        value: true,
        observedAt: new Date(Date.now() + 1_000).toISOString(),
        source: 'subscription_report',
      }),
    );
    // A payload that does not match its type is dropped by the contract check, not applied.
    fake.broadcast(fake.deviceState({ nodeId: '5' }));
    await until(async () => (await h.dataSource.getRepository(MatterEndpointState).count()) === 1);
    await ingestion.idle();
    const [entry] = await state.read(endpointRow.id, Date.now() + 2_000);
    expect(entry).toMatchObject({ command: { state: 'reported' }, confirmed: true, reported: { value: true } });
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.actions()).toEqual(['matter.node_quarantined']);
  });

  it('reconciles again when the sidecar asks for it', async () => {
    await start({ authoritative: true, fabricId: '1', nodes: [node('5')] });
    await until(async () => (await reconciliation.status()).lastResult === 'applied');
    fake.inventory = { authoritative: true, fabricId: '1', nodes: [node('5'), node('6')] };
    // A dropped stream reconnects, and every reconnect reconciles.
    fake.killSockets();
    await until(async () => (await h.dataSource.getRepository('plugin_matter_nodes').count()) === 2, 10_000);
  });
});
