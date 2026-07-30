// Covers the message-handling half of the z2m gateway: what the service learns
// from the retained bridge topics, and how it correlates request/response.
// The MQTT client itself is stubbed — the interesting logic is topic parsing.
import { Z2mGatewayService, type Z2mBridgeEvent } from './z2m-gateway.service';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';

const BASE = 'zigbee2mqtt';

interface PublishedMessage {
  topic: string;
  payload: string;
}

function build() {
  const published: PublishedMessage[] = [];
  const service = new Z2mGatewayService({} as unknown as PluginContext);

  // Stand in for a live connection: record publishes and answer nothing, so
  // tests drive responses by hand through onMessage().
  const subscriptions: string[] = [];
  const unsubscriptions: string[] = [];
  const fakeClient = {
    connected: true,
    publishAsync: async (topic: string, payload: string) => {
      published.push({ topic, payload });
    },
    subscribeAsync: async (topic: string) => {
      subscriptions.push(topic);
    },
    unsubscribeAsync: async (topic: string) => {
      unsubscriptions.push(topic);
    },
  };
  const internals = service as unknown as {
    client: unknown;
    connectedTo: { mqttServerId: number; baseTopic: string };
    ensureConnected: () => Promise<unknown>;
  };
  internals.client = fakeClient;
  internals.connectedTo = { mqttServerId: 1, baseTopic: BASE };
  internals.ensureConnected = async () => fakeClient;

  const send = (topic: string, body: unknown) =>
    service.onMessage(BASE, `${BASE}/${topic}`, typeof body === 'string' ? body : JSON.stringify(body));

  /**
   * A request publishes only after awaiting the connection, so tests have to let
   * the microtask queue drain before inspecting what went out.
   */
  const nextPublished = async (): Promise<PublishedMessage> => {
    for (let attempt = 0; attempt < 20 && published.length === 0; attempt++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    if (published.length === 0) throw new Error('nothing was published');
    return published[0];
  };

  return { service, published, send, nextPublished, subscriptions, unsubscriptions };
}

const DEVICE = {
  ieee_address: '0x90fd9ffffe6494fc',
  friendly_name: 'attraccess-shelly-7',
  type: 'Router',
  supported: true,
  model_id: '1PM',
  interview_state: 'SUCCESSFUL' as const,
  definition: { model: 'S4SW-001P16EU', vendor: 'Shelly' },
};

describe('Z2mGatewayService message handling', () => {
  it('tracks the bridge online state', () => {
    const { service, send } = build();
    const internals = service as unknown as { bridgeOnline: boolean };

    send('bridge/state', { state: 'online' });
    expect(internals.bridgeOnline).toBe(true);

    send('bridge/state', { state: 'offline' });
    expect(internals.bridgeOnline).toBe(false);
  });

  it('reads permit-join state from bridge/info, including the 2.x permit_join_end field', () => {
    const { service, send } = build();
    const internals = service as unknown as {
      permitJoinState: { permitJoin: boolean; permitJoinEnd: number | null };
    };

    send('bridge/info', { permit_join: true, permit_join_end: 1733666394 });

    expect(internals.permitJoinState).toEqual({ permitJoin: true, permitJoinEnd: 1733666394 });
  });

  it('caches the device inventory and skips the coordinator', () => {
    const { service, send } = build();

    send('bridge/devices', [DEVICE, { ieee_address: '0xcoordinator', friendly_name: 'Coordinator', type: 'Coordinator' }]);

    expect(service.listDevices()).toEqual([DEVICE]);
    expect(service.findByIeee(DEVICE.ieee_address)).toEqual(DEVICE);
    expect(service.findByIeee('0xdoesnotexist')).toBeNull();
  });

  it('files device state under the IEEE address, resolved from the friendly name', () => {
    const { service, send } = build();
    send('bridge/devices', [DEVICE]);

    send(DEVICE.friendly_name, { state: 'ON', power: 12.5 });

    expect(service.getState(DEVICE.ieee_address)).toEqual({ state: 'ON', power: 12.5 });
  });

  it('ignores state for devices the gateway inventory does not know', () => {
    const { service, send } = build();
    send('some-other-device', { state: 'ON' });
    expect(service.getState('0xunknown')).toBeNull();
  });

  it('forwards bridge events to subscribers until they unsubscribe', () => {
    const { service, send } = build();
    const seen: Z2mBridgeEvent[] = [];
    const unsubscribe = service.onBridgeEvent((event) => seen.push(event));

    send('bridge/event', { type: 'device_joined', data: { ieee_address: DEVICE.ieee_address } });
    unsubscribe();
    send('bridge/event', { type: 'device_leave', data: { ieee_address: DEVICE.ieee_address } });

    expect(seen).toEqual([{ type: 'device_joined', data: { ieee_address: DEVICE.ieee_address } }]);
  });

  it('survives a non-JSON payload instead of throwing out of the message handler', () => {
    const { service, send } = build();
    expect(() => send('bridge/state', 'online')).not.toThrow();
    expect((service as unknown as { bridgeOnline: boolean }).bridgeOnline).toBe(true);
  });

  it('ignores topics outside the configured base topic', () => {
    const { service } = build();
    service.onMessage(BASE, 'someoneelse/bridge/devices', JSON.stringify([DEVICE]));
    expect(service.listDevices()).toEqual([]);
  });
});

describe('Z2mGatewayService requests', () => {
  it('clamps permit_join to the 254s ceiling z2m 2.x enforces and resolves on the response', async () => {
    const { service, send, nextPublished } = build();

    const pending = service.permitJoin(9999);
    const message = await nextPublished();
    const request = JSON.parse(message.payload) as { time: number; transaction: string };

    expect(message.topic).toBe(`${BASE}/bridge/request/permit_join`);
    expect(request.time).toBe(254);

    send('bridge/response/permit_join', { data: { time: 254 }, status: 'ok', transaction: request.transaction });
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects with the reason z2m gave when a request fails', async () => {
    const { service, send, nextPublished } = build();

    const pending = service.removeDevice(DEVICE.ieee_address);
    const request = JSON.parse((await nextPublished()).payload) as { id: string; force: boolean; transaction: string };
    expect(request).toMatchObject({ id: DEVICE.ieee_address, force: false });

    send('bridge/response/device/remove', {
      data: {},
      status: 'error',
      error: 'Failed to remove dimmer (Error: mgmtLeaveRsp after 10000ms)',
      transaction: request.transaction,
    });

    await expect(pending).rejects.toThrow('mgmtLeaveRsp after 10000ms');
  });

  it('ignores responses carrying somebody else’s transaction id', async () => {
    const { service, send, nextPublished } = build();

    const pending = service.renameDevice(DEVICE.ieee_address, 'attraccess-shelly-7');
    const request = JSON.parse((await nextPublished()).payload) as { transaction: string };

    send('bridge/response/device/rename', { data: {}, status: 'ok', transaction: 'someone-else' });

    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    send('bridge/response/device/rename', { data: {}, status: 'ok', transaction: request.transaction });
    await expect(pending).resolves.toBeUndefined();
  });

  it('resyncs the inventory by re-subscribing, since bridge/devices is retained', async () => {
    const { service, subscriptions, unsubscriptions } = build();

    await service.refreshDevices();

    // A push can be missed (reconnect, or a broker that mishandles retained
    // delivery), so re-subscribing is how we get the authoritative list back.
    expect(unsubscriptions).toEqual([`${BASE}/bridge/devices`]);
    expect(subscriptions).toEqual([`${BASE}/bridge/devices`]);
  });

  it('addresses control topics by IEEE address rather than friendly name', async () => {
    const { service, published } = build();

    await service.setState(DEVICE.ieee_address, { state: 'TOGGLE' });

    expect(published[0]).toEqual({
      topic: `${BASE}/${DEVICE.ieee_address}/set`,
      payload: JSON.stringify({ state: 'TOGGLE' }),
    });
  });
});
