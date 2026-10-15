import { MESSAGE_LIMITS } from '../../../../shared/protocol-limits';
import { MemoryDeviceAdapter } from '../../io/adapters';
import { WagoRuntime, hash, type RuntimeState } from '../../runtime';
import { snapshot, validCommand } from '../../runtime.test-utils';

describe('runtime wire admission', () => {
  it('drops excessive messages without loading, saving, publishing or writing', async () => {
    const store = { load: jest.fn(), save: jest.fn() };
    const transport = { publish: jest.fn(), subscribe: jest.fn() };
    const device = new MemoryDeviceAdapter();
    const runtime = new WagoRuntime({
      hardwareId: 'fixture',
      prefix: 'fixture',
      pairingCode: 'fixture',
      store,
      transport,
      device,
    });
    await runtime.receiveDiscoveryClaim(Buffer.alloc(MESSAGE_LIMITS.controlBytes + 1));
    await runtime.receiveCredentialRotation(Buffer.alloc(MESSAGE_LIMITS.controlBytes + 1));
    await runtime.receiveDesired(Buffer.alloc(MESSAGE_LIMITS.configurationBytes + 1));
    await runtime.receiveCommand(Buffer.alloc(MESSAGE_LIMITS.controlBytes + 1));
    expect(store.load).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(transport.publish).not.toHaveBeenCalled();
  });

  it('bounds commands before persistence and does not execute rejected commands later', async () => {
    let state: RuntimeState = {
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
      outputs: {},
      commandIds: [],
    };
    let release!: () => void;
    let block = false;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = {
      load: async () => state,
      save: jest.fn(async (next: RuntimeState) => {
        if (block) await blocked;
        state = next;
      }),
    };
    const runtime = new WagoRuntime({
      hardwareId: 'fixture',
      prefix: 'fixture',
      pairingCode: 'fixture',
      store,
      transport: { publish: async () => undefined, subscribe: async () => undefined },
      device: new MemoryDeviceAdapter(),
    });
    await runtime.start();
    block = true;
    const first = runtime.receiveCommand(Buffer.from(JSON.stringify(validCommand())));
    await Promise.resolve();
    const commands = Array.from({ length: 2000 }, (_, i) =>
      runtime.receiveCommand(Buffer.from(JSON.stringify(validCommand({ id: `load-${i}` })))),
    );
    // Only admitted commands reserve IDs; the others never reach persistence.
    expect(state.commandIds.length).toBeLessThanOrEqual(MESSAGE_LIMITS.pendingCommands);
    block = false;
    release();
    await Promise.all([first, ...commands]);
    expect(state.commandIds.length).toBeLessThanOrEqual(MESSAGE_LIMITS.pendingCommands);
  });
});
