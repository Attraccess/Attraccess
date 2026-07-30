// Covers the pairing state machine: which join it latches onto, when it gives
// up, and what it writes to the registry. The gateway and the device RPC are
// both faked — no broker and no hardware involved.
import { ZigbeePairingService, PairingInProgressError, friendlyNameFor } from './zigbee-pairing.service';
import type { Z2mBridgeEvent, Z2mGatewayService } from './z2m-gateway.service';
import type { DeviceRegistryService } from './device-registry.service';
import type { ShellyDeviceApiService } from './shelly-device-api.service';
import type { ShellyDevice } from './shelly-device.entity';

const NEW_IEEE = '0x90fd9ffffe6494fc';
const KNOWN_IEEE = '0x00158d00018255df';

function makeGateway(knownIeeeAddresses: string[] = []) {
  const handlers: ((event: Z2mBridgeEvent) => void)[] = [];
  return {
    listDevices: jest.fn(() => knownIeeeAddresses.map((ieee_address) => ({ ieee_address, friendly_name: ieee_address }))),
    onBridgeEvent: jest.fn((handler: (event: Z2mBridgeEvent) => void) => {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    }),
    permitJoin: jest.fn(async () => undefined),
    renameDevice: jest.fn(async () => undefined),
    removeDevice: jest.fn(async () => undefined),
    refreshDevices: jest.fn(async () => undefined),
    emit: (event: Z2mBridgeEvent) => handlers.slice().forEach((handler) => handler(event)),
    get listenerCount() {
      return handlers.length;
    },
  };
}

function makeDeviceApi(overrides: { enabled?: boolean } = {}) {
  return {
    getZigbeeStatus: jest.fn(async () => ({ enabled: overrides.enabled ?? true, networkState: 'disabled' as const })),
    enableZigbee: jest.fn(async () => ({ restartRequired: false })),
    startNetworkSteering: jest.fn(async () => undefined),
  };
}

function makeRegistry() {
  return {
    linkZigbeeDevice: jest.fn(async () => undefined),
    unlinkZigbeeDevice: jest.fn(async () => undefined),
  };
}

const DEVICE = { id: 7, ipAddress: '192.168.1.40', generation: 2 } as ShellyDevice & { generation: number };

function build(gateway: ReturnType<typeof makeGateway>, deviceApi: ReturnType<typeof makeDeviceApi>, registry = makeRegistry()) {
  const service = new ZigbeePairingService(
    gateway as unknown as Z2mGatewayService,
    registry as unknown as DeviceRegistryService,
    deviceApi as unknown as ShellyDeviceApiService
  );
  return { service, registry };
}

/** Lets the pending promise chain inside start() advance. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function waitForJob(service: ZigbeePairingService, deviceId: number, predicate: (job: NonNullable<ReturnType<ZigbeePairingService['getJob']>>) => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const job = service.getJob(deviceId);
    if (job && predicate(job)) return job;
    await settle();
  }
  throw new Error(`job never reached the expected state (last: ${JSON.stringify(service.getJob(deviceId))})`);
}

describe('ZigbeePairingService.start', () => {
  it('links the device that joins and renames it to a stable Attraccess name', async () => {
    const gateway = makeGateway();
    const { service, registry } = build(gateway, makeDeviceApi());

    service.start(DEVICE, {});
    await waitForJob(service, DEVICE.id, (job) => job.step === 'waiting-for-join');

    gateway.emit({ type: 'device_joined', data: { ieee_address: NEW_IEEE } });
    gateway.emit({ type: 'device_interview', data: { ieee_address: NEW_IEEE, status: 'successful' } });

    const job = await waitForJob(service, DEVICE.id, (j) => j.status === 'succeeded');
    expect(job.ieeeAddress).toBe(NEW_IEEE);
    expect(job.friendlyName).toBe(friendlyNameFor(DEVICE.id));
    expect(gateway.renameDevice).toHaveBeenCalledWith(NEW_IEEE, 'attraccess-shelly-7');
    expect(registry.linkZigbeeDevice).toHaveBeenCalledWith(DEVICE.id, {
      ieeeAddress: NEW_IEEE,
      friendlyName: 'attraccess-shelly-7',
    });
  });

  it('opens the join window before steering, and closes it again when done', async () => {
    const gateway = makeGateway();
    const deviceApi = makeDeviceApi();
    const { service } = build(gateway, deviceApi);

    service.start(DEVICE, {});
    await waitForJob(service, DEVICE.id, (job) => job.step === 'waiting-for-join');

    expect(gateway.permitJoin).toHaveBeenCalledWith(254);
    expect(deviceApi.startNetworkSteering).toHaveBeenCalled();

    gateway.emit({ type: 'device_interview', data: { ieee_address: NEW_IEEE, status: 'successful' } });
    await waitForJob(service, DEVICE.id, (job) => job.status === 'succeeded');

    expect(gateway.permitJoin).toHaveBeenLastCalledWith(0);
  });

  it('ignores devices the gateway already knew about', async () => {
    const gateway = makeGateway([KNOWN_IEEE]);
    const { service, registry } = build(gateway, makeDeviceApi());

    service.start(DEVICE, {});
    await waitForJob(service, DEVICE.id, (job) => job.step === 'waiting-for-join');

    gateway.emit({ type: 'device_interview', data: { ieee_address: KNOWN_IEEE, status: 'successful' } });
    await settle();

    expect(service.getJob(DEVICE.id)?.status).toBe('running');
    expect(registry.linkZigbeeDevice).not.toHaveBeenCalled();
  });

  it('switches the radio on first when the device reports Zigbee disabled', async () => {
    const gateway = makeGateway();
    const deviceApi = makeDeviceApi({ enabled: false });
    const { service } = build(gateway, deviceApi);

    service.start(DEVICE, {});
    await waitForJob(service, DEVICE.id, (job) => job.step === 'waiting-for-join');

    expect(deviceApi.enableZigbee).toHaveBeenCalled();
  });

  it('fails the job when the interview fails, and still closes the join window', async () => {
    const gateway = makeGateway();
    const { service } = build(gateway, makeDeviceApi());

    service.start(DEVICE, {});
    await waitForJob(service, DEVICE.id, (job) => job.step === 'waiting-for-join');

    gateway.emit({ type: 'device_joined', data: { ieee_address: NEW_IEEE } });
    gateway.emit({ type: 'device_interview', data: { ieee_address: NEW_IEEE, status: 'failed' } });

    const job = await waitForJob(service, DEVICE.id, (j) => j.status === 'failed');
    expect(job.error).toMatch(/could not interview/);
    expect(gateway.permitJoin).toHaveBeenLastCalledWith(0);
    // The listener must be gone, or a later join would resolve a dead promise.
    expect(gateway.listenerCount).toBe(0);
  });

  it('refuses a second concurrent run — permit_join is network-wide', async () => {
    const gateway = makeGateway();
    const { service } = build(gateway, makeDeviceApi());

    service.start(DEVICE, {});
    await waitForJob(service, DEVICE.id, (job) => job.step === 'waiting-for-join');

    expect(() => service.start({ ...DEVICE, id: 8 }, {})).toThrow(PairingInProgressError);
  });

  it('surfaces a device that refuses to steer as a failed job', async () => {
    const gateway = makeGateway();
    const deviceApi = makeDeviceApi();
    deviceApi.startNetworkSteering.mockRejectedValue(new Error('HTTP 401'));
    const { service } = build(gateway, deviceApi);

    service.start(DEVICE, {});

    const job = await waitForJob(service, DEVICE.id, (j) => j.status === 'failed');
    expect(job.error).toContain('HTTP 401');
  });
});

describe('ZigbeePairingService.unpair', () => {
  const paired = { ...DEVICE, zigbeeIeeeAddress: NEW_IEEE } as ShellyDevice;

  it('removes the device from z2m and clears the link', async () => {
    const gateway = makeGateway();
    const { service, registry } = build(gateway, makeDeviceApi());

    await service.unpair(paired);

    expect(gateway.removeDevice).toHaveBeenCalledWith(NEW_IEEE);
    expect(registry.unlinkZigbeeDevice).toHaveBeenCalledWith(DEVICE.id);
  });

  it('falls back to a forced removal so an unplugged device is still deletable', async () => {
    const gateway = makeGateway();
    gateway.removeDevice.mockRejectedValueOnce(new Error('mgmtLeaveRsp after 10000ms'));
    const { service, registry } = build(gateway, makeDeviceApi());

    await service.unpair(paired);

    expect(gateway.removeDevice).toHaveBeenLastCalledWith(NEW_IEEE, { force: true });
    expect(registry.unlinkZigbeeDevice).toHaveBeenCalledWith(DEVICE.id);
  });

  it('still unlinks when the gateway cannot remove the device at all', async () => {
    const gateway = makeGateway();
    gateway.removeDevice.mockRejectedValue(new Error("Device '0x…' does not exist"));
    const { service, registry } = build(gateway, makeDeviceApi());

    // Otherwise a device removed from the z2m frontend could never be unpaired.
    await expect(service.unpair(paired)).resolves.toBeUndefined();
    expect(registry.unlinkZigbeeDevice).toHaveBeenCalledWith(DEVICE.id);
  });

  it('does nothing for a device that was never paired', async () => {
    const gateway = makeGateway();
    const { service, registry } = build(gateway, makeDeviceApi());

    await service.unpair({ ...DEVICE, zigbeeIeeeAddress: null } as ShellyDevice);

    expect(gateway.removeDevice).not.toHaveBeenCalled();
    expect(registry.unlinkZigbeeDevice).not.toHaveBeenCalled();
  });
});
