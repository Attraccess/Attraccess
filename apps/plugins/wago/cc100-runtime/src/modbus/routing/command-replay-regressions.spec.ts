import { ModbusDeviceRouter } from './adapter';

import { snapshot, MemoryStore, harness, onboard, command } from './review-regressions.test-utils';
describe('ATT-973 runtime independent findings', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('preserves legacy command IDs with unknown expiry, including after new commands', async () => {
    const s = snapshot();
    const request = jest.fn(async (_unit, pdu: Buffer) => pdu);
    const store = new MemoryStore(s);
    store.saved.commandIds = ['legacy'];
    const { runtime, published } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
    await runtime.start();
    for (let i = 0; i < 101; i++) await runtime.receiveCommand(command(`new-${i}`, false));
    request.mockClear();
    await runtime.receiveCommand(command('legacy'));
    expect(request).not.toHaveBeenCalled();
    expect(published.at(-1)?.payload).toMatchObject({ status: 'duplicate' });
  });
});
