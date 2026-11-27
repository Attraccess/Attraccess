import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { ClusterService } from '../../../../cluster/cluster.service';
import { AttractapEventType } from '../../websocket.types';
import {
  ADDRESS,
  BleNode,
  connectRequest,
  createRadio,
  EVENTS,
  INFO,
  scanRequest,
  SERVICE,
  SLOW,
  waitFor,
  watchRecorder,
} from './__test__/cluster-ble.test-fixture';

jest.setTimeout(90_000);

const FAST = { heartbeatEveryMs: 200, sweepEveryMs: 200, deadlineSweepEveryMs: 50 };
const ref = (characteristicUuid: string) => ({
  serviceUuid: SERVICE,
  characteristicUuid,
  signal: new AbortController().signal,
});

/** Plugin BLE on instance B through a reader whose websocket instance A holds, over a real Valkey (ATT-1163). */
describe('plugin BLE across API instances against Valkey (ATT-1163)', () => {
  let container: StartedTestContainer;
  const clients: Redis[] = [];
  const clusters: ClusterService[] = [];
  const nodes: BleNode[] = [];
  let radio: ReturnType<typeof createRadio>;

  const client = () => {
    const created = new Redis(container.getMappedPort(6379), container.getHost());
    clients.push(created);
    return created;
  };
  const node = async (name: string) => {
    const cluster = new ClusterService(client(), { instanceName: name, timing: FAST });
    cluster.onModuleInit();
    clusters.push(cluster);
    await cluster.whenReady();
    const created = new BleNode(name, cluster, radio);
    nodes.push(created);
    return created;
  };
  /** A and B, with the reader signed in on A and known to B. */
  const readerOnA = async () => {
    const a = await node('a');
    const b = await node('b');
    a.connectReader();
    await waitFor(async () => (await b.cluster.presence.holders(1))[0]?.instanceId === a.cluster.instanceId);
    return { a, b };
  };

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:9-alpine').withExposedPorts(6379).start();
  });

  beforeEach(() => {
    radio = createRadio();
  });

  afterEach(async () => {
    nodes.splice(0).forEach((created) => created.dispose());
    await Promise.all(clusters.splice(0).map((cluster) => cluster.onApplicationShutdown()));
    clients.splice(0).forEach((created) => created.disconnect());
    const admin = new Redis(container.getMappedPort(6379), container.getHost());
    await admin.flushall();
    admin.disconnect();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('scans and runs a session on B through the reader held by A', async () => {
    const { a, b } = await readerOnA();
    await expect(b.driver.readerStatus(1)).resolves.toEqual({ status: 'available' });
    const found = await b.driver.scan(scanRequest());
    expect(found).toEqual([
      expect.objectContaining({ address: ADDRESS, manufacturerData: [{ companyId: 7, data: Uint8Array.of(9) }] }),
    ]);

    const link = await b.driver.connect(connectRequest());
    await expect(link.read(ref(INFO))).resolves.toEqual(Uint8Array.of(1, 2, 3));
    await link.write({ ...ref(INFO), value: Uint8Array.of(4), withoutResponse: false });
    await expect(link.read(ref(INFO))).resolves.toEqual(Uint8Array.of(4));
    const notifications: Uint8Array[] = [];
    await link.subscribe({ ...ref(EVENTS), indicate: false, onNotification: (value) => notifications.push(value) });
    radio.notify(ADDRESS, 'fff2', Uint8Array.of(1));
    radio.notify(ADDRESS, 'fff2', Uint8Array.of(2));
    await waitFor(() => notifications.length === 2);
    expect(notifications).toEqual([Uint8Array.of(1), Uint8Array.of(2)]);
    await link.disconnect();
    expect(a.sent(AttractapEventType.BLE_SESSION_CLOSE)).toHaveLength(1);
    expect(a.driver.router?.counts.served).toBe(0);
  });

  it('routes advertisement watch events back to B with its own filter ids', async () => {
    const { a, b } = await readerOnA();
    const onB = watchRecorder();
    b.driver.setWatch({
      readerId: 1,
      filters: [{ id: 11, serviceUuids: [SERVICE], manufacturerIds: [] }],
      keepaliveMs: 30_000,
      listener: onB.listener,
    });
    await waitFor(() => onB.last()?.status === 'watching');
    a.firmware().advertise({ address: ADDRESS, addressType: 'public', serviceUuids: [SERVICE], manufacturerData: [] });
    await waitFor(() => onB.events.length === 1);
    expect(onB.events[0]).toMatchObject({ address: ADDRESS, filterIds: [11], changed: true });
  });

  it('answers READER_OFFLINE and READER_BUSY cluster-wide', async () => {
    const a = await node('a');
    const b = await node('b');
    await expect(b.driver.scan(scanRequest())).rejects.toMatchObject({ code: 'READER_OFFLINE' });
    await expect(b.driver.readerStatus(1)).resolves.toEqual({ status: 'offline' });

    a.connectReader();
    await waitFor(async () => (await b.cluster.presence.holders(1)).length === 1);
    const local = await a.driver.connect(connectRequest(new AbortController().signal, 'local'));
    await expect(b.driver.connect(connectRequest())).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'session' });
    await local.disconnect();
  });

  it('fails pending calls with DISCONNECTED reader-link-lost when A stops', async () => {
    const { a, b } = await readerOnA();
    const link = await b.driver.connect(connectRequest());
    const lost: Array<string | undefined> = [];
    link.onDisconnected((detail) => lost.push(detail));
    const pending = link.read(ref(SLOW)).catch((error: unknown) => error);
    await waitFor(() => a.sent(AttractapEventType.BLE_READ).length === 1);

    a.cluster.halt();
    await client().del(`attraccess:cluster:alive:${a.cluster.instanceId}`);
    await expect(pending).resolves.toMatchObject({ code: 'DISCONNECTED', detail: 'reader-link-lost' });
    expect(lost).toEqual(['reader-link-lost']);
    // Nobody holds the reader any more.
    await expect(b.driver.scan(scanRequest())).rejects.toMatchObject({ code: 'READER_OFFLINE' });
  });
});
