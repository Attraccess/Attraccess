import {
  ReaderDeliveryAwaiters,
  READER_DELIVERY_CANCELLED,
  READER_DELIVERY_CAPACITY,
  READER_WORK_LIMIT,
} from './reader-delivery-awaiters';
import { AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

const type = AttractapEventType.READER_AUTHENTICATED;
const socket = () => ({ id: 'same-id' }) as AuthenticatedWebSocket;

describe('bounded reader ACK waits', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rejects saturation without allocating timers, and releases capacity on ACK, timeout and cancellation', async () => {
    const waits = new ReaderDeliveryAwaiters();
    const client = socket();
    const pending = Array.from({ length: READER_WORK_LIMIT }, () => waits.wait(client, type, 100));
    const baseline = jest.getTimerCount();
    for (let i = 0; i < 32; i++) {
      await expect(waits.wait(client, type, 100)).rejects.toThrow(READER_DELIVERY_CAPACITY);
      expect(jest.getTimerCount()).toBe(baseline);
    }
    await waits.acknowledge(client, type);
    await Promise.all(pending);
    expect(jest.getTimerCount()).toBe(0);
    const timeout = expect(waits.wait(client, type, 100)).rejects.toThrow(/Timeout/);
    jest.advanceTimersByTime(100);
    await timeout;
    const cancelled = Array.from({ length: READER_WORK_LIMIT }, () =>
      expect(waits.wait(client, type, 100)).rejects.toThrow(READER_DELIVERY_CANCELLED),
    );
    waits.cancel(client);
    // Cancellation releases slots synchronously, before rejection continuations run.
    const next = waits.wait(client, type, 100);
    await waits.acknowledge(client, type);
    await next;
    await Promise.all(cancelled);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('isolates capacity and cancellation by exact socket even when IDs match', async () => {
    const waits = new ReaderDeliveryAwaiters();
    const old = socket();
    const newer = socket();
    const pending = Array.from({ length: READER_WORK_LIMIT }, () =>
      expect(waits.wait(old, type, 100)).rejects.toThrow(READER_DELIVERY_CANCELLED),
    );
    const next = waits.wait(newer, type, 100);
    waits.cancel(old);
    await Promise.all(pending);
    expect(jest.getTimerCount()).toBe(1);
    await waits.acknowledge(newer, type);
    await next;
    expect(jest.getTimerCount()).toBe(0);
  });
});
