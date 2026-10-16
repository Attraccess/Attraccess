import { MESSAGE_LIMITS } from '../../../../shared/protocol-limits';
import { MemoryDeviceAdapter } from '../../io/adapters';
import { WagoRuntime, hash, type RuntimeState } from '../../runtime';
import { snapshot } from '../../runtime.test-utils';

it('counts runtime parsing, structure and validation drops separately without changing accepted state or outputs', async () => {
  const state: RuntimeState = {
    accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
    credentials: { username: 'fixture', password: 'secret', credentialEpoch: 'epoch-1' },
    outputs: {},
    commandIds: [],
  };
  const store = { load: jest.fn(async () => state), save: jest.fn(async () => undefined) };
  const transport = {
    publish: jest.fn(async (_topic: string, _payload: unknown) => undefined),
    subscribe: jest.fn(async () => undefined),
  };
  const device = new MemoryDeviceAdapter();
  const runtime = new WagoRuntime({
    hardwareId: 'fixture',
    prefix: 'fixture',
    pairingCode: 'fixture',
    store,
    transport,
    device,
    reconnectCredentials: async () => undefined,
  });
  await runtime.start();
  const before = structuredClone(state);
  store.save.mockClear();
  transport.publish.mockClear();
  const write = jest.spyOn(device, 'write');
  const receivers = [
    runtime.receiveCommand.bind(runtime),
    runtime.receiveDesired.bind(runtime),
    runtime.receiveDiscoveryClaim.bind(runtime),
    runtime.receiveCredentialRotation.bind(runtime),
  ];
  for (const receive of receivers) {
    await receive(Buffer.from('{invalid'));
    await receive(Buffer.from(JSON.stringify({ secret: 'x'.repeat(MESSAGE_LIMITS.stringLength + 1) })));
    await receive(Buffer.from('{}'));
  }
  expect(runtime.messageStatistics).toEqual({
    pending: 0,
    rejected: 0,
    runtimeRejected: { parsing: 4, structure: 4, validation: 4 },
  });
  expect(state).toEqual(before);
  expect(store.save).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  // Only desired configuration failures retain their existing rejection reports.
  expect(transport.publish).toHaveBeenCalledTimes(2);
  expect(transport.publish.mock.calls.every(([topic]) => topic.endsWith('/configuration/reported'))).toBe(true);
  // Statistics are snapshots, and byte admission is a separate processing boundary.
  runtime.messageStatistics.runtimeRejected.parsing = 0;
  await runtime.receiveCommand(Buffer.alloc(MESSAGE_LIMITS.controlBytes + 1));
  expect(runtime.messageStatistics).toEqual({
    pending: 0,
    rejected: 1,
    runtimeRejected: { parsing: 4, structure: 4, validation: 4 },
  });
});
